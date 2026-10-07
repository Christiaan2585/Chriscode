"""Herding programs and quotes as one system: a program's quote stays
linked to it, is laid out by step, can be updated from the program, and
its status shows on the program's steps. Made-up data, like
test_herding_costs."""
import io
import unittest
from collections import defaultdict
from datetime import date

from fastapi import HTTPException
from pypdf import PdfReader
from sqlmodel import select

from app.api import programs, quotes
from app.core import herding
from app.models.program import ProgramStep
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from tests.test_herding_costs import CostTestCase, cost_sheet


class ProgramQuoteTests(CostTestCase):
    def setUp(self):
        super().setUp()
        herding.import_cost_sheet(self.s, cost_sheet())
        self.prog = self.program()
        self.sched = herding.schedule(self.s, self.prog, today=date(2025, 11, 1))

    def lines(self, steps=None):
        return [l for s in self.sched["steps"] if steps is None or s["id"] in steps for l in s["products"] if l["buy"]]

    def quote(self, line_ids=None):
        ids = line_ids or [l["id"] for l in self.lines()]
        return programs.quote_from_program(self.prog.id, programs.ProgramQuoteRequest(line_ids=ids),
                                           session=self.s, user=self.user)["quote"]

    def items(self, quote):
        return self.s.exec(select(QuoteItem).where(QuoteItem.quote_id == quote.id)).all()

    def test_quote_is_linked_and_has_a_line_per_step_and_product(self):
        quote = self.quote()
        self.assertEqual(quote.program_id, self.prog.id)
        expected = defaultdict(float)
        for step in self.sched["steps"]:
            for line in step["products"]:
                if line["buy"]:
                    expected[(step["id"], line["product_id"])] += line["buy"]
        got = {(i.program_step_id, i.product_id): i.quantity for i in self.items(quote)}
        self.assertEqual(got, dict(expected))

    def test_schedule_shows_the_quote_on_its_steps(self):
        first = self.sched["steps"][0]
        quote = self.quote([l["id"] for l in first["products"] if l["buy"]] or [self.lines()[0]["id"]])
        quote.status = "Accepted"
        self.s.add(quote)
        self.s.commit()
        out = programs.program_schedule(self.prog.id, session=self.s)
        self.assertEqual([(q["id"], q["status"]) for q in out["quotes"]], [(quote.id, "Accepted")])
        quoted = [s for s in out["steps"] if s["quotes"]]
        self.assertTrue(quoted)
        self.assertEqual(quoted[0]["quotes"][0]["status"], "Accepted")

    def test_update_from_program_after_a_dose_change(self):
        step = next(s for s in self.sched["steps"] if (s["anchor"], s["offset_days"]) == ("lambing_start", 28))
        quote = self.quote([l["id"] for l in step["products"]])
        number = quote.number
        vaccine = next(l for l in step["products"] if l["product_id"] == self.vaccine.id)
        programs.update_program_line(self.prog.id, vaccine["id"], programs.StepProductFields(dose=2), session=self.s)
        programs.refresh_program_quote(self.prog.id, quote.id, session=self.s)
        item = next(i for i in self.items(quote) if i.product_id == self.vaccine.id)
        self.assertEqual(item.quantity, 11)  # 1320 lambs x 2 ml / 250 ml = 10.56 -> 11
        self.assertEqual(self.s.get(Quote, quote.id).number, number)

    def test_accepted_quote_is_not_rewritten(self):
        quote = self.quote()
        quote.status = "Accepted"
        self.s.add(quote)
        self.s.commit()
        with self.assertRaises(HTTPException) as ctx:
            programs.refresh_program_quote(self.prog.id, quote.id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_quote_of_another_program_is_refused(self):
        quote = self.quote()
        other = self.program()
        with self.assertRaises(HTTPException) as ctx:
            programs.refresh_program_quote(other.id, quote.id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_start_again_keeps_the_quote_linked_to_its_steps(self):
        quote = self.quote()
        programs.reset_from_master(self.prog.id, session=self.s)
        own = {s.id for s in herding.ordered_steps(self.s, self.prog.id)}
        self.assertTrue(all(i.program_step_id in own for i in self.items(quote)))
        programs.refresh_program_quote(self.prog.id, quote.id, session=self.s)  # still works

    def test_quote_pdf_is_laid_out_by_step(self):
        quote = self.quote()
        text = "".join(p.extract_text() for p in PdfReader(io.BytesIO(quotes.download_quote_pdf(quote.id, session=self.s).body)).pages)
        self.assertIn("Medisyne boks", text)
        self.assertIn("1STE ENTING", text)

    def test_deleting_the_program_keeps_its_quote(self):
        quote = self.quote()
        programs.delete_program(self.prog.id, session=self.s)
        kept = self.s.get(Quote, quote.id)
        self.assertIsNotNone(kept)
        self.assertIsNone(kept.program_id)


if __name__ == "__main__":
    unittest.main()
