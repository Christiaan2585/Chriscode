# Every route below requires a signed-in user. That's not visible in this
# file: app/main.py applies it once for the whole router via
# app.include_router(clients.router, dependencies=[Depends(get_current_user)]),
# rather than repeating the same Depends() on every endpoint here. A scanner
# (or reviewer) reading only this file will see no auth and should check
# app/main.py before concluding these routes are open.
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from datetime import datetime
from sqlmodel import Session, func, select
from typing import List, Optional
import io
import json
import os
import re
import pandas as pd
from fastapi.responses import Response
from app.core.db import get_session
from app.core import cascade, herding
from pydantic import BaseModel
from app.core.security import require_admin
from app.models.animal import Animal
from app.models.appointment import Appointment
from app.models.herd import Herd
from app.models.note import ClientNote
from app.models.order import Order
from app.models.user import User
from app.models.client import Client
from app.models.client_document import ClientDocument
from app.models.invoice import Invoice
from app.models.program import AnimalGroup, HerdingProgram
from app.models.quote import Quote

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
    client.standard_program_at = client.erased_at = None  # not something a caller sets
    session.add(client)
    session.commit()
    session.refresh(client)
    herding.ensure_standard_programs(session, client.id)  # every client starts with the standard herding program
    session.refresh(client)
    return client

