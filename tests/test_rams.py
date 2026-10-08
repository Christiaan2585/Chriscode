"""Ram ID tags: each farm's rams with their ear-tag number, name, breed, birth date and notes."""
import unittest
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import rams
from app.core import audit
from app.models.animal import Animal
from app.models.client import Client
from app.models.medical import MedicalRecord
from app.models import user, invoice, quote, order, purchase_order, program, herd, appointment, schedule, weight, note  # noqa: F401  (every table must exist)


class RamTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.kraal = Client(name="Piet", farm_name="Kraal Plaas")
        self.dam = Client(name="Jan", farm_name="Dam Plaas")
        self.s.add_all([self.kraal, self.dam])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def add(self, tag, client=None, **extra):
        return rams.create_ram(rams.RamCreate(client_id=(client or self.kraal).id, tag_id=tag, **extra), session=self.s)

    def test_a_ram_gets_its_tag_and_sensible_defaults(self):
        ram = self.add("  ZA 1234 ")
        self.assertEqual(ram.tag_id, "ZA 1234")
        self.assertEqual((ram.species, ram.gender, ram.name), ("Sheep", "Ram", "Ram ZA 1234"))
        self.assertEqual(ram.client_id, self.kraal.id)

    def test_name_breed_birth_date_and_notes_are_kept(self):
        ram = self.add("A7", name="Oupa", breed="Dorper", birth_date="2023-08-15", notes="Stud ram, bought at auction")
        self.assertEqual((ram.name, ram.breed, ram.notes), ("Oupa", "Dorper", "Stud ram, bought at auction"))
        self.assertEqual(ram.birth_date.date().isoformat(), "2023-08-15")
        self.assertEqual(ram.age_group, "Adult")

    def test_a_young_ram_is_young(self):
        young = (datetime.utcnow() - timedelta(days=150)).date().isoformat()
        self.assertEqual(self.add("Y1", birth_date=young).age_group, "Young")

    def test_the_tag_is_needed_and_must_be_sensible(self):
        for bad in ("", "   ", "x" * 41, "AB\ncd", "A\x00B"):
            with self.assertRaises(HTTPException) as ctx:
                self.add(bad)
            self.assertEqual(ctx.exception.status_code, 422, repr(bad))

    def test_a_farm_cannot_use_a_tag_twice_but_two_farms_can(self):
        self.add("1234")
        with self.assertRaises(HTTPException) as ctx:
            self.add(" 1234 ")
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("1234", ctx.exception.detail)
        with self.assertRaises(HTTPException):
            self.add("za-1")  # not yet used...
            self.add("ZA-1")  # ...but the same tag in other capitals is the same tag
        self.add("1234", client=self.dam)  # another farm: fine

    def test_an_unknown_farm_is_refused(self):
        with self.assertRaises(HTTPException) as ctx:
            rams.create_ram(rams.RamCreate(client_id=999, tag_id="1"), session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_lists_show_only_rams_and_only_that_farms(self):
        self.add("K1")
        self.add("K2")
        self.add("D1", client=self.dam)
        self.s.add(Animal(client_id=self.kraal.id, name="Bella", species="Sheep", gender="Ewe", tag_id="E9"))
        self.s.add(Animal(client_id=self.kraal.id, name="Bull", species="Cows", gender="Ram", tag_id="C1"))  # not sheep
        self.s.commit()
        self.assertEqual(sorted(r.tag_id for r in rams.read_client_rams(self.kraal.id, session=self.s)), ["K1", "K2"])
        everyone = rams.read_rams(session=self.s)
        self.assertEqual(sorted((r.tag_id, r.client_id) for r in everyone), [("D1", self.dam.id), ("K1", self.kraal.id), ("K2", self.kraal.id)])

    def test_an_edit_changes_only_what_was_sent(self):
        ram = self.add("K1", name="Oupa", breed="Dorper", notes="note")
        rams.update_ram(ram.id, rams.RamPatch(breed="Merino"), session=self.s)
        again = self.s.get(Animal, ram.id)
        self.assertEqual((again.tag_id, again.name, again.breed, again.notes), ("K1", "Oupa", "Merino", "note"))
        rams.update_ram(ram.id, rams.RamPatch(notes=None, tag_id="K1B"), session=self.s)  # sent as empty: cleared
        again = self.s.get(Animal, ram.id)
        self.assertEqual((again.tag_id, again.notes), ("K1B", None))

    def test_an_edit_cannot_take_a_tag_another_ram_on_the_farm_has(self):
        self.add("K1")
        other = self.add("K2")
        with self.assertRaises(HTTPException) as ctx:
            rams.update_ram(other.id, rams.RamPatch(tag_id="k1"), session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)
        rams.update_ram(other.id, rams.RamPatch(tag_id="K2"), session=self.s)  # keeping its own tag is fine

    def test_deleting_a_ram_removes_it_and_its_records(self):
        ram = self.add("K1")
        self.s.add(MedicalRecord(animal_id=ram.id, diagnosis="Ticks", treatment="Dip", date=datetime.utcnow()))
        self.s.commit()
        rams.delete_ram(ram.id, session=self.s)
        self.assertEqual(self.s.exec(select(Animal)).all(), [])
        self.assertEqual(self.s.exec(select(MedicalRecord)).all(), [])

    def test_this_page_never_touches_animals_that_are_not_rams(self):
        ewe = Animal(client_id=self.kraal.id, name="Bella", species="Sheep", gender="Ewe", tag_id="E9")
        self.s.add(ewe)
        self.s.commit()
        for call in (lambda: rams.delete_ram(ewe.id, session=self.s), lambda: rams.update_ram(ewe.id, rams.RamPatch(name="x"), session=self.s)):
            with self.assertRaises(HTTPException) as ctx:
                call()
            self.assertEqual(ctx.exception.status_code, 404)

    def test_the_activity_log_describes_ram_changes(self):
        self.assertEqual(audit.describe("POST", "/rams/")["action"], "Added ram")
        self.assertEqual(audit.describe("DELETE", "/rams/4")["action"], "Deleted ram")


if __name__ == "__main__":
    unittest.main()
