"""Every client starts with the standard herding program: the master program,
dated from the first mating day written in the imported sheet, editable like
any other. Made-up sheet and data (the real programme is the business's)."""
import unittest
from datetime import date, datetime

from sqlmodel import select

from app.api import clients, programs
from app.core import herding
from app.models.client import Client
from app.models.program import HerdingProgram, ProgramStep, ProgramStepProduct
from tests.test_herding import HerdingTestCase, sheet_like_the_business_uses
from tests.test_herding_costs import CostTestCase, cost_sheet


class StandardProgramTests(HerdingTestCase):
    def programs_of(self, client):
        return self.s.exec(select(HerdingProgram).where(HerdingProgram.client_id == client.id)).all()

    def import_master(self):
        herding.import_template(self.s, sheet_like_the_business_uses())

    def test_the_import_remembers_the_sheets_first_mating_day(self):
        self.assertIsNone(herding.get_template(self.s).mating_date)
        self.import_master()
        self.assertEqual(herding.get_template(self.s).mating_date, datetime(2025, 12, 1))

    def test_nothing_is_made_until_there_is_a_master_program(self):
        self.assertEqual(herding.ensure_standard_programs(self.s), 0)
        self.assertEqual(self.programs_of(self.client), [])
        self.s.refresh(self.client)
        self.assertIsNone(self.client.standard_program_at)  # still waiting for a master program

    def test_every_client_without_a_program_gets_one_with_the_sheets_date(self):
        other = Client(name="Oom Koos")
        self.s.add(other)
        self.s.commit()
        self.import_master()

        self.assertEqual(herding.ensure_standard_programs(self.s), 2)

        for client in (self.client, other):
            (program,) = self.programs_of(client)
            self.assertEqual(program.name, herding.get_template(self.s).name)
            self.assertEqual(program.mating_date, datetime(2025, 12, 1))

    def test_all_the_sheets_steps_show_up_in_the_clients_program_and_can_be_edited(self):
        self.import_master()
        herding.ensure_standard_programs(self.s)
        (program,) = self.programs_of(self.client)

        out = programs.program_schedule(program.id, session=self.s)
        self.assertEqual(len(out["steps"]), len(herding.ordered_steps(self.s)))

        step = out["steps"][0]
        programs.update_program_step(program.id, step["id"], programs.StepFields(stage="My own name", offset_days=3),
                                     session=self.s)
        self.assertEqual(self.s.get(ProgramStep, step["id"]).stage, "My own name")
        self.assertNotIn("My own name", [m.stage for m in herding.ordered_steps(self.s)])  # the master is untouched

    def test_a_client_who_already_has_a_program_keeps_just_that_one(self):
        mine = self.program()
        self.import_master()
        self.assertEqual(herding.ensure_standard_programs(self.s), 0)
        self.assertEqual([p.id for p in self.programs_of(self.client)], [mine.id])

    def test_a_deleted_standard_program_does_not_come_back(self):
        self.import_master()
        herding.ensure_standard_programs(self.s)
        (program,) = self.programs_of(self.client)
        programs.delete_program(program.id, session=self.s)

        self.assertEqual(herding.ensure_standard_programs(self.s), 0)
        self.assertEqual(self.programs_of(self.client), [])

    def test_running_it_again_changes_nothing(self):
        self.import_master()
        herding.ensure_standard_programs(self.s)
        self.assertEqual(herding.ensure_standard_programs(self.s), 0)
        self.assertEqual(len(self.programs_of(self.client)), 1)

    def test_a_new_client_gets_the_standard_program_straight_away(self):
        self.import_master()
        created = clients.create_client(Client(name="Nuwe Klient", standard_program_at=datetime(2000, 1, 1)), session=self.s)
        (program,) = self.programs_of(created)
        self.assertEqual(program.mating_date, datetime(2025, 12, 1))

    def test_a_new_client_before_any_master_program_gets_theirs_when_it_is_imported(self):
        created = clients.create_client(Client(name="Nuwe Klient"), session=self.s)
        self.assertEqual(self.programs_of(created), [])
        self.import_master()
        herding.ensure_standard_programs(self.s)
        self.assertEqual(len(self.programs_of(created)), 1)

    def test_a_master_imported_before_its_date_was_kept_waits_for_the_sheet_to_be_imported_again(self):
        self.import_master()
        template = herding.get_template(self.s)
        template.mating_date = None  # how a master imported by an older version looks
        self.s.add(template)
        self.s.commit()

        self.assertEqual(herding.ensure_standard_programs(self.s), 0)
        self.assertEqual(self.programs_of(self.client), [])

        self.import_master()  # the sheet is imported again: now its date is known
        self.assertEqual(herding.ensure_standard_programs(self.s), 1)
        (program,) = self.programs_of(self.client)
        self.assertEqual(program.mating_date, datetime(2025, 12, 1))


