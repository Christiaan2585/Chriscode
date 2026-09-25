import unittest
from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine, select

from app.core import cascade
from app.models.animal import Animal
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.herd import Herd
from app.models.invoice import Invoice, InvoiceItem
from app.models.medical import MedicalRecord
from app.models.note import ClientNote
from app.models.order import Order
from app.models.product import Product
from app.models.product_dosing import ProductDosing
from app.models.program import AnimalGroup, HerdingProgram, ProgramAssignment
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models.schedule import HealthSchedule
from app.models.weight import WeightLog


class CascadeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def add(self, *rows):
        for row in rows:
            self.s.add(row)
        self.s.commit()
        for row in rows:
            self.s.refresh(row)
        return rows[0] if len(rows) == 1 else rows

    def count(self, model):
        return len(self.s.exec(select(model)).all())

    def _client_with_everything(self):
        client = self.add(Client(name="Jan"))
        herd = self.add(Herd(name="Main camp", client_id=client.id))
        animal = self.add(Animal(client_id=client.id, herd_id=herd.id, name="Bella", species="Cows"))
        self.add(
            MedicalRecord(animal_id=animal.id, diagnosis="Tick fever"),
            WeightLog(animal_id=animal.id, weight=410),
            HealthSchedule(animal_id=animal.id, treatment_name="Vaccine", frequency_days=365, last_date=datetime(2026, 1, 1)),
            Appointment(client_id=client.id, animal_id=animal.id, date=datetime(2026, 10, 1), time="09:00", reason="Visit"),
            ClientNote(client_id=client.id, content="Call back"),
        )
        program = self.add(HerdingProgram(name="Spring", client_id=client.id))
        self.add(AnimalGroup(program_id=program.id, animal_type="Goats", group_size=10),
                 ProgramAssignment(program_id=program.id, animal_id=animal.id))
        return client, animal

    def test_deleting_a_client_removes_everything_that_belongs_to_them(self):
        client, _ = self._client_with_everything()
        other = self.add(Client(name="Sarie"))
        self.add(Animal(client_id=other.id, name="Other cow", species="Cows"))

        cascade.delete_client(self.s, client)
        self.s.commit()

        for model in (Herd, MedicalRecord, WeightLog, HealthSchedule, Appointment, ClientNote,
                      HerdingProgram, AnimalGroup, ProgramAssignment):
            self.assertEqual(self.count(model), 0, model.__name__)
        self.assertEqual([a.name for a in self.s.exec(select(Animal)).all()], ["Other cow"])
        self.assertEqual([c.name for c in self.s.exec(select(Client)).all()], ["Sarie"])

    def test_a_client_with_financial_records_is_not_deleted(self):
        client, _ = self._client_with_everything()
        self.add(Invoice(client_id=client.id, total_amount=100), Quote(client_id=client.id),
                 Order(client_id=client.id))
        with self.assertRaises(cascade.InUseError) as ctx:
            cascade.delete_client(self.s, client)
        self.assertIn("1 invoice", str(ctx.exception))
        self.s.rollback()
        self.assertEqual(self.count(Client), 1)
        self.assertEqual(self.count(Animal), 1)

    def test_deleting_an_animal_removes_its_records_but_keeps_the_appointment(self):
        client, animal = self._client_with_everything()
        cascade.delete_animal(self.s, animal)
        self.s.commit()
        for model in (Animal, MedicalRecord, WeightLog, HealthSchedule, ProgramAssignment):
            self.assertEqual(self.count(model), 0, model.__name__)
        appt = self.s.exec(select(Appointment)).one()
        self.assertIsNone(appt.animal_id)
        self.assertEqual(appt.client_id, client.id)

    def test_a_product_on_an_invoice_or_quote_is_not_deleted(self):
        client = self.add(Client(name="Jan"))
        product = self.add(Product(name="Ivomec", price=100))
        invoice = self.add(Invoice(client_id=client.id))
        self.add(InvoiceItem(invoice_id=invoice.id, product_id=product.id, quantity=1, unit_price=100, subtotal=100))
        with self.assertRaises(cascade.InUseError) as ctx:
            cascade.delete_product(self.s, product)
        self.assertIn("Ivomec", str(ctx.exception))

    def test_deleting_an_unused_product_also_removes_its_dosing_rules(self):
        product = self.add(Product(name="Ivomec", price=100))
        self.add(ProductDosing(product_id=product.id, species="Cows", basis="per_kg"))
        cascade.delete_product(self.s, product)
        self.s.commit()
        self.assertEqual(self.count(Product), 0)
        self.assertEqual(self.count(ProductDosing), 0)

    def test_deleting_a_herd_unlinks_its_animals(self):
        _, animal = self._client_with_everything()
        herd = self.s.exec(select(Herd)).one()
        cascade.delete_herd(self.s, herd)
        self.s.commit()
        self.s.refresh(animal)
        self.assertIsNone(animal.herd_id)
        self.assertEqual(self.count(Herd), 0)


if __name__ == "__main__":
    unittest.main()
