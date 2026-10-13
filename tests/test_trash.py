"""The recycle bin: an admin delete is kept for 30 days and can be put back, with everything that went with it."""
import unittest
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import clients, invoices, products, trash as trash_api
from app.core import stock, trash
from app.models.appointment import Appointment
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.note import ClientNote
from app.models.payment import Payment
from app.models.product import Product
from app.models.trash import TrashItem
from app.models.user import User


class TrashCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(BusinessSettings(id=1, trading_name="Test"))
        self.user = User(name="Nico", email="n@example.com", is_admin=True)
        self.client = Client(name="Jan", farm_name="Rietvlei")
        self.dip = Product(name="Dip", price=115.0)
        self.s.add_all([self.user, self.client, self.dip])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def make_invoice(self):
        inv = invoices.create_invoice(Invoice(client_id=self.client.id), self.s, self.user)
        invoices.add_invoice_item(InvoiceItem(invoice_id=inv.id, product_id=self.dip.id, quantity=2, unit_price=100.0), self.s)
        self.s.add(Payment(invoice_id=inv.id, client_id=self.client.id, amount=50.0, date=datetime.utcnow()))
        self.s.commit()
        return inv

    def bin(self):
        return self.s.exec(select(TrashItem)).all()


class DeleteAndRestoreTests(TrashCase):
    def test_a_deleted_invoice_goes_to_the_bin_with_its_lines_and_payments_and_comes_back(self):
        inv = self.make_invoice()
        number = inv.number
        invoices.delete_invoice(inv.id, session=self.s)
        self.assertEqual(self.s.exec(select(Invoice)).all(), [])
        [item] = self.bin()
        self.assertEqual((item.kind, item.label), ("invoice", number))
        trash_api.restore(item.id, session=self.s)
        back = self.s.exec(select(Invoice)).one()
        self.assertEqual((back.number, back.total_amount), (number, inv.total_amount))
        self.assertEqual(len(self.s.exec(select(InvoiceItem)).all()), 1)
        self.assertEqual(len(self.s.exec(select(Payment)).all()), 1)
        self.assertEqual(self.bin(), [])

    def test_restoring_an_invoice_takes_its_stock_off_again(self):
        stock.count(self.s, self.dip, 10)
        self.s.commit()
        inv = self.make_invoice()
        invoices.delete_invoice(inv.id, session=self.s)
        self.s.refresh(self.dip)
        self.assertEqual(self.dip.stock_quantity, 10)
        trash_api.restore(self.bin()[0].id, session=self.s)
        self.s.refresh(self.dip)
        self.assertEqual(self.dip.stock_quantity, 8)

    def test_a_deleted_client_comes_back_with_notes_and_appointments(self):
        self.s.add(ClientNote(client_id=self.client.id, content="Gate code 1234"))
        self.s.add(Appointment(client_id=self.client.id, reason="Visit", time="09:00", date=datetime(2026, 11, 1)))
        self.s.commit()
        clients.delete_client(self.client.id, session=self.s)
        self.assertEqual(self.s.exec(select(ClientNote)).all(), [])
        trash_api.restore(self.bin()[0].id, session=self.s)
        self.assertEqual(self.s.exec(select(Client).where(Client.name == "Jan")).one().farm_name, "Rietvlei")
        self.assertEqual(len(self.s.exec(select(ClientNote)).all()), 1)
        self.assertEqual(len(self.s.exec(select(Appointment)).all()), 1)

    def test_a_refused_delete_leaves_nothing_in_the_bin(self):
        self.make_invoice()
        with self.assertRaises(HTTPException):
            clients.delete_client(self.client.id, session=self.s)  # has invoices -> 409
        self.assertEqual(self.bin(), [])


class RestoreRefusalTests(TrashCase):
    def test_not_restored_when_the_document_number_has_been_used_again(self):
        inv = self.make_invoice()
        invoices.delete_invoice(inv.id, session=self.s)
        again = invoices.create_invoice(Invoice(client_id=self.client.id), self.s, self.user)
        self.assertEqual(again.number, inv.number)  # the highest number is free again
        with self.assertRaises(HTTPException) as ctx:
            trash_api.restore(self.bin()[0].id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(len(self.bin()), 1)  # still there to try later

    def test_not_restored_when_something_new_took_the_row_id(self):
        prod = Product(name="Old", price=1.0)
        self.s.add(prod)
        self.s.commit()
        old_id = prod.id
        products.delete_product(old_id, session=self.s)
        self.s.add(Product(id=old_id, name="New", price=2.0))
        self.s.commit()
        with self.assertRaises(HTTPException) as ctx:
            trash_api.restore(self.bin()[0].id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)


class KeepingTests(TrashCase):
    def test_items_older_than_30_days_are_purged_and_newer_stay(self):
        inv = self.make_invoice()
        invoices.delete_invoice(inv.id, session=self.s)
        prod = Product(name="X", price=1.0)
        self.s.add(prod)
        self.s.commit()
        products.delete_product(prod.id, session=self.s)
        old = self.bin()[0]
        old.deleted_at = datetime.utcnow() - timedelta(days=31)
        self.s.add(old)
        self.s.commit()
        trash.purge_old(self.s)
        self.assertEqual(len(self.bin()), 1)

    def test_the_list_shows_what_was_deleted_newest_first_without_the_payload(self):
        inv = self.make_invoice()
        invoices.delete_invoice(inv.id, session=self.s)
        [row] = trash_api.list_trash(session=self.s)
        self.assertEqual((row["kind"], row["label"]), ("invoice", inv.number))
        self.assertNotIn("payload", row)
        self.assertGreaterEqual(row["rows"], 3)

    def test_opening_the_bin_also_clears_what_has_expired(self):
        prod = Product(name="X", price=1.0)
        self.s.add(prod)
        self.s.commit()
        products.delete_product(prod.id, session=self.s)
        old = self.bin()[0]
        old.deleted_at = datetime.utcnow() - timedelta(days=45)
        self.s.add(old)
        self.s.commit()
        self.assertEqual(trash_api.list_trash(session=self.s), [])
        self.assertEqual(self.bin(), [])

    def test_deleting_forever_removes_the_entry(self):
        inv = self.make_invoice()
        invoices.delete_invoice(inv.id, session=self.s)
        trash_api.delete_forever(self.bin()[0].id, session=self.s)
        self.assertEqual(self.bin(), [])

    def test_the_bin_routes_are_admin_only(self):
        from app.core.security import require_admin
        self.assertIn(require_admin, [d.dependency for d in trash_api.router.dependencies])


if __name__ == "__main__":
    unittest.main()
