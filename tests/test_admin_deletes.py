"""Deleting the business's records (clients, paperwork, products, programs) is for admins; staff can still edit them."""
import unittest

from app.api import clients, invoices, orders, products, programs, purchase_orders, quotes
from app.core.security import require_admin

ADMIN_ONLY_DELETES = [
    (clients, "/clients/{client_id}"),
    (invoices, "/invoices/{invoice_id}"),
    (quotes, "/quotes/{quote_id}"),
    (orders, "/orders/{order_id}"),
    (products, "/products/{product_id}"),
    (programs, "/programs/{program_id}"),
    (purchase_orders, "/purchase-orders/{po_id}"),
    (purchase_orders, "/suppliers/{supplier_id}"),
]


def needs_admin(route) -> bool:
    return any(dep.call is require_admin for dep in route.dependant.dependencies)


class AdminOnlyDeleteTests(unittest.TestCase):
    def test_every_record_delete_needs_an_admin(self):
        for module, path in ADMIN_ONLY_DELETES:
            routes = [r for r in module.router.routes if r.path == path and "DELETE" in r.methods]
            self.assertEqual(len(routes), 1, path)
            self.assertTrue(needs_admin(routes[0]), f"DELETE {path} is open to staff")

    def test_staff_can_still_remove_a_line_from_a_document(self):
        for module, path in ((invoices, "/invoices/items/{item_id}"), (quotes, "/quotes/items/{item_id}")):
            route = next(r for r in module.router.routes if r.path == path and "DELETE" in r.methods)
            self.assertFalse(needs_admin(route), path)


if __name__ == "__main__":
    unittest.main()
