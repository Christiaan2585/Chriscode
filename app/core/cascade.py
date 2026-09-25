"""Deletes that clean up after themselves.

SQLite doesn't enforce foreign keys unless asked, so a plain
session.delete(client) used to leave that client's animals, appointments,
notes, programs and herds (and each animal's medical/weight/schedule
records) behind, pointing at a record that no longer exists. These
helpers delete what belongs to the record, and refuse - with a reason the
user can act on - when that would destroy financial history.

They stage changes on the session; the caller commits.
"""
from sqlmodel import Session, select

from app.models.animal import Animal
from app.models.appointment import Appointment
from app.models.client import Client
from app.models.herd import Herd
from app.models.invoice import Invoice, InvoiceItem
from app.models.medical import MedicalRecord
from app.models.note import ClientNote
from app.models.order import Order
from app.models.product import Product
from app.models.product_dosing import ProductDosing
from app.models.program import AnimalGroup, HerdingProgram, ProgramAssignment
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models.schedule import HealthSchedule
from app.models.weight import WeightLog


class InUseError(Exception):
    """The record is referenced by financial history and must be kept."""


def _rows(session: Session, model, column, value):
    return session.exec(select(model).where(column == value)).all()


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


def delete_animal(session: Session, animal: Animal) -> None:
    for model in (MedicalRecord, WeightLog, HealthSchedule, ProgramAssignment):
        for row in _rows(session, model, model.animal_id, animal.id):
            session.delete(row)
    # A visit happened (or will) regardless - keep it, just unlinked.
    for appointment in _rows(session, Appointment, Appointment.animal_id, animal.id):
        appointment.animal_id = None
        session.add(appointment)
    session.delete(animal)


def delete_client(session: Session, client: Client) -> None:
    financial = [
        _plural(len(rows), label)
        for model, label in ((Invoice, "invoice"), (Quote, "quote"), (Order, "order"))
        if (rows := _rows(session, model, model.client_id, client.id))
    ]
    if financial:
        raise InUseError(
            f"{client.name} has {', '.join(financial)}. These are financial records, so the client can't be "
            "deleted while they exist - delete them first if you're sure."
        )

    for animal in _rows(session, Animal, Animal.client_id, client.id):
        delete_animal(session, animal)
    for program in _rows(session, HerdingProgram, HerdingProgram.client_id, client.id):
        for model in (AnimalGroup, ProgramAssignment):
            for row in _rows(session, model, model.program_id, program.id):
                session.delete(row)
        session.delete(program)
    for model in (Appointment, ClientNote, Herd):
        for row in _rows(session, model, model.client_id, client.id):
            session.delete(row)
    session.delete(client)


def delete_product(session: Session, product: Product) -> None:
    lines = (len(_rows(session, InvoiceItem, InvoiceItem.product_id, product.id))
             + len(_rows(session, QuoteItem, QuoteItem.product_id, product.id)))
    if lines:
        # Invoices and quotes show the product's name from this row, so
        # deleting it would turn old paperwork into "Unknown".
        raise InUseError(
            f"{product.name} appears on {_plural(lines, 'invoice/quote line')}, so it can't be deleted - "
            "old invoices and quotes still need its name."
        )
    for rule in _rows(session, ProductDosing, ProductDosing.product_id, product.id):
        session.delete(rule)
    session.delete(product)


def delete_herd(session: Session, herd: Herd) -> None:
    for animal in _rows(session, Animal, Animal.herd_id, herd.id):
        animal.herd_id = None
        session.add(animal)
    session.delete(herd)
