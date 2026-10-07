"""A herding program and its quote are one thing: every client program has
one quote for the whole year, kept in step with the program both ways;
accepting the quote locks the program, and each date is then invoiced from
the agreed lines. Made-up data, like test_herding_costs."""
import io
import unittest
from datetime import date

from fastapi import HTTPException
from pypdf import PdfReader
from sqlmodel import select

from app.api import programs, quotes
from app.core import herding
from app.models.invoice import Invoice, InvoiceItem
from app.models.program import HerdingProgram, ProgramStep, ProgramStepProduct
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from tests.test_herding_costs import CostTestCase, cost_sheet


class ProgramQuoteTests(CostTestCase):
    def setUp(self):
        super().setUp()
        herding.import_cost_sheet(self.s, cost_sheet())
        self.prog = self.program()

    def schedule(self):
        return programs.program_schedule(self.prog.id, session=self.s)

    def quote(self):
        self.s.refresh(self.prog)
        return self.s.get(Quote, self.prog.quote_id)

    def items(self):
        return self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == self.quote().id)).all()

    def line(self, product, out=None):
        out = out or self.schedule()
        return next(l for s in out["steps"] for l in s["products"] if l["product_id"] == product.id)

    def test_every_program_has_one_quote_matching_it(self):
        out = self.schedule()
        quote = self.quote()
        self.assertEqual(out["quote"]["id"], quote.id)
        self.assertEqual((quote.client_id, quote.program_id, quote.status), (self.client.id, self.prog.id, "Draft"))
        want = sorted((l["id"], l["buy"]) for s in out["steps"] for l in s["products"] if l["buy"])
        self.assertEqual(sorted((i.program_line_id, i.quantity) for i in self.items()), want)
        self.schedule()  # looking again changes nothing
        self.assertEqual(len(self.s.exec(select(Quote)).all()), 1)

    def test_a_program_change_changes_the_quote(self):
        out = self.schedule()
        number = self.quote().number
        vaccine = next(l for s in out["steps"] if (s["anchor"], s["offset_days"]) == ("lambing_start", 28)
                       for l in s["products"] if l["product_id"] == self.vaccine.id)
        programs.update_program_line(self.prog.id, vaccine["id"], programs.StepProductFields(dose=2), session=self.s)
        item = next(i for i in self.items() if i.program_line_id == vaccine["id"])
        self.assertEqual(item.quantity, 11)  # 1320 x 2 ml / 250 ml = 10.56 -> 11 bottles
        programs.set_head_counts(self.prog.id, programs.HeadCounts(counts={"Lammers": 250}), session=self.s)
        item = next(i for i in self.items() if i.program_line_id == vaccine["id"])
        self.assertEqual(item.quantity, 2)  # 250 x 2 / 250
        self.assertEqual(self.quote().number, number)

    def test_agreed_quantity_price_and_discount_are_shared(self):
        line = self.line(self.drench)
        programs.update_program_line(self.prog.id, line["id"], programs.StepProductFields(
            quantity_override=5, unit_price=4000, discount_percent=10), session=self.s)
        item = next(i for i in self.items() if i.program_line_id == line["id"])
        self.assertEqual((item.quantity, item.unit_price, item.discount_percent), (5, 4000, 10))
        line = self.line(self.drench)
        self.assertEqual((line["buy"], line["cost_buy"]), (5, 18000.0))  # 5 x 4000, less 10%

    def test_removing_a_line_on_the_quote_removes_it_from_the_program(self):
        line = self.line(self.drench)
        item = next(i for i in (self.schedule() and self.items()) if i.program_line_id == line["id"])
        quotes.delete_quote_item(item.id, session=self.s)
        self.assertIsNone(self.s.get(ProgramStepProduct, line["id"]))
        self.assertNotIn(self.drench.id, [l["product_id"] for s in self.schedule()["steps"] for l in s["products"]])

    def test_adding_a_line_on_the_quote_adds_it_to_the_program(self):
        self.schedule()
        quotes.add_quote_item(self.quote().id, QuoteItem(product_id=self.drench.id, quantity=3, unit_price=0),
                              session=self.s)
        out = self.schedule()
        extra = [l for s in out["steps"] for l in s["products"] if l["fixed_quantity"] == 3 and l["product_id"] == self.drench.id]
        self.assertEqual(len(extra), 1)
        self.assertIn(extra[0]["id"], [i.program_line_id for i in self.items()])

    def test_accepted_quote_locks_the_program_until_it_is_draft_again(self):
        line = self.line(self.drench)
        programs.set_quote_status(self.prog.id, programs.QuoteStatus(status="Accepted"), session=self.s)
        with self.assertRaises(HTTPException) as ctx:
            programs.update_program_line(self.prog.id, line["id"], programs.StepProductFields(dose=1), session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)
        with self.assertRaises(HTTPException):
            programs.set_head_counts(self.prog.id, programs.HeadCounts(counts={"Ooie": 1}), session=self.s)
        with self.assertRaises(HTTPException):
            quotes.delete_quote_item(self.items()[0].id, session=self.s)
        programs.set_quote_status(self.prog.id, programs.QuoteStatus(status="Draft"), session=self.s)
        programs.update_program_line(self.prog.id, line["id"], programs.StepProductFields(dose=1), session=self.s)

    def test_each_date_is_invoiced_from_the_accepted_quote(self):
        out = self.schedule()
        step = next(s for s in out["steps"] if (s["anchor"], s["offset_days"]) == ("lambing_start", 28))
        with self.assertRaises(HTTPException):  # not accepted yet
            programs.invoice_program_step(self.prog.id, step["id"], session=self.s, user=self.user)
        programs.set_quote_status(self.prog.id, programs.QuoteStatus(status="Accepted"), session=self.s)
        invoice = programs.invoice_program_step(self.prog.id, step["id"], session=self.s, user=self.user)
        lines = self.s.exec(select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id)).all()
        agreed = [i for i in self.items() if i.program_step_id == step["id"]]
        self.assertEqual(sorted((l.product_id, l.quantity, l.unit_price) for l in lines),
                         sorted((i.product_id, i.quantity, i.unit_price) for i in agreed))
        self.assertEqual(self.s.get(ProgramStep, step["id"]).invoice_id, invoice.id)
        with self.assertRaises(HTTPException) as ctx:  # only once
            programs.invoice_program_step(self.prog.id, step["id"], session=self.s, user=self.user)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_the_programs_quote_cannot_be_deleted_on_its_own(self):
        self.schedule()
        with self.assertRaises(HTTPException) as ctx:
            quotes.delete_quote(self.quote().id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_start_again_keeps_the_same_quote_in_step(self):
        self.schedule()
        quote_id = self.quote().id
        programs.reset_from_master(self.prog.id, session=self.s)
        own = {l.id for l in self.s.exec(select(ProgramStepProduct).join(ProgramStep, ProgramStep.id == ProgramStepProduct.step_id)
                                         .where(ProgramStep.program_id == self.prog.id)).all()}
        self.assertEqual(self.quote().id, quote_id)
        self.assertTrue(self.items() and all(i.program_line_id in own for i in self.items()))

    def test_quote_pdf_is_laid_out_by_step(self):
        self.schedule()
        text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(quotes.download_quote_pdf(self.quote().id, session=self.s).body)).pages)
        self.assertIn("Medisyne boks", text)
        self.assertIn("1STE ENTING", text)

    def test_deleting_the_program_keeps_a_sent_quote(self):
        self.schedule()
        quote_id = self.quote().id
        programs.set_quote_status(self.prog.id, programs.QuoteStatus(status="Sent"), session=self.s)
        programs.delete_program(self.prog.id, session=self.s)
        kept = self.s.get(Quote, quote_id)
        self.assertIsNotNone(kept)
        self.assertIsNone(kept.program_id)

    def test_deleting_the_program_deletes_a_draft_quote(self):
        self.schedule()
        quote_id = self.quote().id
        programs.delete_program(self.prog.id, session=self.s)
        self.assertIsNone(self.s.get(Quote, quote_id))
        self.assertEqual(self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == quote_id)).all(), [])

    def test_a_client_with_a_program_can_still_be_deleted(self):
        from app.core import cascade
        self.schedule()
        quote_id = self.quote().id
        cascade.delete_client(self.s, self.client)
        self.s.commit()
        self.assertIsNone(self.s.get(Quote, quote_id))

    def test_a_sent_program_quote_still_protects_the_client(self):
        from app.core import cascade
        self.schedule()
        programs.set_quote_status(self.prog.id, programs.QuoteStatus(status="Sent"), session=self.s)
        with self.assertRaises(cascade.InUseError):
            cascade.delete_client(self.s, self.client)

    def test_a_program_without_a_mating_date_has_no_quote_yet(self):
        bare = HerdingProgram(name="Later", client_id=self.client.id)
        self.s.add(bare)
        self.s.commit()
        self.assertIsNone(programs.program_schedule(bare.id, session=self.s)["quote"])


if __name__ == "__main__":
    unittest.main()
