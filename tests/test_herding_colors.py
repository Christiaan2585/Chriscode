"""Every herding program and every step of it can be given a colour from a
fixed palette (a name, so the screen can pick a shade that reads well on the
light and dark theme). Made-up data, like test_herding_costs."""
import unittest

from pydantic import ValidationError

from app.api import programs
from app.core import herding
from app.models.program import ProgramStep
from tests.test_herding_costs import CostTestCase, cost_sheet


class ColorTests(CostTestCase):
    def setUp(self):
        super().setUp()
        herding.import_cost_sheet(self.s, cost_sheet())
        self.prog = self.program()

    def steps(self):
        return programs.program_schedule(self.prog.id, session=self.s)["steps"]

    def test_a_step_can_be_coloured_and_cleared(self):
        step = self.steps()[0]
        self.assertIsNone(step["color"])

        programs.update_program_step(self.prog.id, step["id"], programs.StepFields(color="rose"), session=self.s)
        self.assertEqual(self.steps()[0]["color"], "rose")

        programs.update_program_step(self.prog.id, step["id"], programs.StepFields(color=None), session=self.s)
        self.assertIsNone(self.steps()[0]["color"])

    def test_only_palette_colours_are_accepted(self):
        for bad in ("#ff0000", "red; background:url(x)", "notacolour", ""):
            with self.assertRaises(ValidationError):
                programs.StepFields(color=bad)
            with self.assertRaises(ValidationError):
                programs.ProgramFields(color=bad)
        for good in herding.COLORS:
            programs.StepFields(color=good)

    def test_renaming_a_step_keeps_its_colour(self):
        step = self.steps()[0]
        programs.update_program_step(self.prog.id, step["id"], programs.StepFields(color="teal"), session=self.s)
        programs.update_program_step(self.prog.id, step["id"], programs.StepFields(stage="Renamed"), session=self.s)
        first = self.steps()[0]
        self.assertEqual((first["stage"], first["color"]), ("Renamed", "teal"))

    def test_a_clients_copy_starts_with_the_masters_colour_and_then_goes_its_own_way(self):
        master = herding.ordered_steps(self.s)[0]
        master.color = "violet"
        self.s.add(master)
        self.s.commit()

        mine = next(s for s in self.steps() if s["source_step_id"] == master.id)
        self.assertEqual(mine["color"], "violet")

        programs.update_program_step(self.prog.id, mine["id"], programs.StepFields(color="amber"), session=self.s)
        self.s.refresh(master)
        self.assertEqual(master.color, "violet")
        self.assertEqual(next(s for s in self.steps() if s["id"] == mine["id"])["color"], "amber")

    def test_the_master_steps_can_be_coloured_too(self):
        master = herding.ordered_steps(self.s)[0]
        programs.update_template_step(master.id, programs.StepFields(color="sky"), session=self.s, _=None)
        self.s.refresh(master)
        self.assertEqual(master.color, "sky")
        self.assertEqual(self.s.get(ProgramStep, master.id).color, "sky")

    def test_a_program_can_be_renamed_and_coloured(self):
        programs.update_program(self.prog.id, programs.ProgramFields(name="Ooie 2027", color="emerald"), session=self.s)
        self.s.refresh(self.prog)
        self.assertEqual((self.prog.name, self.prog.color), ("Ooie 2027", "emerald"))

        programs.update_program(self.prog.id, programs.ProgramFields(color=None), session=self.s)
        self.s.refresh(self.prog)
        self.assertIsNone(self.prog.color)
        self.assertEqual(self.prog.name, "Ooie 2027")


if __name__ == "__main__":
    unittest.main()
