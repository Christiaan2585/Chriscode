"""The recycle bin. `@recorded(kind, table)` wraps an admin delete route: every row the delete removes (the record and
its cascades) is saved as one TrashItem, kept for RETAIN_DAYS. `restore` puts them all back with their old ids and
numbers - or refuses (409) when something new has taken an id or a document number meanwhile."""
import base64
import functools
import json
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import event, inspect as sa_inspect, select as sa_select
from sqlmodel import Session, SQLModel, select

from app.models.trash import TrashItem

RETAIN_DAYS = 30


def _encode(value):
    if isinstance(value, datetime):
        return {"$dt": value.isoformat()}
    if isinstance(value, date):
        return {"$d": value.isoformat()}
    if isinstance(value, (bytes, bytearray)):
        return {"$b": base64.b64encode(bytes(value)).decode("ascii")}
    return value


def _decode(value):
    if isinstance(value, dict):
        if "$dt" in value:
            return datetime.fromisoformat(value["$dt"])
        if "$d" in value:
            return date.fromisoformat(value["$d"])
        if "$b" in value:
            return base64.b64decode(value["$b"])
    return value


def _label(row: dict, fallback: str) -> str:
    for key in ("number", "farm_name", "name", "title"):
        if row.get(key):
            return str(row[key])
    return fallback


def recorded(kind: str, table: str):
    """Decorator for a delete route that takes `session=`. A refused delete (an exception) records nothing."""
    def wrap(handler):
        @functools.wraps(handler)
        def inner(*args, **kwargs):
            session: Session = kwargs["session"]
            rows = []

            def collect(sess, _context, _instances):
                for obj in list(sess.deleted):
                    cols = {c.key: _encode(getattr(obj, c.key)) for c in sa_inspect(obj).mapper.column_attrs}
                    rows.append({"table": obj.__table__.name, "values": cols})

            event.listen(session, "before_flush", collect)
            try:
                result = handler(*args, **kwargs)
            finally:
                event.remove(session, "before_flush", collect)
            if rows:
                main_row = next((r["values"] for r in rows if r["table"] == table), {})
                session.add(TrashItem(kind=kind, label=_label(main_row, f"#{main_row.get('id', '?')}"),
                                      row_count=len(rows), payload=json.dumps(rows)))
                session.commit()
            return result
        return inner
    return wrap


def restore(session: Session, item: TrashItem) -> None:
    rows = json.loads(item.payload)
    tables = SQLModel.metadata.tables
    for row in rows:  # refuse before changing anything
        table = tables[row["table"]]
        values = {k: _decode(v) for k, v in row["values"].items()}
        pk = list(table.primary_key.columns)
        if all(c.name in values for c in pk) and session.execute(
                sa_select(pk[0]).where(*[c == values[c.name] for c in pk])).first():
            raise HTTPException(status_code=409, detail="Something new has taken this record's place, so it can't be put back")
        if values.get("number") and "number" in table.c and session.execute(
                sa_select(table.c.number).where(table.c.number == values["number"])).first():
            raise HTTPException(status_code=409, detail=f"The number {values['number']} has been used again, so it can't be put back")
    for row in reversed(rows):  # deletes remove children first; parents go back first
        session.execute(tables[row["table"]].insert().values(**{k: _decode(v) for k, v in row["values"].items()}))
    session.flush()
    _rebook_stock(session, rows)
    session.delete(item)
    session.commit()


def _rebook_stock(session: Session, rows: list) -> None:
    from app.core import stock
    from app.models.invoice import Invoice
    from app.models.purchase_order import PurchaseOrder
    for row in rows:
        if row["table"] == "invoice":
            stock.sync_invoice(session, session.get(Invoice, row["values"]["id"]))
        elif row["table"] == "purchaseorder":
            stock.sync_purchase_order(session, session.get(PurchaseOrder, row["values"]["id"]))


def purge_old(session: Session) -> None:
    cutoff = datetime.utcnow() - timedelta(days=RETAIN_DAYS)
    for item in session.exec(select(TrashItem).where(TrashItem.deleted_at < cutoff)).all():
        session.delete(item)
    session.commit()
