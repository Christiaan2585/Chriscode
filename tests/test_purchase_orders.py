import unittest
from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine, select

from app.api import purchase_orders as po_api
from app.core import cascade
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.herd import Herd  # noqa: F401
from app.models.product import Product
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier


class PurchaseOrderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.supplier = po_api.create_supplier(
            Supplier(name="Kyron Animal Health (Pty) Ltd", vat_number="4930220639"), session=self.s)
        self.tag = Product(name="Z-Tag M4/F4 Green (10)", code="83096", price=230.65, cost=174.41)
        self.s.add(self.tag)
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def new_po(self, **fields):
        return po_api.create_purchase_order(
            PurchaseOrder(supplier_id=self.supplier.id, date="2026-09-02T00:00:00", **fields), session=self.s)

    def add_line(self, po, **fields):
        data = {"product_id": self.tag.id, "quantity": 7, "unit_price": 0, "description": "", **fields}
        return po_api.add_purchase_order_item(po.id, PurchaseOrderItem(purchase_order_id=po.id, **data), session=self.s)

    def test_numbering_and_cost_price_lines(self):
        po = self.new_po(reference="William Biggs", delivery_date="2026-09-30T00:00:00")
        line = self.add_line(po)
        self.s.refresh(po)
        self.assertEqual(po.number, "PO0000001")
        self.assertEqual(po.delivery_date, datetime(2026, 9, 30))
        self.assertEqual((line.description, line.unit_price, line.subtotal), ("83096 - Z-Tag M4/F4 Green (10)", 174.41, 1220.87))
        self.assertEqual(po.total_amount, 1220.87)

    def test_free_text_line_without_product(self):
        po = self.new_po()
        line = self.add_line(po, product_id=None, description="Courier to Murraysburg", quantity=1, unit_price=150)
        self.assertEqual((line.description, line.subtotal), ("Courier to Murraysburg", 150.0))

    def test_free_text_line_needs_a_description(self):
        with self.assertRaises(HTTPException) as ctx:
            self.add_line(self.new_po(), product_id=None, description=" ", unit_price=10)
        self.assertEqual(ctx.exception.status_code, 422)

    def test_deleting_an_order_removes_its_lines(self):
        po = self.new_po()
        self.add_line(po)
        po_api.delete_purchase_order(po.id, session=self.s)
        self.assertEqual(self.s.exec(select(PurchaseOrderItem)).all(), [])

    def test_supplier_with_orders_cannot_be_deleted(self):
        self.new_po()
        with self.assertRaises(HTTPException) as ctx:
            po_api.delete_supplier(self.supplier.id, session=self.s)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_deleting_a_product_keeps_order_lines_readable(self):
        line = self.add_line(self.new_po())
        cascade.delete_product(self.s, self.tag)
        self.s.commit()
        self.s.refresh(line)
        self.assertEqual((line.product_id, line.description), (None, "83096 - Z-Tag M4/F4 Green (10)"))

    def test_editing_keeps_the_number(self):
        po = self.new_po()
        po_api.update_purchase_order(po.id, PurchaseOrder.model_validate(
            {"supplier_id": self.supplier.id, "status": "Sent"}), session=self.s)
        self.s.refresh(po)
        self.assertEqual((po.number, po.status), ("PO0000001", "Sent"))


if __name__ == "__main__":
    unittest.main()