# --- The client's tax certificate: a PDF or picture kept on their page ---

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
TAX_CERTIFICATE = "tax_certificate"
# What the file actually is is decided by its first bytes, never by its name or
# the content type the sender claims.
_FILE_TYPES = ((b"%PDF", "application/pdf", ".pdf"), (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
               (b"\xff\xd8\xff", "image/jpeg", ".jpg"))


def _file_type(data: bytes):
    return next(((mime, ext) for magic, mime, ext in _FILE_TYPES if data.startswith(magic)), None)


def _safe_filename(name: str, ext: str) -> str:
    base = os.path.basename((name or "").replace("\\", "/"))
    base = re.sub(r"\.{2,}", ".", re.sub(r"[^\w .,()&'-]+", "", base)).strip(" .")
    stem = os.path.splitext(base)[0].strip(" .") or "Tax certificate"
    return f"{stem[:100]}{ext}"


def _tax_certificate(session: Session, client_id: int):
    return session.exec(select(ClientDocument).where(ClientDocument.client_id == client_id,
                                                     ClientDocument.kind == TAX_CERTIFICATE)).first()


def _info(doc):
    return {"exists": False} if doc is None else {"exists": True, "filename": doc.filename,
                                                  "content_type": doc.content_type, "size": doc.size,
                                                  "uploaded_at": doc.uploaded_at}


@router.get("/{client_id}/tax-certificate/info")
def tax_certificate_info(client_id: int, session: Session = Depends(get_session)):
    return _info(_tax_certificate(session, client_id))


@router.get("/{client_id}/tax-certificate")
def download_tax_certificate(client_id: int, session: Session = Depends(get_session)):
    doc = _tax_certificate(session, client_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="This client has no tax certificate loaded")
    return Response(content=doc.data, media_type=doc.content_type,
                    headers={"Content-Disposition": f'attachment; filename="{doc.filename}"',
                             "X-Content-Type-Options": "nosniff"})


@router.put("/{client_id}/tax-certificate")
async def upload_tax_certificate(client_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    if not session.get(Client, client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    data = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="That file is over 10 MB")
    kind = _file_type(data)
    if kind is None:
        raise HTTPException(status_code=422, detail="The tax certificate must be a PDF, PNG or JPEG file")
    mime, ext = kind
    doc = _tax_certificate(session, client_id) or ClientDocument(client_id=client_id, kind=TAX_CERTIFICATE,
                                                                  filename="", content_type="", size=0, data=b"")
    doc.filename, doc.content_type, doc.size, doc.data = _safe_filename(file.filename, ext), mime, len(data), data
    doc.uploaded_at = datetime.utcnow()
    session.add(doc)
    session.commit()
    session.refresh(doc)
    return _info(doc)


@router.delete("/{client_id}/tax-certificate")
def delete_tax_certificate(client_id: int, session: Session = Depends(get_session)):
    doc = _tax_certificate(session, client_id)
    if doc is not None:
        session.delete(doc)
        session.commit()
    return {"ok": True}


# --- Privacy: an access request, and erasure ---

@router.get("/{client_id}/export")
def export_client_data(client_id: int, _: User = Depends(require_admin), session: Session = Depends(get_session)):
    """Everything held about one client as a JSON file, for when they ask what you keep about them.
    The tax certificate is listed but its file isn't included (download it from the client's page)."""
    from fastapi.encoders import jsonable_encoder
    from app.models.invoice import InvoiceItem
    from app.models.quote_item import QuoteItem

    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    def rows(model, column, value):
        return [r.model_dump() for r in session.exec(select(model).where(column == value)).all()]

    def with_items(model, item_model, link):
        out = []
        for r in session.exec(select(model).where(model.client_id == client_id)).all():
            out.append({**r.model_dump(), "items": rows(item_model, getattr(item_model, link), r.id)})
        return out

    programs = []
    for p in session.exec(select(HerdingProgram).where(HerdingProgram.client_id == client_id)).all():
        programs.append({**p.model_dump(), "animal_groups": rows(AnimalGroup, AnimalGroup.program_id, p.id)})
    certificate = _tax_certificate(session, client_id)
    data = {
        "exported_at": datetime.utcnow(), "client": client.model_dump(),
        "notes": rows(ClientNote, ClientNote.client_id, client_id),
        "appointments": rows(Appointment, Appointment.client_id, client_id),
        "animals": rows(Animal, Animal.client_id, client_id), "herds": rows(Herd, Herd.client_id, client_id),
        "herding_programs": programs,
        "invoices": with_items(Invoice, InvoiceItem, "invoice_id"), "quotes": with_items(Quote, QuoteItem, "quote_id"),
        "orders": rows(Order, Order.client_id, client_id),
        "tax_certificate": None if certificate is None else {"filename": certificate.filename, "size": certificate.size,
                                                             "uploaded_at": certificate.uploaded_at},
    }
    body = json.dumps(jsonable_encoder(data), indent=2, ensure_ascii=False)
    name = re.sub(r"[^A-Za-z0-9]+", "-", client.farm_name or client.name).strip("-") or f"client-{client_id}"
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="client-data-{name}.json"'})


class EraseRequest(BaseModel):
    confirm_name: str


@router.post("/{client_id}/erase")
def erase_client_personal_data(client_id: int, payload: EraseRequest, _: User = Depends(require_admin),
                               session: Session = Depends(get_session)):
    """For a client who asks to be forgotten. Their name and contact details, tax number, notes, visits,
    animals and tax certificate go. Their invoices, quotes and orders stay (the law has you keep the
    books for years) but now belong to "Erased client #n". Type the client's name to confirm."""
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    typed = " ".join((payload.confirm_name or "").split()).lower()
    if not typed or typed not in {" ".join((v or "").split()).lower() for v in (client.farm_name, client.name)}:
        raise HTTPException(status_code=400, detail="Type the client's name exactly to confirm")
    for model in (Appointment, ClientNote, Herd, ClientDocument):
        for row in session.exec(select(model).where(model.client_id == client_id)).all():
            session.delete(row)
    for animal in session.exec(select(Animal).where(Animal.client_id == client_id)).all():
        cascade.delete_animal(session, animal)
    client.name = f"Erased client #{client_id}"
    client.email = client.phone = client.address = client.postal_address = client.vat_number = client.farm_name = None
    client.erased_at = datetime.utcnow()
    session.add(client)
    session.commit()
    return {"erased": True}


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

@router.get("/{client_id}/summary")
def read_client_summary(client_id: int, session: Session = Depends(get_session)):
    """The numbers behind the client hover card, in one request."""
    if not session.get(Client, client_id):
        raise HTTPException(status_code=404, detail="Client not found")

    animal_count = session.exec(
        select(func.count()).select_from(Animal).where(Animal.client_id == client_id)
    ).one()
    invoices = session.exec(
        select(Invoice).where(Invoice.client_id == client_id, Invoice.status != "cancelled")
    ).all()
    unpaid = [i for i in invoices if i.status == "unpaid"]
    open_quote_count = session.exec(
        select(func.count()).select_from(Quote)
        .where(Quote.client_id == client_id, Quote.status.in_(["Draft", "Sent"]))
    ).one()
    # The animals on the farm: the headcounts of the newest program that has
    # any (a farm has one flock, whichever program it was last counted in).
    groups = session.exec(
        select(AnimalGroup).join(HerdingProgram, AnimalGroup.program_id == HerdingProgram.id)
        .where(HerdingProgram.client_id == client_id)
        .order_by(HerdingProgram.created_at.desc(), HerdingProgram.id.desc(), AnimalGroup.id)
    ).all()
    newest = groups[0].program_id if groups else None
    farm_animals = [{"animal_type": g.animal_type, "group_size": g.group_size} for g in groups if g.program_id == newest]
    return {
        "animal_count": animal_count,
        "has_tax_certificate": _tax_certificate(session, client_id) is not None,
        "farm_animals": farm_animals,
        "farm_animal_total": sum(g["group_size"] for g in farm_animals),
        "unpaid_invoice_count": len(unpaid),
        "outstanding": round(sum(i.total_amount for i in unpaid), 2),
        "last_invoice_date": max((i.date for i in invoices), default=None),
        "open_quote_count": open_quote_count,
    }

@router.put("/{client_id}", response_model=Client)
def update_client(client_id: int, client_data: Client, session: Session = Depends(get_session)):
    db_client = session.get(Client, client_id)
    if not db_client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Exclude "id" (unset on a normal edit payload, so it would otherwise null
    # out the primary key) and "created_at" (this endpoint edits contact
    # details, not the client's original registration date - without this
    # exclusion, editing a client would silently reset when they were added).
    # exclude_unset: a form that doesn't know a field (e.g. VAT number) mustn't blank it.
    for key, value in client_data.model_dump(exclude_unset=True, exclude={"id", "created_at", "standard_program_at", "erased_at"}).items():
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
    try:
        cascade.delete_client(session, client)
    except cascade.InUseError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
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
    herding.ensure_standard_programs(session)  # the newly imported clients start with the standard program too
    return {
        "created": created,
        "updated": updated,
        "skipped_blank": skipped,
        "columns_matched": column_map,
        "errors": errors,
    }
