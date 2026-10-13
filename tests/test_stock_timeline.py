"""The stock timeline: every movement keeps the balance it left behind, manual adjustments need a reason, the list is
newest first and can be narrowed, and the overview says what is low or out."""
import unittest
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import invoices, products, purchase_orders, stock as stock_api
from app.core import stock
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.invoice import Invoice, InvoiceItem
from app.models.product import Product, StockMovement
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier
from app.models.user import User


class TimelineCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(BusinessSettings(id=1, trading_name="Test"))
        self.user = User(name="Nico", email="n@example.com", is_admin=True)
        self.dip = Product(name="Dip", price=115.0, price_excl_vat=100.0, reorder_level=5)
        self.vax = Product(name="Vaccine", price=50.0)
        self.client = Client(name="Jan")
        self.supplier = Supplier(name="Kyron")
        self.s.add_all([self.user, self.dip, self.vax, self.client, self.supplier])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def count(self, product, n, note=None):
        return products.count_stock(product.id, products.StockCount(quantity=n, note=note), session=self.s, user=self.user)

    def sell(self, product, qty):
        inv = invoices.create_invoice(Invoice(client_id=self.client.id), self.s, self.user)
        invoices.add_invoice_item(InvoiceItem(invoice_id=inv.id, product_id=product.id, quantity=qty, unit_price=100.0), self.s)
        return inv

    def receive(self, product, qty):
        po = purchase_orders.create_purchase_order(PurchaseOrder(supplier_id=self.supplier.id, status="Received"), self.s, self.user)
        purchase_orders.add_purchase_order_item(po.id, PurchaseOrderItem(purchase_order_id=po.id, product_id=product.id, description="",
                                                                          quantity=qty, unit_price=80.0), self.s)
        return po

    def adjust(self, product, change, note="Spilled"):
        return stock_api.adjust(product.id, stock_api.StockAdjust(change=change, note=note), session=self.s, user=self.user)

    def timeline(self, **kw):
        return stock_api.movements(session=self.s, **kw)


class BalanceTests(TimelineCase):
    def test_each_movement_keeps_the_balance_it_left_behind(self):
        self.count(self.dip, 10)
        self.sell(self.dip, 3)
        self.receive(self.dip, 20)
        rows = self.timeline()
        self.assertEqual([(r["reason"], r["change"], r["balance"]) for r in rows],
                         [("received", 20.0, 27.0), ("sold", -3.0, 7.0), ("count", 10.0, 10.0)])

    def test_nothing_is_claimed_about_the_balance_before_a_product_was_counted(self):
        self.sell(self.vax, 2)  # never counted
        self.s.refresh(self.vax)
        self.assertIsNone(self.vax.stock_quantity)
        [row] = self.s.exec(select(StockMovement).where(StockMovement.product_id == self.vax.id)).all()
        self.assertIsNone(row.balance)

    def test_a_count_notes_why_and_who(self):
        self.count(self.dip, 10, note="Year-end count")
        [row] = self.timeline()
        self.assertEqual((row["note"], row["by"]), ("Year-end count", "Nico"))

    def test_automatic_movements_say_which_document_and_who_none(self):
        self.count(self.dip, 10)
        inv = self.sell(self.dip, 3)
        sold = self.timeline(reason="sold")[0]
        self.assertEqual((sold["reference"], sold["by"], sold["product_name"]), (inv.number, None, "Dip"))


