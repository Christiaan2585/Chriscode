from datetime import datetime


def coerce_datetime(value):
    """SQLModel table models don't coerce field types on construction the
    way a plain Pydantic model / FastAPI request-body parse normally
    would: a datetime field arriving as a JSON string (e.g. "2025-12-10"
    from an HTML <input type="date">) stays a raw str on the object
    FastAPI hands the endpoint. SQLite's DateTime column then rejects
    that raw string at INSERT/UPDATE time with a bare
    "TypeError: SQLite DateTime type only accepts Python datetime and
    date objects" wrapped in a 500 - which is exactly what happened live
    creating a herding program with a start/end date, and would happen
    identically for appointments, notes, quotes, orders and invoices
    wherever their date fields are set from client input.

    Call this on every such field, right after FastAPI hands you the
    parsed model and before session.add()/session.commit()."""
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value)
