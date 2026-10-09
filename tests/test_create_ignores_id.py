"""A create (POST) never takes its record number from the request: the database picks it. (A caller choosing an id could
otherwise collide with, or pre-empt, another record's number.) Every create handler that receives a database model
therefore starts by clearing `id` - as the purchase-order and supplier creates always did."""
import importlib
import inspect
import unittest

from fastapi.routing import APIRoute
from sqlmodel import SQLModel

ROUTERS = ["clients", "animals", "rams", "medical", "products", "invoices", "notes", "weights", "schedules", "herds",
           "appointments", "quotes", "orders", "dosing", "purchase_orders"]


def table_model_params(endpoint):
    for p in inspect.signature(endpoint).parameters.values():
        ann = p.annotation
        if inspect.isclass(ann) and issubclass(ann, SQLModel) and getattr(ann, "__table__", None) is not None and ann.__name__ != "User":
            yield p.name


class CreateIgnoresIdTests(unittest.TestCase):
    def test_every_create_clears_the_id_it_was_sent(self):
        missing = []
        for name in ROUTERS:
            router = importlib.import_module(f"app.api.{name}").router
            for route in router.routes:
                if not isinstance(route, APIRoute) or "POST" not in route.methods:
                    continue
                source = inspect.getsource(route.endpoint)
                for param in table_model_params(route.endpoint):
                    if f"{param}.id = None" not in source:
                        missing.append(f"POST {route.path} ({param})")
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
