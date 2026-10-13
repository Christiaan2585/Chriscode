"""Quick ordering: the products that are low or out are suggested with a sensible amount to order, one request turns
the ticked ones into a purchase order for a supplier (priced at cost, delivery details filled in), the supplier is
remembered per product, and an order that was sent can be marked as sent."""
import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app import main  # noqa: F401 - registers every table
from app.api import purchase_orders as po_api
from app.core import stock
from app.models.business import BusinessSettings
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier
from app.models.user import User


class QuickCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.s.add(BusinessSettings(id=1, trading_name="Sandveld", vat_registered=True, vat_rate=15.0))
        self.user = User(name="Nico", email="n@example.com", is_admin=True)
        self.kyron = Supplier(name="Kyron", email="orders@kyron.example", phone="0821112222")
        self.other = Supplier(name="Other Co")
        self.s.add_all([self.user, self.kyron, self.other])
        self.s.commit()
        self.dip = Product(name="Dip 5 l", code="D5", price=230.0, cost=100.0, packaging="4 x 5 l", reorder_level=10)
        self.vax = Product(name="Vaccine", price=60.0, cost=40.0)
        self.tag = Product(name="Ear tag", price=5.0, cost=2.0, reorder_level=100)
        self.fine = Product(name="Plenty", price=5.0, cost=2.0, reorder_level=5)
        self.s.add_all([self.dip, self.vax, self.tag, self.fine])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def count(self, product, n):
        stock.count(self.s, product, n)
        self.s.commit()

    def quick(self, lines, supplier=None, **extra):
        body = po_api.QuickOrderIn(supplier_id=(supplier or self.kyron).id, lines=[po_api.QuickLine(**l) for l in lines], **extra)
        return po_api.quick_order(body, session=self.s, user=self.user)


class SuggestionTests(QuickCase):
    def test_low_and_out_products_are_suggested_with_enough_to_get_well_stocked(self):
        self.count(self.dip, 3)     # reorder 10 -> aim for 20 -> order 17
        self.count(self.vax, 0)     # out, no reorder level -> 1
        self.count(self.fine, 50)   # fine
        got = {r["name"]: r for r in po_api.order_suggestions(session=self.s)}
        self.assertEqual(set(got), {"Dip 5 l", "Vaccine"})
        self.assertEqual(got["Dip 5 l"]["suggested_quantity"], 17)
        self.assertEqual(got["Vaccine"]["suggested_quantity"], 1)
        self.assertEqual((got["Dip 5 l"]["cost"], got["Dip 5 l"]["packaging"], got["Dip 5 l"]["status"]), (100.0, "4 x 5 l", "low"))

    def test_products_that_are_not_counted_or_are_hidden_are_not_suggested(self):
        self.tag.is_active = False
        self.s.add(self.tag)
        self.s.commit()
        self.count(self.tag, 0)
        self.assertEqual(po_api.order_suggestions(session=self.s), [])  # tag is hidden, the rest are not counted

    def test_for_one_supplier_only_its_products_and_the_unassigned_ones_are_suggested(self):
        self.count(self.dip, 1)
        self.count(self.tag, 1)
        self.dip.supplier_id = self.other.id
        self.s.add(self.dip)
        self.s.commit()
        names = lambda sid: {r["name"] for r in po_api.order_suggestions(supplier_id=sid, session=self.s)}
        self.assertEqual(names(self.kyron.id), {"Ear tag"})
        self.assertEqual(names(self.other.id), {"Dip 5 l", "Ear tag"})


class CreateTests(QuickCase):
    def test_one_request_makes_a_draft_order_priced_at_cost_with_the_delivery_details(self):
        out = self.quick([{"product_id": self.dip.id, "quantity": 17}, {"product_id": self.vax.id, "quantity": 2}],
                         notes="Deliver to the farm gate", reference="Winter stock", delivery_date=datetime(2026, 11, 3))
        po = out["order"]
        self.assertEqual((po.status, po.reference, po.notes), ("Draft", "Winter stock", "Deliver to the farm gate"))
        self.assertTrue(po.number.startswith("PO"))
        self.assertEqual(po.created_by, self.user.id)
        self.assertEqual(po.delivery_date, datetime(2026, 11, 3))
        items = self.s.exec(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)).all()
        self.assertEqual(sorted((i.quantity, i.unit_price) for i in items), [(2.0, 40.0), (17.0, 100.0)])
        self.assertEqual(po.total_amount, round(17 * 100 * 1.15 + 2 * 40 * 1.15, 2))

    def test_a_product_with_no_cost_price_is_never_priced_at_what_we_sell_it_for(self):
        pricey = Product(name="No cost saved", price=999.0)  # selling price only
        self.s.add(pricey)
        self.s.commit()
        out = self.quick([{"product_id": pricey.id, "quantity": 2}])
        self.assertEqual((out["lines"][0]["unit_price"], out["order"].total_amount), (0.0, 0.0))

    def test_each_line_reads_with_its_code_and_pack_for_the_supplier(self):
        out = self.quick([{"product_id": self.dip.id, "quantity": 5}])
        self.assertEqual(out["lines"][0]["description"], "D5 - Dip 5 l (4 x 5 l)")
        # what the screen needs to send it: who to, and how (a committed session must not empty these out)
        self.s.expire_all()
        self.assertEqual({k: out["supplier"][k] for k in ("name", "email", "phone")},
                         {"name": "Kyron", "email": "orders@kyron.example", "phone": "0821112222"})

    def test_the_same_product_twice_becomes_one_line(self):
        out = self.quick([{"product_id": self.dip.id, "quantity": 5}, {"product_id": self.dip.id, "quantity": 3}])
        self.assertEqual([(l["description"], l["quantity"]) for l in out["lines"]], [("D5 - Dip 5 l (4 x 5 l)", 8.0)])

    def test_the_supplier_is_remembered_for_products_without_one_but_never_swapped(self):
        self.vax.supplier_id = self.other.id
        self.s.add(self.vax)
        self.s.commit()
        self.quick([{"product_id": self.dip.id, "quantity": 1}, {"product_id": self.vax.id, "quantity": 1}])
        self.s.refresh(self.dip)
        self.s.refresh(self.vax)
        self.assertEqual((self.dip.supplier_id, self.vax.supplier_id), (self.kyron.id, self.other.id))

    def test_bad_requests_are_refused_and_leave_nothing_behind(self):
        with self.assertRaises(Exception):
            self.quick([])  # an order with nothing on it
        with self.assertRaises(HTTPException) as ctx:
            self.quick([{"product_id": 9999, "quantity": 1}])
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            po_api.quick_order(po_api.QuickOrderIn(supplier_id=9999, lines=[po_api.QuickLine(product_id=self.dip.id, quantity=1)]),
                               session=self.s, user=self.user)
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(Exception):
            po_api.QuickLine(product_id=self.dip.id, quantity=0)
        self.assertEqual(self.s.exec(select(PurchaseOrder)).all(), [])


class MarkSentTests(QuickCase):
    def test_a_draft_becomes_sent_and_nothing_else_is_touched(self):
        po = self.quick([{"product_id": self.dip.id, "quantity": 1}])["order"]
        po_api.mark_sent(po.id, session=self.s)
        self.s.refresh(po)
        self.assertEqual(po.status, "Sent")
        po.status = "Received"
        self.s.add(po)
        self.s.commit()
        po_api.mark_sent(po.id, session=self.s)
        self.s.refresh(po)
        self.assertEqual(po.status, "Received")

    def test_an_unknown_order_is_a_404(self):
        with self.assertRaises(HTTPException) as ctx:
            po_api.mark_sent(9999, session=self.s)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
