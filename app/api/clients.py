from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from typing import List, Optional
import io
import pandas as pd
from app.core.db import get_session
from app.models.client import Client

router = APIRouter(prefix="/clients", tags=["Clients"])

# Accepted spreadsheet header spellings, mapped to the Client model's fields.
# Matching is case-insensitive and ignores surrounding whitespace, so a client
# list doesn't need to use these exact column names.
_COLUMN_ALIASES = {
    "name": ["name", "client name", "client", "full name", "customer name", "customer"],
    "email": ["email", "e-mail", "email address"],
    "phone": ["phone", "cell", "cellphone", "cell number", "telephone", "tel", "contact number", "mobile"],
    "address": ["address", "farm address", "physical address", "postal address"],
    "farm_name": ["farm_name", "farm name", "farm", "business name"],
}

@router.post("/", response_model=Client)
def create_client(client: Client, session: Session = Depends(get_session)):
    session.add(client)
    session.commit()
    session.refresh(client)
    return client

@router.get("/", response_model=List[Client])
def read_clients(session: Session = Depends(get_session)):
    clients = session.exec(select(Client)).all()
    return clients

@router.get("/{client_id}", response_model=Client)
def read_client(client_id: int, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@router.put("/{client_id}", response_model=Client)
def update_client(client_id: int, client_data: Client, session: Session = Depends(get_session)):
    db_client = session.get(Client, client_id)
    if not db_client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Exclude "id" (unset on a normal edit payload, so it would otherwise null
    # out the primary key) and "created_at" (this endpoint edits contact
    # details, not the client's original registration date - without this
    # exclusion, editing a client would silently reset when they were added).
    for key, value in client_data.dict(exclude={"id", "created_at"}).items():
        setattr(db_client, key, value)

    session.add(db_client)
    session.commit()
    session.refresh(db_client)
    return db_client

@router.delete("/{client_id}")
def delete_client(client_id: int, session: Session = Depends(get_session)):
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    session.delete(client)
    session.commit()
    return {"ok": True}


def _build_column_map(columns) -> dict:
    """Map each Client field to whichever actual column header matches one of
    its accepted aliases (case/whitespace-insensitive)."""
    normalized = {str(c).strip().lower(): c for c in columns}
    field_map = {}
    for field, aliases in _COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                field_map[field] = normalized[alias]
                break
    return field_map


def _clean(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    return text


@router.post("/import")
async def import_clients(file: UploadFile = File(...), session: Session = Depends(get_session)):
    """Import clients from a spreadsheet. Recognises common header spellings for
    name/email/phone/address/farm name (see _COLUMN_ALIASES) - it does not need
    an exact column layout.

    Matching an existing client: by email if the row has one, otherwise by an
    exact (case-insensitive) name match. A match is updated in place; otherwise
    a new client is created. Every row is handled independently so one bad row
    can't abort the whole import.
    """
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="File must be an Excel (.xlsx/.xls) or .csv file")

    contents = await file.read()
    try:
        # dtype=str keeps every column as text. Without it, pandas guesses
        # column types and a phone/cell number column like "0821234567" gets
        # read as a number, silently dropping the leading 0.
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents), dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(io.BytesIO(contents), dtype=str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the file: {exc}")

    column_map = _build_column_map(df.columns)
    if "name" not in column_map:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not find a name column in this file. "
                f"Columns found: {list(df.columns)}. "
                "Expected one of: " + ", ".join(_COLUMN_ALIASES["name"])
            ),
        )

    created, updated, skipped = 0, 0, 0
    errors = []

    # to_dict(orient="records") keeps the original column-name strings as keys.
    # itertuples()._asdict() was tried first but silently breaks on headers with
    # spaces/hyphens (e.g. "Client Name", "E-mail") because it sanitizes them
    # into namedtuple-safe identifiers, so the alias lookup below would find
    # nothing and every row would look blank.
    for excel_row_num, row_dict in enumerate(df.to_dict(orient="records"), start=2):  # +2: header row + 1-index
        try:
            name = _clean(row_dict.get(column_map.get("name")))
            if not name:
                skipped += 1
                continue

            email = _clean(row_dict.get(column_map.get("email"))) if "email" in column_map else None
            phone = _clean(row_dict.get(column_map.get("phone"))) if "phone" in column_map else None
            address = _clean(row_dict.get(column_map.get("address"))) if "address" in column_map else None
            farm_name = _clean(row_dict.get(column_map.get("farm_name"))) if "farm_name" in column_map else None

            existing = None
            if email:
                existing = session.exec(select(Client).where(Client.email.ilike(email))).first()
            if existing is None:
                existing = session.exec(select(Client).where(Client.name.ilike(name))).first()

            if existing:
                existing.name = name
                if email:
                    existing.email = email
                if phone:
                    existing.phone = phone
                if address:
                    existing.address = address
                if farm_name:
                    existing.farm_name = farm_name
                session.add(existing)
                updated += 1
            else:
                client = Client(name=name, email=email, phone=phone, address=address, farm_name=farm_name)
                session.add(client)
                created += 1
        except Exception as exc:
            errors.append({"row": excel_row_num, "error": str(exc)})

    session.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped_blank": skipped,
        "columns_matched": column_map,
        "errors": errors,
    }
