import asyncio
import io
import unittest

from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.api.programs import import_programs
from app.models.animal import Animal  # noqa: F401 - tables ProgramAssignment references
from app.models.herd import Herd  # noqa: F401
from app.models.client import Client
from app.models.program import AnimalGroup, HerdingProgram

HEADER = "Client,Program Name,Animal Type,Count,Goal\n"


class ProgramImportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.jan = Client(name="Jan Smit", email="jan@example.com")
        self.piet = Client(name="Piet Botha", email="piet@example.com")
        self.s.add(self.jan)
        self.s.add(self.piet)
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def run_import(self, rows):
        upload = UploadFile(file=io.BytesIO((HEADER + rows).encode()), filename="programs.csv")
        return asyncio.run(import_programs(file=upload, session=self.s))

    def programs(self):
        return self.s.exec(select(HerdingProgram)).all()

    def groups(self, program):
        rows = self.s.exec(select(AnimalGroup).where(AnimalGroup.program_id == program.id)).all()
        return sorted((g.animal_type, g.group_size) for g in rows)

    def test_reimporting_the_same_file_changes_nothing(self):
        rows = "Jan Smit,Winter,Goats,12,Graze\nJan Smit,Winter,Sheep,5,\n"
        self.run_import(rows)
        result = self.run_import(rows)

        [program] = self.programs()
        self.assertEqual(self.groups(program), [("Goats", 12), ("Sheep", 5)])
        self.assertEqual((result["created"], result["updated"]), (0, 0))
        self.assertEqual(result["errors"], [])

    def test_reimport_updates_counts_and_adds_new_types(self):
        self.run_import("Jan Smit,Winter,Goats,12,\n")
        self.run_import("Jan Smit,Winter,goats,20,\nJan Smit,Winter,Cattle,3,\n")

        [program] = self.programs()
        self.assertEqual(self.groups(program), [("Cattle", 3), ("Goats", 20)])

    def test_matches_a_program_created_by_hand(self):
        existing = HerdingProgram(name="Winter Grazing", client_id=self.jan.id)
        self.s.add(existing)
        self.s.commit()

        self.run_import("jan@example.com,winter grazing,Goats,7,\n")

        [program] = self.programs()
        self.assertEqual(program.id, existing.id)
        self.assertEqual(self.groups(program), [("Goats", 7)])

    def test_same_program_name_for_another_client_stays_separate(self):
        self.run_import("Jan Smit,Winter,Goats,12,\nPiet Botha,Winter,Goats,4,\n")

        self.assertEqual(len(self.programs()), 2)

    def test_repeated_type_within_one_file_is_summed(self):
        self.run_import("Jan Smit,Winter,Goats,12,\nJan Smit,Winter,Goats,3,\n")
        self.run_import("Jan Smit,Winter,Goats,12,\nJan Smit,Winter,Goats,3,\n")

        [program] = self.programs()
        self.assertEqual(self.groups(program), [("Goats", 15)])

    def test_blank_goal_does_not_wipe_an_existing_one(self):
        self.run_import("Jan Smit,Winter,Goats,12,Graze the camp\n")
        self.run_import("Jan Smit,Winter,Goats,12,\n")

        [program] = self.programs()
        self.assertEqual(program.goal, "Graze the camp")


if __name__ == "__main__":
    unittest.main()
