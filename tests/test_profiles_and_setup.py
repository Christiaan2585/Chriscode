import unittest

from fastapi import HTTPException
from sqlmodel import Session, SQLModel, create_engine

from app.api import auth, invoices, purchase_orders, quotes
from app.api.business import BusinessSettingsUpdate, read_business, sales_rep_for, update_business
from app.models.animal import Animal  # noqa: F401 - registers referenced tables
from app.models.business import BusinessSettings
from app.models.client import Client
from app.models.herd import Herd  # noqa: F401
from app.models.invoice import Invoice
from app.models.purchase_order import PurchaseOrder, Supplier
from app.models.quote import Quote
from app.models.user import User

COMPLETE = dict(
    trading_name="NSL de Waal t/a Sandveld Veedienste",
    physical_address="1 Sample street\nGraafwater",
    phone="000 000 0000",
    email="office@example.com",
    bank_name="Sample Bank",
    bank_account_holder="NSL de Waal",
    bank_account_number="0000000000",
    bank_branch_code="000000",
)


class SetupAndProfileTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.rep = User(name="Nico", email="nico@example.com", phone="084 000 0000")
        self.client = Client(name="Garstland Farms CC")
        self.s.add_all([self.rep, self.client])
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def save_business(self, **fields):
        data = {**BusinessSettings().model_dump(exclude={"id"}), **fields}
        return update_business(BusinessSettingsUpdate(**data), session=self.s)

    # --- setup completeness ---

    def test_new_install_reports_what_is_missing(self):
        missing = read_business(session=self.s)["missing"]
        self.assertIn("Address", missing)
        self.assertIn("Bank details", missing)

    def test_complete_details_report_nothing_missing(self):
        self.assertEqual(self.save_business(**COMPLETE)["missing"], [])

    def test_blank_text_counts_as_missing(self):
        self.assertIn("Bank details", self.save_business(**{**COMPLETE, "bank_account_number": "   "})["missing"])

    def test_email_is_required(self):
        self.assertIn("Email", self.save_business(**{**COMPLETE, "email": ""})["missing"])

    def test_everything_else_is_optional(self):
        out = self.save_business(**COMPLETE)
        self.assertEqual(out["missing"], [])
        self.assertIsNone(out["vat_number"] or None)
        self.assertEqual(set(out["required_fields"]), {
            "trading_name", "physical_address", "phone", "email",
            "bank_name", "bank_account_holder", "bank_account_number", "bank_branch_code"})

    # --- per-user sales rep ---

    def test_documents_remember_who_created_them(self):
        inv = invoices.create_invoice(Invoice(client_id=self.client.id), session=self.s, user=self.rep)
        q = quotes.create_quote(Quote(client_id=self.client.id), session=self.s, user=self.rep)
        supplier = purchase_orders.create_supplier(Supplier(name="Kyron"), session=self.s)
        po = purchase_orders.create_purchase_order(PurchaseOrder(supplier_id=supplier.id), session=self.s, user=self.rep)
        self.assertEqual({inv.created_by, q.created_by, po.created_by}, {self.rep.id})

    def test_pdf_rep_is_the_creator(self):
        inv = invoices.create_invoice(Invoice(client_id=self.client.id), session=self.s, user=self.rep)
        self.assertEqual(sales_rep_for(self.s, inv), ("Nico", "084 000 0000"))

    def test_older_documents_fall_back_to_the_default_rep(self):
        self.save_business(**COMPLETE, sales_rep="Office", sales_rep_phone="021 000 0000")
        inv = invoices.create_invoice(Invoice(client_id=self.client.id), session=self.s, user=self.rep)
        inv.created_by = None
        self.assertEqual(sales_rep_for(self.s, inv), ("Office", "021 000 0000"))

    # --- my details ---

    def test_user_updates_own_name_and_phone(self):
        out = auth.update_me(auth.ProfileUpdate(name=" Nico de Waal ", phone="084 111 1111"), user=self.rep, session=self.s)
        self.assertEqual((out.name, out.phone, out.email), ("Nico de Waal", "084 111 1111", "nico@example.com"))

    def test_name_cannot_be_blank(self):
        with self.assertRaises(HTTPException) as ctx:
            auth.update_me(auth.ProfileUpdate(name="  ", phone=None), user=self.rep, session=self.s)
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
