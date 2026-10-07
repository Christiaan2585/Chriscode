"""Copy a herding program from one client and paste it into another. Made-up
sheet and data, like test_herding_costs."""
import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import select

from app.api import programs
from app.core import herding
from app.models.client import Client
from app.models.quote import Quote
from app.models.program import AnimalGroup, HerdingProgram, ProgramStep, ProgramStepProduct
from tests.test_herding_costs import CostTestCase, cost_sheet


class CopyProgramTests(CostTestCase):
    def setUp(self):
        super().setUp()
        herding.import_cost_sheet(self.s, cost_sheet())
        self.source = self.program()
        out = programs.program_schedule(self.source.id, session=self.s)  # makes the client's own copy
        self.first = out["steps"][0]
        programs.update_program_step(self.source.id, self.first["id"],
                                     programs.StepFields(stage="Our own name", color="rose", date_override=None),
                                     session=self.s)
        programs.set_step_done(self.source.id, self.first["id"], programs.StepDone(done=True), session=self.s)
        self.target_client = Client(name="Oom Koos", farm_name="Klipfontein")
        self.s.add(self.target_client)
        self.s.commit()

    def paste(self, **options):
        return programs.copy_program(self.source.id, programs.CopyProgram(client_id=self.target_client.id, **options),
                                     session=self.s)

    def steps_of(self, program):
        return herding.ordered_steps(self.s, program.id)

    def lines_of(self, program):
        ids = [s.id for s in self.steps_of(program)]
        return self.s.exec(select(ProgramStepProduct).where(ProgramStepProduct.step_id.in_(ids))).all() if ids else []

    def test_the_whole_program_goes_to_the_other_client(self):
        copy = self.paste()
        self.assertNotEqual(copy.id, self.source.id)
        self.assertEqual(copy.client_id, self.target_client.id)
        self.assertEqual((copy.name, copy.mating_date), (self.source.name, self.source.mating_date))

        theirs, mine = self.steps_of(copy), self.steps_of(self.source)
        self.assertEqual(len(theirs), len(mine))
        self.assertEqual([(s.anchor, s.offset_days, s.stage, s.color, s.section) for s in theirs],
                         [(s.anchor, s.offset_days, s.stage, s.color, s.section) for s in mine])
        self.assertEqual(len(self.lines_of(copy)), len(self.lines_of(self.source)))
        self.assertTrue(self.lines_of(copy))

    def test_it_is_a_copy_not_a_link(self):
        copy = self.paste()
        step = self.steps_of(copy)[0]
        programs.update_program_step(copy.id, step.id, programs.StepFields(stage="Changed for Koos"), session=self.s)
        self.assertEqual(self.s.get(ProgramStep, self.first["id"]).stage, "Our own name")
        self.assertFalse({s.id for s in self.steps_of(copy)} & {s.id for s in self.steps_of(self.source)})
        self.assertFalse({l.id for l in self.lines_of(copy)} & {l.id for l in self.lines_of(self.source)})

    def test_ticks_and_invoices_do_not_come_along(self):
        copy = self.paste()
        self.assertTrue(any(s.done_at for s in self.steps_of(self.source)))
        self.assertTrue(all(s.done_at is None and s.invoice_id is None for s in self.steps_of(copy)))
        self.s.refresh(self.source)
        self.assertNotEqual(copy.quote_id, self.source.quote_id)  # the copy has its own quote, a fresh Draft
        if copy.quote_id:
            self.assertEqual(self.s.get(Quote, copy.quote_id).status, "Draft")

    def test_animal_numbers_stay_with_the_farm_unless_asked_for(self):
        plain = self.paste()
        self.assertEqual(self.s.exec(select(AnimalGroup).where(AnimalGroup.program_id == plain.id)).all(), [])
        with_numbers = self.paste(include_animal_numbers=True)
        counts = {g.animal_type: g.group_size for g in
                  self.s.exec(select(AnimalGroup).where(AnimalGroup.program_id == with_numbers.id)).all()}
        self.assertEqual(counts["Ooie"], 1200)

    def test_the_source_is_left_exactly_as_it_was(self):
        before = ([(s.id, s.stage, s.done_at) for s in self.steps_of(self.source)], len(self.lines_of(self.source)))
        self.paste()
        self.assertEqual(([(s.id, s.stage, s.done_at) for s in self.steps_of(self.source)], len(self.lines_of(self.source))),
                         before)

    def test_a_dates_only_program_copies_as_dates_only(self):
        self.source.dates_only = True
        self.s.add(self.source)
        self.s.commit()
        self.assertTrue(self.paste().dates_only)

    def test_the_copy_gets_its_own_quote(self):
        copy = self.paste(include_animal_numbers=True)
        out = programs.program_schedule(copy.id, session=self.s)
        self.assertIsNotNone(out["quote"])
        self.assertNotEqual(out["quote"]["id"], programs.program_schedule(self.source.id, session=self.s)["quote"]["id"])

    def test_a_program_that_was_never_opened_copies_from_the_master(self):
        fresh = HerdingProgram(name="Fresh", client_id=self.client.id, mating_date=datetime(2026, 1, 5))
        self.s.add(fresh)
        self.s.commit()
        copy = programs.copy_program(fresh.id, programs.CopyProgram(client_id=self.target_client.id), session=self.s)
        self.assertEqual(copy.mating_date, datetime(2026, 1, 5))
        self.assertTrue(programs.program_schedule(copy.id, session=self.s)["steps"])

    def test_unknown_program_or_client(self):
        with self.assertRaises(HTTPException) as ctx:
            programs.copy_program(9999, programs.CopyProgram(client_id=self.target_client.id), session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            programs.copy_program(self.source.id, programs.CopyProgram(client_id=9999), session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_a_client_can_paste_a_program_into_their_own_page_too(self):
        copy = programs.copy_program(self.source.id, programs.CopyProgram(client_id=self.client.id), session=self.s)
        self.assertEqual(copy.client_id, self.client.id)
        self.assertNotEqual(copy.id, self.source.id)


if __name__ == "__main__":
    unittest.main()