class AdjustTests(TimelineCase):
    def test_an_adjustment_moves_the_number_and_is_logged_with_its_reason(self):
        self.count(self.dip, 10)
        self.adjust(self.dip, -3, "Two bottles spilled, one expired")
        self.s.refresh(self.dip)
        self.assertEqual(self.dip.stock_quantity, 7)
        top = self.timeline()[0]
        self.assertEqual((top["reason"], top["change"], top["balance"], top["note"], top["by"]),
                         ("adjusted", -3.0, 7.0, "Two bottles spilled, one expired", "Nico"))

    def test_a_product_that_was_never_counted_cannot_be_adjusted(self):
        with self.assertRaises(HTTPException) as ctx:
            self.adjust(self.vax, 5)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_no_change_and_no_reason_are_refused(self):
        self.count(self.dip, 10)
        with self.assertRaises(Exception):
            self.adjust(self.dip, 0)
        with self.assertRaises(Exception):
            self.adjust(self.dip, 2, note="   ")

    def test_an_unknown_product_is_a_404(self):
        with self.assertRaises(HTTPException) as ctx:
            stock_api.adjust(9999, stock_api.StockAdjust(change=1, note="x"), session=self.s, user=self.user)
        self.assertEqual(ctx.exception.status_code, 404)


class ListTests(TimelineCase):
    def test_it_can_be_narrowed_to_one_product_or_one_kind_of_movement(self):
        self.count(self.dip, 10)
        self.count(self.vax, 4)
        self.sell(self.dip, 1)
        self.assertEqual({r["product_name"] for r in self.timeline(product_id=self.dip.id)}, {"Dip"})
        self.assertEqual([r["reason"] for r in self.timeline(reason="count")], ["count", "count"])

    def test_old_paperwork_booked_at_the_start_is_not_part_of_the_story(self):
        inv = Invoice(client_id=self.client.id, number="INV1", status="unpaid")
        self.s.add(inv)
        self.s.commit()
        self.s.add(InvoiceItem(invoice_id=inv.id, product_id=self.dip.id, quantity=5, unit_price=100.0, subtotal=575.0))
        self.s.commit()
        stock.book_existing_paperwork(self.s)
        self.assertEqual(self.timeline(), [])

    def test_newest_first_and_the_limit_is_respected(self):
        self.count(self.dip, 10)
        for _ in range(3):
            self.sell(self.dip, 1)
        old = self.s.exec(select(StockMovement).where(StockMovement.reason == "count")).one()
        old.at = datetime.utcnow() - timedelta(days=5)
        self.s.add(old)
        self.s.commit()
        rows = self.timeline(limit=3)
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(r["reason"] == "sold" for r in rows))

    def test_a_silly_limit_is_refused(self):
        with self.assertRaises(HTTPException):
            self.timeline(limit=100000)


class OverviewTests(TimelineCase):
    def test_each_product_is_untracked_ok_low_or_out(self):
        low = Product(name="Low one", price=1.0, reorder_level=10)
        out = Product(name="Out one", price=1.0)
        self.s.add_all([low, out])
        self.s.commit()
        self.count(self.dip, 50)   # reorder 5 -> ok
        self.count(low, 8)         # at/below its reorder level 10 -> low
        self.count(out, 3)
        self.sell(out, 3)          # 0 -> out
        by_name = {r["name"]: r for r in stock_api.overview(session=self.s)}
        self.assertEqual(
            {n: by_name[n]["status"] for n in ("Dip", "Low one", "Out one", "Vaccine")},
            {"Dip": "ok", "Low one": "low", "Out one": "out", "Vaccine": "untracked"})

    def test_it_says_when_each_product_last_moved_and_hides_hidden_products(self):
        self.count(self.dip, 10)
        self.vax.is_active = False
        self.s.add(self.vax)
        self.s.commit()
        rows = {r["name"]: r for r in stock_api.overview(session=self.s)}
        self.assertIsNotNone(rows["Dip"]["last_movement"])
        self.assertNotIn("Vaccine", rows)


class RoutesTests(TimelineCase):
    def test_everything_here_is_for_signed_in_staff_and_nothing_needs_admin(self):
        from app.core.security import require_admin
        for route in stock_api.router.routes:
            self.assertNotIn(require_admin, [d.dependency for d in route.dependencies], route.path)


if __name__ == "__main__":
    unittest.main()