class ScanDateTests(HerdingTestCase):
    def scan_steps(self, program_id=None):
        return [s for s in herding.ordered_steps(self.s, program_id) if s.stage == herding.SCAN_STAGE]

    def setUp(self):
        super().setUp()
        herding.import_template(self.s, sheet_like_the_business_uses())

    def test_the_scan_date_is_77_days_after_the_rams_go_in(self):
        herding.ensure_standard_programs(self.s)
        (master,) = self.scan_steps()
        self.assertEqual((master.anchor, master.offset_days), ("mating_start", 77))

        program = self.s.exec(select(HerdingProgram).where(HerdingProgram.client_id == self.client.id)).one()
        out = programs.program_schedule(program.id, session=self.s)
        (scan,) = [st for st in out["steps"] if st["stage"] == herding.SCAN_STAGE]
        self.assertEqual(scan["date"], date(2026, 2, 16))  # 1 Dec 2025 + 77 days

    def test_it_is_added_once_and_a_deleted_one_stays_deleted(self):
        herding.ensure_standard_programs(self.s)
        herding.ensure_standard_programs(self.s)
        self.assertEqual(len(self.scan_steps()), 1)

        programs.delete_template_step(self.scan_steps()[0].id, session=self.s, _=None)
        herding.ensure_standard_programs(self.s)
        self.assertEqual(self.scan_steps(), [])

    def test_importing_the_sheet_again_does_not_remove_it(self):
        herding.ensure_standard_programs(self.s)
        herding.import_template(self.s, sheet_like_the_business_uses())
        self.assertEqual(len(self.scan_steps()), 1)

    def test_a_program_that_already_has_its_own_copy_gets_it_too(self):
        mine = self.program()
        programs.program_schedule(mine.id, session=self.s)  # makes the client's copy
        herding.ensure_standard_programs(self.s)
        (own,) = self.scan_steps(mine.id)
        self.assertEqual((own.anchor, own.offset_days), ("mating_start", 77))

    def test_the_scan_timing_can_be_edited_per_client(self):
        herding.ensure_standard_programs(self.s)
        program = self.s.exec(select(HerdingProgram).where(HerdingProgram.client_id == self.client.id)).one()
        programs.program_schedule(program.id, session=self.s)
        (own,) = self.scan_steps(program.id)
        programs.update_program_step(program.id, own.id, programs.StepFields(offset_days=80), session=self.s)
        self.assertEqual(self.scan_steps()[0].offset_days, 77)  # the master's is untouched
        self.assertEqual(self.s.get(ProgramStep, own.id).offset_days, 80)

    def test_nothing_is_added_while_there_is_no_master_program(self):
        for step in herding.ordered_steps(self.s):
            herding.delete_step(self.s, step)
        self.s.commit()
        self.assertFalse(herding.ensure_scan_step(self.s))
        self.assertEqual(herding.ordered_steps(self.s), [])


class DatesOnlyTests(CostTestCase):
    """The standard program is only the dates (and their notes): the master's
    product lines stay in the master, and products are added per client."""

    def setUp(self):
        super().setUp()
        herding.import_cost_sheet(self.s, cost_sheet())
        template = herding.get_template(self.s)
        template.mating_date = datetime(2025, 12, 1)
        self.s.add(template)
        self.s.commit()

    def lines_of(self, program):
        steps = [s.id for s in herding.ordered_steps(self.s, program.id)]
        return self.s.exec(select(ProgramStepProduct).where(ProgramStepProduct.step_id.in_(steps))).all() if steps else []

    def test_the_master_has_product_lines_but_the_standard_program_gets_none(self):
        self.assertTrue(self.s.exec(select(ProgramStepProduct)).first())
        herding.ensure_standard_programs(self.s)
        program = self.s.exec(select(HerdingProgram).where(HerdingProgram.client_id == self.client.id)).one()
        out = programs.program_schedule(program.id, session=self.s)

        self.assertTrue(out["steps"])
        self.assertEqual(self.lines_of(program), [])
        self.assertTrue(all(step["products"] == [] for step in out["steps"]))
        self.assertIsNone(out["quote"])  # nothing to quote until products are added

    def test_start_again_from_the_master_keeps_it_dates_only(self):
        herding.ensure_standard_programs(self.s)
        program = self.s.exec(select(HerdingProgram).where(HerdingProgram.client_id == self.client.id)).one()
        programs.program_schedule(program.id, session=self.s)
        programs.reset_from_master(program.id, session=self.s)
        self.assertEqual(self.lines_of(program), [])

    def test_a_program_made_by_hand_still_copies_the_products(self):
        mine = self.program()
        programs.program_schedule(mine.id, session=self.s)
        self.assertTrue(self.lines_of(mine))


if __name__ == "__main__":
    unittest.main()
