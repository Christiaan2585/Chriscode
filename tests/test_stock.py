"""Stock counts: a count sets the number on the shelf, receiving a purchase order adds, invoicing takes off, and
editing, cancelling or deleting either document books only the difference."""
import unittest
from datetime import date, datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import invoices, products, purchase_orders
from app.core import stock
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product, StockMovement
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier
from app.models.user import User


class StockCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(BusinessSettings(id=1, trading_name="Test", vat_registered=True, vat_rate=15.0))
        self.user = User(name="Nico", email="nico@example.com", is_admin=True)
        self.dip = Product(name="Dip", price=115.0, price_excl_vat=100.0, cost=80.0)
        self.client = Client(name="Jan")
        self.supplier = Supplier(name="Kyron")
        self.s.add_all([self.user, self.dip, self.client, self.supplier])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def count(self, n):
        return products.count_stock(self.dip.id, products.StockCount(quantity=n), session=self.s, user=self.user)

    def on_hand(self):
        self.s.refresh(self.dip)
        return self.dip.stock_quantity

    def invoice(self, qty):
        inv = invoices.create_invoice(Invoice(client_id=self.client.id), self.s, self.user)
        item = invoices.add_invoice_item(InvoiceItem(invoice_id=inv.id, product_id=self.dip.id, quantity=qty, unit_price=100.0), self.s)
        return inv, item

    def purchase(self, qty, status="Sent"):
        po = purchase_orders.create_purchase_order(PurchaseOrder(supplier_id=self.supplier.id, status=status), self.s, self.user)
        purchase_orders.add_purchase_order_item(po.id, PurchaseOrderItem(purchase_order_id=po.id, product_id=self.dip.id,
                                                                          description="", quantity=qty, unit_price=80.0), self.s)
        return po


class CountTests(StockCase):
    def test_not_counted_means_not_tracked(self):
        self.assertIsNone(self.dip.stock_quantity)
        self.invoice(3)
        self.assertIsNone(self.on_hand())

    def test_a_count_sets_the_number_and_is_kept_in_the_history(self):
        self.count(10)
        self.count(8)
        self.assertEqual(self.on_hand(), 8)
        history = products.stock_history(self.dip.id, session=self.s)
        self.assertEqual([(h["reason"], h["change"]) for h in history], [("count", -2.0), ("count", 10.0)])  # newest first

    def test_a_negative_count_is_refused(self):
        with self.assertRaises(Exception):
            self.count(-1)

    def test_nothing_on_the_shelf_marks_it_out_of_stock(self):
        self.count(2)
        self.invoice(2)
        self.s.refresh(self.dip)
        self.assertEqual((self.dip.stock_quantity, self.dip.in_stock), (0, False))
        self.purchase(5, status="Received")
        self.s.refresh(self.dip)
        self.assertTrue(self.dip.in_stock)


class InvoiceTests(StockCase):
    def test_invoicing_takes_stock_off(self):
        self.count(10)
        self.invoice(3)
        self.assertEqual(self.on_hand(), 7)

    def test_removing_a_line_puts_it_back(self):
        self.count(10)
        _, item = self.invoice(3)
        invoices.delete_invoice_item(item.id, session=self.s)
        self.assertEqual(self.on_hand(), 10)

    def test_cancelling_puts_it_back_and_un_cancelling_takes_it_again(self):
        self.count(10)
        inv, _ = self.invoice(3)
        invoices.update_invoice(inv.id, Invoice(client_id=self.client.id, status="cancelled"), self.s)
        self.assertEqual(self.on_hand(), 10)
        invoices.update_invoice(inv.id, Invoice(client_id=self.client.id, status="unpaid"), self.s)
        self.assertEqual(self.on_hand(), 7)

    def test_deleting_the_invoice_puts_it_back(self):
        self.count(10)
        inv, _ = self.invoice(4)
        invoices.delete_invoice(inv.id, session=self.s)
        self.assertEqual(self.on_hand(), 10)

    def test_selling_more_than_is_counted_goes_below_zero_rather_than_blocking_the_sale(self):
        self.count(1)
        self.invoice(3)
        self.assertEqual(self.on_hand(), -2)


class PurchaseOrderTests(StockCase):
    def test_only_a_received_order_adds_stock(self):
        self.count(0)
        po = self.purchase(12)
        self.assertEqual(self.on_hand(), 0)
        purchase_orders.update_purchase_order(po.id, PurchaseOrder(supplier_id=self.supplier.id, status="Received"), self.s)
        self.assertEqual(self.on_hand(), 12)

    def test_saving_a_received_order_again_does_not_add_twice(self):
        self.count(0)
        po = self.purchase(12, status="Received")
        purchase_orders.update_purchase_order(po.id, PurchaseOrder(supplier_id=self.supplier.id, status="Received", notes="x"), self.s)
        self.assertEqual(self.on_hand(), 12)

    def test_deleting_a_received_order_takes_it_off_again(self):
        self.count(0)
        po = self.purchase(12, status="Received")
        purchase_orders.delete_purchase_order(po.id, session=self.s)
        self.assertEqual(self.on_hand(), 0)


class BaselineTests(StockCase):
    def test_paperwork_from_before_stock_tracking_is_booked_once_without_changing_counts(self):
        inv = Invoice(client_id=self.client.id, number="INV1", status="unpaid")
        self.s.add(inv)
        self.s.commit()
        self.s.add(InvoiceItem(invoice_id=inv.id, product_id=self.dip.id, quantity=5, unit_price=100.0, subtotal=575.0))
        self.s.commit()
        stock.book_existing_paperwork(self.s)
        stock.book_existing_paperwork(self.s)  # second start: nothing more
        self.count(20)
        # Changing the old invoice's quantity from 5 to 6 now takes off one, not six.
        item = self.s.exec(select(InvoiceItem)).one()
        invoices.delete_invoice_item(item.id, session=self.s)
        invoices.add_invoice_item(InvoiceItem(invoice_id=inv.id, product_id=self.dip.id, quantity=6, unit_price=100.0), self.s)
        self.assertEqual(self.on_hand(), 19)
        booked = [m.change for m in self.s.exec(select(StockMovement).where(StockMovement.source == f"invoice:{inv.id}"))]
        self.assertEqual(sum(booked), -6)


class LowStockTests(StockCase):
    def test_the_dashboard_lists_products_at_or_below_their_reorder_level(self):
        from app.core.dashboard import build_dashboard
        self.dip.reorder_level = 5
        self.s.add(self.dip)
        self.s.commit()
        self.count(5)
        low = build_dashboard(self.s, date(2026, 10, 12))["low_stock"]
        self.assertEqual(low["count"], 1)
        self.assertEqual(low["items"][0]["stock_quantity"], 5)


if __name__ == "__main__":
    unittest.main()
