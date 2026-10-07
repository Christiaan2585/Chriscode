"""Privacy: everything held about a client (an access request), and erasing a
client's personal details while keeping the financial records the law asks you to keep."""
import json
import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import clients
from app.models.animal import Animal
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.client_document import ClientDocument
from app.models.herd import Herd
from app.models.invoice import Invoice, InvoiceItem
from app.models.note import ClientNote
from app.models.order import Order
from app.models.product import Product
from app.models.program import AnimalGroup, HerdingProgram
from app.models.quote import Quote
from app.models.user import User


class PrivacyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Jan Smit", farm_name="Rietvlei", email="jan@example.com", phone="082 555 0101",
                             address="Plot 4 Lamberts Bay", postal_address="PO Box 1", vat_number="4123456789")
        self.other = Client(name="Piet Botha", email="piet@example.com")
        self.s.add_all([self.client, self.other])
        self.s.commit()
        cid = self.client.id
        product = Product(name="Dip", price=100.0)
        self.s.add(product)
        self.s.commit()
        inv = Invoice(client_id=cid, total_amount=230.0, status="paid", number="INV0000001", notes="Jan said call before delivering")
        self.s.add_all([
            inv, Quote(client_id=cid, total_amount=50.0), Order(client_id=cid, total_amount=10.0),
            ClientNote(client_id=cid, content="Prefers WhatsApp, wife is Sarie"),
            Appointment(client_id=cid, date=datetime(2026, 10, 20), time="09:00", reason="Dosing"),
            Animal(client_id=cid, name="Bessie", species="Cows"), Herd(client_id=cid, name="Main herd"),
            ClientDocument(client_id=cid, kind="tax_certificate", filename="tax.pdf", content_type="application/pdf", size=4, data=b"%PDF"),
            ClientNote(client_id=self.other.id, content="Another farm's note"),
        ])
        self.s.commit()
        self.s.add(InvoiceItem(invoice_id=inv.id, product_id=product.id, quantity=2, unit_price=100.0, subtotal=230.0))
        program = HerdingProgram(name="Kudde 2026", client_id=cid)
        self.s.add(program)
        self.s.commit()
        self.s.add(AnimalGroup(program_id=program.id, animal_type="Ooie", group_size=120))
        self.s.commit()
        self.admin = User(name="Nico", email="nico@example.com", is_admin=True)

    def tearDown(self):
        self.s.close()

    # --- access request ---

    def export(self, client=None):
        response = clients.export_client_data((client or self.client).id, _=self.admin, session=self.s)
        return json.loads(response.body), response

    def test_the_export_holds_everything_about_that_client_and_nobody_elses(self):
        data, response = self.export()
        self.assertEqual(response.media_type, "application/json")
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertEqual(data["client"]["name"], "Jan Smit")
        self.assertEqual(data["client"]["vat_number"], "4123456789")
        self.assertEqual([n["content"] for n in data["notes"]], ["Prefers WhatsApp, wife is Sarie"])
        self.assertEqual(data["appointments"][0]["reason"], "Dosing")
        self.assertEqual(data["animals"][0]["name"], "Bessie")
        self.assertEqual(data["invoices"][0]["number"], "INV0000001")
        self.assertEqual(data["invoices"][0]["items"][0]["quantity"], 2)
        self.assertEqual(data["herding_programs"][0]["animal_groups"][0]["group_size"], 120)
        self.assertEqual(data["tax_certificate"]["filename"], "tax.pdf")
        self.assertNotIn("Another farm", json.dumps(data))
        self.assertNotIn("piet@example.com", json.dumps(data))

    def test_the_export_never_includes_the_certificate_file_itself(self):
        data, _ = self.export()
        self.assertNotIn("data", data["tax_certificate"])

    def test_unknown_client(self):
        with self.assertRaises(HTTPException) as ctx:
            clients.export_client_data(9999, _=self.admin, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)

    # --- erasing ---

    def erase(self, confirm="Rietvlei"):
        return clients.erase_client_personal_data(self.client.id, clients.EraseRequest(confirm_name=confirm), _=self.admin, session=self.s)

    def test_it_must_be_confirmed_by_typing_the_clients_name(self):
        for wrong in ("", "rietvlei x", "Piet Botha"):
            with self.assertRaises(HTTPException) as ctx:
                self.erase(wrong)
            self.assertEqual(ctx.exception.status_code, 400, wrong)
        self.s.refresh(self.client)
        self.assertEqual(self.client.name, "Jan Smit")

    def test_the_name_may_be_typed_in_any_case(self):
        self.erase("  rietvlei ")
        self.s.refresh(self.client)
        self.assertIsNotNone(self.client.erased_at)

    def test_personal_details_are_cleared_and_the_row_stays_for_the_paperwork(self):
        self.erase()
        self.s.refresh(self.client)
        self.assertEqual(self.client.name, f"Erased client #{self.client.id}")
        for field in ("email", "phone", "address", "postal_address", "vat_number", "farm_name"):
            self.assertIsNone(getattr(self.client, field), field)
        self.assertIsNotNone(self.client.erased_at)

    def test_notes_visits_animals_and_the_certificate_are_deleted(self):
        self.erase()
        cid = self.client.id
        for model in (ClientNote, Appointment, Animal, Herd, ClientDocument):
            self.assertEqual(self.s.exec(select(model).where(model.client_id == cid)).all(), [], model.__name__)

    def test_invoices_quotes_and_orders_are_kept(self):
        self.erase()
        cid = self.client.id
        self.assertEqual(len(self.s.exec(select(Invoice).where(Invoice.client_id == cid)).all()), 1)
        self.assertEqual(len(self.s.exec(select(Quote).where(Quote.client_id == cid)).all()), 1)
        self.assertEqual(len(self.s.exec(select(Order).where(Order.client_id == cid)).all()), 1)

    def test_other_clients_are_untouched(self):
        self.erase()
        self.s.refresh(self.other)
        self.assertEqual(self.other.email, "piet@example.com")
        self.assertEqual(len(self.s.exec(select(ClientNote).where(ClientNote.client_id == self.other.id)).all()), 1)

    def test_erasing_twice_is_harmless_and_an_erased_client_cannot_be_exported_as_if_real(self):
        self.erase()
        again = clients.erase_client_personal_data(self.client.id, clients.EraseRequest(confirm_name=f"Erased client #{self.client.id}"),
                                                   _=self.admin, session=self.s)
        self.assertTrue(again["erased"])
        data, _ = self.export()
        self.assertEqual(data["client"]["email"], None)


if __name__ == "__main__":
    unittest.main()
