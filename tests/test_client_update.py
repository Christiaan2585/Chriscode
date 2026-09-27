import unittest

from sqlmodel import Session, SQLModel, create_engine

from app.api.clients import update_client
from app.models.client import Client


class ClientUpdateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.s = Session(self.engine)
        self.client = Client(name="Garstland Farms CC", vat_number="4500143989", postal_address="Vleiplaatz")
        self.s.add(self.client)
        self.s.commit()

    def tearDown(self):
        self.s.close()
        self.engine.dispose()

    def test_fields_not_sent_are_kept(self):
        update_client(self.client.id, Client.model_validate({"name": "Garstland Farms", "phone": "082"}), session=self.s)
        self.s.refresh(self.client)
        self.assertEqual((self.client.name, self.client.phone, self.client.vat_number, self.client.postal_address),
                         ("Garstland Farms", "082", "4500143989", "Vleiplaatz"))


if __name__ == "__main__":
    unittest.main()
