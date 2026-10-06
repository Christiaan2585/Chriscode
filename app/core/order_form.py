"""Reads a filled-in catalogue order form (see pdf.generate_catalogue_pdf's
`order_for`) back into quantities. The PDF comes from outside - a client's
phone - so anything unreadable is reported, never trusted."""
import io
import math
from dataclasses import dataclass, field

from pypdf import PdfReader

from app.core.pdf import ORDER_CLIENT_FIELD, ORDER_NOTES_FIELD, ORDER_PICK_PREFIX, ORDER_QTY_PREFIX

MAX_QUANTITY = 100_000


class NotAnOrderForm(ValueError):
    pass


@dataclass
class OrderForm:
    client_id: int | None
    quantities: dict = field(default_factory=dict)  # product_id -> quantity
    unreadable: dict = field(default_factory=dict)  # product_id -> what was typed
    notes: str = ""


def parse_quantity(text) -> float | None:
    """"2", "1,5" (decimal comma) or "1.5"; blank or 0 means not ordered."""
    cleaned = str(text or "").strip().replace(" ", "").replace(",", ".")
    if not cleaned:
        return None
    value = float(cleaned)  # ValueError for anything else
    if not math.isfinite(value) or value < 0 or value > MAX_QUANTITY:
        raise ValueError(cleaned)
    return value or None


def read_order_form(data: bytes) -> OrderForm:
    try:
        fields = PdfReader(io.BytesIO(data)).get_fields() or {}
    except Exception as exc:  # pypdf raises many kinds of errors on a broken file
        raise NotAnOrderForm("That file isn't a PDF this app can read") from exc
    if not any(name.startswith(ORDER_QTY_PREFIX) for name in fields):
        raise NotAnOrderForm("That PDF isn't an order form from this app (it has no quantity boxes)")

    def value(name):
        return fields[name].value if name in fields and fields[name].value is not None else ""

    client = str(value(ORDER_CLIENT_FIELD)).strip()
    form = OrderForm(client_id=int(client) if client.isdigit() else None,
                     notes=str(value(ORDER_NOTES_FIELD)).strip()[:2000])
    for name in fields:
        suffix = name[len(ORDER_QTY_PREFIX):]
        if not name.startswith(ORDER_QTY_PREFIX) or not suffix.isdigit():
            continue
        typed = value(name)
        try:
            quantity = parse_quantity(typed)
        except ValueError:
            form.unreadable[int(suffix)] = str(typed)[:40]
            continue
        if quantity:
            form.quantities[int(suffix)] = quantity
    # A ticked box with no quantity typed means one; a typed quantity always wins.
    for name in fields:
        suffix = name[len(ORDER_PICK_PREFIX):]
        if not name.startswith(ORDER_PICK_PREFIX) or not suffix.isdigit():
            continue
        ticked = str(value(name)).strip().lstrip("/").lower() not in ("", "off", "no", "false")
        product_id = int(suffix)
        if ticked and product_id not in form.quantities and product_id not in form.unreadable:
            form.quantities[product_id] = 1.0
    return form
