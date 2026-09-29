from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select
from typing import List, Literal, Optional
import io
import re
import pandas as pd
from app.api.business import get_business, price_line
from app.api.quotes import _recalculate_total, create_quote
from app.core import herding
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.core.pdf import generate_program_pdf
from app.core.security import get_current_user, require_admin
from app.models.client import Client
from app.models.product import Product
from app.models.program import (AnimalGroup, HerdingProgram, ProgramAssignment, ProgramStep, ProgramStepProduct,
                                ProgramStepProgress)
from app.models.quote import Quote
from app.models.quote_item import QuoteItem
from app.models.user import User

router = APIRouter(prefix="/programs", tags=["Herding Programs"])


class ProgramFields(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    goal: Optional[str] = Field(default=None, max_length=1000)
    description: Optional[str] = Field(default=None, max_length=2000)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    mating_date: Optional[datetime] = None
    mating_weeks: Optional[int] = Field(default=None, ge=1, le=52)
    weaning_rule: Optional[Literal["age", "fixed"]] = None
    weaning_months: Optional[int] = Field(default=None, ge=1, le=12)
    weaning_days: Optional[int] = Field(default=None, ge=30, le=720)


class ProgramCreate(ProgramFields):
    name: str = Field(min_length=1, max_length=200)
    client_id: Optional[int] = None  # the Streamlit dashboard still makes client-less programs


def _dates_only(value):
    """Mating and program dates are whole days; a time part would shift them."""
    value = coerce_datetime(value)
    return datetime(value.year, value.month, value.day) if value else None


@router.post("/", response_model=HerdingProgram)
def create_program(data: ProgramCreate, session: Session = Depends(get_session)):
    if data.client_id is not None and not session.get(Client, data.client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    program = HerdingProgram(**data.model_dump())
    for key in ("start_date", "end_date", "mating_date"):
        setattr(program, key, _dates_only(getattr(program, key)))
    session.add(program)
    session.commit()
    session.refresh(program)
    return program


@router.patch("/{program_id}", response_model=HerdingProgram)
def update_program(program_id: int, data: ProgramFields, session: Session = Depends(get_session)):
    program = session.get(HerdingProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "name" and not value:
            raise HTTPException(status_code=422, detail="The program needs a name")
        setattr(program, key, _dates_only(value) if key.endswith("_date") else value)
    session.add(program)
    session.commit()
    session.refresh(program)
    return program

@router.get("/", response_model=List[HerdingProgram])
def read_programs(session: Session = Depends(get_session)):
    programs = session.exec(select(HerdingProgram)).all()
    return programs

@router.get("/client/{client_id}")
def read_programs_by_client(client_id: int, session: Session = Depends(get_session)):
    """Programs created directly for this client, with their animal groups
    embedded so the client page can show name/dates/purpose plus the group
    breakdown (e.g. "Goats x 12") without a separate request per program."""
    statement = select(HerdingProgram).where(HerdingProgram.client_id == client_id)
    programs = session.exec(statement).all()
    result = []
    for program in programs:
        groups = session.exec(
            select(AnimalGroup).where(AnimalGroup.program_id == program.id)
        ).all()
        result.append({**program.dict(), "groups": [g.dict() for g in groups]})
    return result

@router.delete("/{program_id}")
def delete_program(program_id: int, session: Session = Depends(get_session)):
    program = session.get(HerdingProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    # Remove its animal groups and any legacy individual-animal assignments
    # first so we don't leave orphaned rows behind.
    for group in session.exec(select(AnimalGroup).where(AnimalGroup.program_id == program_id)).all():
        session.delete(group)
    for model in (ProgramAssignment, ProgramStepProgress):
        for row in session.exec(select(model).where(model.program_id == program_id)).all():
            session.delete(row)
    session.delete(program)
    session.commit()
    return {"ok": True}

@router.get("/{program_id}/groups", response_model=List[AnimalGroup])
def read_program_groups(program_id: int, session: Session = Depends(get_session)):
    statement = select(AnimalGroup).where(AnimalGroup.program_id == program_id)
    return session.exec(statement).all()

@router.post("/{program_id}/groups", response_model=AnimalGroup)
def add_program_group(program_id: int, group: AnimalGroup, session: Session = Depends(get_session)):
    program = session.get(HerdingProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    group.id = None
    group.program_id = program_id
    session.add(group)
    session.commit()
    session.refresh(group)
    return group

@router.delete("/groups/{group_id}")
def delete_program_group(group_id: int, session: Session = Depends(get_session)):
    group = session.get(AnimalGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    session.delete(group)
    session.commit()
    return {"ok": True}

# --- Legacy individual-animal assignment endpoints, kept for the
# standalone (no-longer-linked-in-nav) Herding Programs page. ---

@router.post("/assign", response_model=ProgramAssignment)
def assign_animal_to_program(assignment: ProgramAssignment, session: Session = Depends(get_session)):
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment

@router.get("/{program_id}/animals", response_model=List[int])
def read_animals_in_program(program_id: int, session: Session = Depends(get_session)):
    statement = select(ProgramAssignment.animal_id).where(ProgramAssignment.program_id == program_id)
    animal_ids = session.exec(statement).all()
    return animal_ids

@router.delete("/assign/{animal_id}/{program_id}")
def remove_animal_from_program(animal_id: int, program_id: int, session: Session = Depends(get_session)):
    statement = select(ProgramAssignment).where(
        ProgramAssignment.animal_id == animal_id,
        ProgramAssignment.program_id == program_id
    )
    assignment = session.exec(statement).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    session.delete(assignment)
    session.commit()
    return {"ok": True}


# Accepted spreadsheet header spellings, mapped to their meaning - same
# case/whitespace-insensitive matching approach as clients.py's own import.
_COLUMN_ALIASES = {
    "client": ["client", "client name", "client email", "customer", "customer name"],
    "program": ["program", "program name", "programme", "programme name"],
    "animal_type": ["animal type", "animal", "species", "type"],
    "count": ["count", "group size", "number", "quantity", "qty", "headcount"],
    "goal": ["goal", "purpose", "what is this program for", "notes"],
    "start_date": ["start date", "start"],
    "end_date": ["end date", "end"],
}


def _build_column_map(columns) -> dict:
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


def _parse_date(value) -> Optional[datetime]:
    text = _clean(value)
    if not text:
        return None
    try:
        return pd.to_datetime(text).to_pydatetime()
    except Exception:
        return None


@router.post("/import")
async def import_programs(file: UploadFile = File(...), session: Session = Depends(get_session)):
    """Import herding programs and their animal-type headcounts from a
    spreadsheet, one row per animal type (e.g. one row "12 Goats", another
    "5 Sheep" - both under the same Client + Program Name - become a single
    HerdingProgram with two AnimalGroup rows).

    Each row needs a Client column (matched against an EXISTING client by
    exact, case-insensitive name or email - this endpoint never creates a
    client, since a program needs a real client to belong to), a Program
    Name, an Animal Type and a Count. Goal/Start Date/End Date are optional
    and read from each program's first row; a blank cell keeps what the
    program already has.

    Programs merge rather than duplicate: a row matches the client's existing
    program of the same name (case-insensitive, oldest first if there are
    already copies), and an animal type the program already has gets the
    file's count instead of a second group. So re-importing a file is safe,
    and an edited file updates the counts. Groups not in the file are left
    alone - an import never deletes anything.

    Every row is handled independently so one bad row can't abort the whole
    import."""
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="File must be an Excel (.xlsx/.xls) or .csv file")

    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents), dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(io.BytesIO(contents), dtype=str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the file: {exc}")

    column_map = _build_column_map(df.columns)
    missing = [f for f in ("client", "program", "animal_type", "count") if f not in column_map]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not find a column for: {', '.join(missing)}. "
                f"Columns found: {list(df.columns)}."
            ),
        )

    created_programs, skipped = 0, 0
    errors = []
    # (client_id, lowercased program name) -> HerdingProgram, so every row of
    # one program in this file lands on the same program.
    programs_by_key: dict = {}
    # (program_id, lowercased animal type) -> (AnimalGroup, size before this
    # import, or None if new). A type seen before this import is replaced by
    # the file's count; repeats within the file add up.
    groups_touched: dict = {}

    for excel_row_num, row_dict in enumerate(df.to_dict(orient="records"), start=2):
        try:
            client_ref = _clean(row_dict.get(column_map.get("client")))
            program_name = _clean(row_dict.get(column_map.get("program")))
            animal_type = _clean(row_dict.get(column_map.get("animal_type")))
            count_raw = _clean(row_dict.get(column_map.get("count")))

            if not client_ref and not program_name and not animal_type and not count_raw:
                skipped += 1
                continue

            if not client_ref or not program_name or not animal_type or not count_raw:
                raise ValueError("Client, Program Name, Animal Type and Count are all required")

            try:
                count = int(float(count_raw))
            except ValueError:
                raise ValueError(f"Count '{count_raw}' is not a number")
            if count <= 0:
                raise ValueError("Count must be greater than 0")

            client = session.exec(select(Client).where(Client.email.ilike(client_ref))).first()
            if client is None:
                client = session.exec(select(Client).where(Client.name.ilike(client_ref))).first()
            if client is None:
                raise ValueError(f"No existing client matches '{client_ref}' - add the client first")

            key = (client.id, program_name.lower())
            program = programs_by_key.get(key)
            if program is None:
                program = session.exec(
                    select(HerdingProgram)
                    .where(HerdingProgram.client_id == client.id,
                           func.lower(HerdingProgram.name) == program_name.lower())
                    .order_by(HerdingProgram.id)
                ).first()
                if program is None:
                    program = HerdingProgram(name=program_name, client_id=client.id)
                    created_programs += 1
                goal = _clean(row_dict.get(column_map["goal"])) if "goal" in column_map else None
                start = _parse_date(row_dict.get(column_map["start_date"])) if "start_date" in column_map else None
                end = _parse_date(row_dict.get(column_map["end_date"])) if "end_date" in column_map else None
                program.goal = goal or program.goal
                program.start_date = start or program.start_date
                program.end_date = end or program.end_date
                session.add(program)
                session.flush()  # assigns program.id without ending the transaction
                programs_by_key[key] = program

            group_key = (program.id, animal_type.lower())
            if group_key in groups_touched:
                groups_touched[group_key][0].group_size += count
            else:
                group = session.exec(
                    select(AnimalGroup).where(AnimalGroup.program_id == program.id,
                                              func.lower(AnimalGroup.animal_type) == animal_type.lower())
                ).first()
                previous_size = group.group_size if group else None
                if group is None:
                    group = AnimalGroup(program_id=program.id, animal_type=animal_type)
                group.group_size = count
                session.add(group)
                groups_touched[group_key] = (group, previous_size)
        except Exception as exc:
            errors.append({"row": excel_row_num, "error": str(exc)})

    session.commit()
    return {
        "created": created_programs,
        "updated": sum(1 for group, before in groups_touched.values() if group.group_size != before),
        "skipped_blank": skipped,
        "columns_matched": column_map,
        "errors": errors,
    }


# --- The master herding program (everyone reads it, only admins change it) ---

class TemplateSettings(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    gestation_days: Optional[int] = Field(default=None, ge=100, le=320)
    mating_weeks: Optional[int] = Field(default=None, ge=1, le=52)
    weaning_rule: Optional[Literal["age", "fixed"]] = None
    weaning_months: Optional[int] = Field(default=None, ge=1, le=12)
    weaning_days: Optional[int] = Field(default=None, ge=30, le=720)


class StepFields(BaseModel):
    anchor: Optional[Literal[herding.ANCHORS]] = None
    offset_days: Optional[int] = Field(default=None, ge=-400, le=800)
    sort_order: Optional[int] = None
    stage: Optional[str] = Field(default=None, max_length=300)
    management: Optional[str] = Field(default=None, max_length=3000)
    vaccinations: Optional[str] = Field(default=None, max_length=3000)
    dosing: Optional[str] = Field(default=None, max_length=3000)
    vitamins: Optional[str] = Field(default=None, max_length=3000)
    feeding: Optional[str] = Field(default=None, max_length=3000)


class StepProductFields(BaseModel):
    product_id: Optional[int] = None
    animal_group: Optional[str] = Field(default=None, max_length=60)
    dose: Optional[float] = Field(default=None, ge=0, le=100_000)
    note: Optional[str] = Field(default=None, max_length=200)


class StepDone(BaseModel):
    done: bool


class ProgramQuoteRequest(BaseModel):
    line_ids: List[int] = Field(min_length=1, max_length=500)


MAX_TEMPLATE_UPLOAD_BYTES = 5 * 1024 * 1024


def _blank_to_none(changes: dict) -> dict:
    return {k: (v.strip() or None) if isinstance(v, str) else v for k, v in changes.items()}


def _template_out(session: Session) -> dict:
    steps = herding.ordered_steps(session)
    products = herding.step_products(session, [s.id for s in steps])
    return {
        "settings": herding.get_template(session),
        "anchors": list(herding.ANCHORS),
        "steps": [{**s.model_dump(), "products": [
            {**line.model_dump(), "product_name": p.name, "unit": p.unit, "pack_size": p.pack_size}
            for line, p in products.get(s.id, [])]} for s in steps],
    }


@router.get("/template")
def read_template(mating_date: Optional[date] = None, session: Session = Depends(get_session)):
    """The master program; with mating_date, each step's date for a program
    starting then (the default weaning rule), to check against the sheet."""
    out = _template_out(session)
    if mating_date:
        anchors = herding.anchor_dates(HerdingProgram(name="preview", mating_date=mating_date), out["settings"])
        for step in out["steps"]:
            step["date"] = anchors[step["anchor"]] + timedelta(days=step["offset_days"])
    return out


@router.put("/template")
def update_template(data: TemplateSettings, session: Session = Depends(get_session), _: User = Depends(require_admin)):
    template = herding.get_template(session)
    for key, value in _blank_to_none(data.model_dump(exclude_unset=True)).items():
        if value is None:
            raise HTTPException(status_code=422, detail=f"{key.replace('_', ' ').capitalize()} can't be empty")
        setattr(template, key, value)
    template.updated_at = datetime.utcnow()
    session.add(template)
    session.commit()
    return _template_out(session)


@router.post("/template/import")
async def import_template(file: UploadFile = File(...), session: Session = Depends(get_session),
                          _: User = Depends(require_admin)):
    data = await file.read(MAX_TEMPLATE_UPLOAD_BYTES + 1)
    if len(data) > MAX_TEMPLATE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is over 5 MB - it can't be a herding program sheet")
    try:
        result = herding.import_template(session, data)
    except herding.TemplateImportError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    return {**result, **_template_out(session)}


@router.post("/template/steps")
def create_template_step(data: StepFields, session: Session = Depends(get_session), _: User = Depends(require_admin)):
    last = session.exec(select(func.max(ProgramStep.sort_order))).one() or 0
    step = ProgramStep(**{"sort_order": last + 1, **_blank_to_none(data.model_dump(exclude_unset=True))})
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


@router.patch("/template/steps/{step_id}")
def update_template_step(step_id: int, data: StepFields, session: Session = Depends(get_session),
                         _: User = Depends(require_admin)):
    step = session.get(ProgramStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    for key, value in _blank_to_none(data.model_dump(exclude_unset=True)).items():
        if value is None and key in ("anchor", "offset_days", "sort_order"):
            raise HTTPException(status_code=422, detail="A step needs its date rule")
        setattr(step, key, value)
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


@router.delete("/template/steps/{step_id}")
def delete_template_step(step_id: int, session: Session = Depends(get_session), _: User = Depends(require_admin)):
    step = session.get(ProgramStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    herding.delete_step(session, step)
    session.commit()
    return {"ok": True}


def _checked_product(session: Session, product_id) -> Product:
    product = session.get(Product, product_id) if product_id else None
    if product is None:
        raise HTTPException(status_code=422, detail="Choose a product")
    return product


@router.post("/template/steps/{step_id}/products")
def add_step_product(step_id: int, data: StepProductFields, session: Session = Depends(get_session),
                     _: User = Depends(require_admin)):
    if not session.get(ProgramStep, step_id):
        raise HTTPException(status_code=404, detail="Step not found")
    _checked_product(session, data.product_id)
    line = ProgramStepProduct(step_id=step_id, **_blank_to_none(data.model_dump(exclude_unset=True)))
    session.add(line)
    session.commit()
    session.refresh(line)
    return line


@router.patch("/template/products/{line_id}")
def update_step_product(line_id: int, data: StepProductFields, session: Session = Depends(get_session),
                        _: User = Depends(require_admin)):
    line = session.get(ProgramStepProduct, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Product line not found")
    changes = _blank_to_none(data.model_dump(exclude_unset=True))
    if "product_id" in changes:
        _checked_product(session, changes["product_id"])
    for key, value in changes.items():
        setattr(line, key, value)
    session.add(line)
    session.commit()
    session.refresh(line)
    return line


@router.delete("/template/products/{line_id}")
def delete_step_product(line_id: int, session: Session = Depends(get_session), _: User = Depends(require_admin)):
    line = session.get(ProgramStepProduct, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Product line not found")
    session.delete(line)
    session.commit()
    return {"ok": True}


# --- A client's program running on the master program ---

def _program_or_404(session: Session, program_id: int) -> HerdingProgram:
    program = session.get(HerdingProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


@router.get("/calendar")
def program_calendar(start: date, end: date, session: Session = Depends(get_session)):
    """Every client program's steps dated between start and end (inclusive)."""
    if end < start or end - start > timedelta(days=400):
        raise HTTPException(status_code=422, detail="Choose a date range of at most 400 days")
    clients = {c.id: c.name for c in session.exec(select(Client)).all()}
    events = []
    for program in session.exec(select(HerdingProgram).where(HerdingProgram.mating_date.is_not(None))).all():
        for step in herding.schedule(session, program)["steps"]:
            if start <= step["date"] <= end:
                events.append({"date": step["date"], "status": step["status"], "step_id": step["id"],
                               "stage": step["stage"], "program_id": program.id, "program_name": program.name,
                               "client_id": program.client_id, "client_name": clients.get(program.client_id)})
    return sorted(events, key=lambda e: (e["date"], e["client_name"] or ""))


@router.get("/{program_id}/schedule")
def program_schedule(program_id: int, session: Session = Depends(get_session)):
    program = _program_or_404(session, program_id)
    groups = session.exec(select(AnimalGroup).where(AnimalGroup.program_id == program_id)).all()
    return {"program": program, "groups": groups, "template": herding.get_template(session),
            **herding.schedule(session, program)}


@router.put("/{program_id}/steps/{step_id}/done")
def set_step_done(program_id: int, step_id: int, data: StepDone, session: Session = Depends(get_session)):
    _program_or_404(session, program_id)
    if not session.get(ProgramStep, step_id):
        raise HTTPException(status_code=404, detail="Step not found")
    row = session.get(ProgramStepProgress, (program_id, step_id))
    if data.done and row is None:
        session.add(ProgramStepProgress(program_id=program_id, step_id=step_id))
    elif not data.done and row is not None:
        session.delete(row)
    session.commit()
    return {"ok": True}


@router.post("/{program_id}/quote")
def quote_from_program(program_id: int, data: ProgramQuoteRequest, session: Session = Depends(get_session),
                       user: User = Depends(get_current_user)):
    """A draft quote for the ticked product lines, their amounts worked out
    from this program's headcounts and added up per product."""
    program = _program_or_404(session, program_id)
    if not program.client_id or not session.get(Client, program.client_id):
        raise HTTPException(status_code=422, detail="This program isn't linked to a client")
    groups = session.exec(select(AnimalGroup).where(AnimalGroup.program_id == program_id)).all()
    totals, skipped, stages = {}, [], []
    for line_id in dict.fromkeys(data.line_ids):
        line = session.get(ProgramStepProduct, line_id)
        product = session.get(Product, line.product_id) if line else None
        if product is None:
            skipped.append("A product line that has since been removed from the program")
            continue
        total, _ = herding.quantity_for(product, line.dose, herding.headcount(groups, line.animal_group))
        if not total:
            skipped.append(f"{product.name} for {line.animal_group or 'all animals'}: "
                           + ("no dose set" if not line.dose else "no animals in that group"))
            continue
        totals[product.id] = (product, totals.get(product.id, (product, 0))[1] + total)
        step = session.get(ProgramStep, line.step_id)
        if step and step.stage and step.stage not in stages:
            stages.append(step.stage)
    if not totals:
        raise HTTPException(status_code=422, detail="Nothing to quote: " + "; ".join(skipped))

    notes = f"Herding program: {program.name}" + (f" - {', '.join(stages)}" if stages else "")
    quote = create_quote(Quote(client_id=program.client_id, reference="Herding program", notes=notes[:1000]),
                         session, user)
    for product, total in totals.values():
        _, units = herding.quantity_for(product, total, 1)
        item = QuoteItem(quote_id=quote.id, product_id=product.id, quantity=units, unit_price=0.0)
        price_line(session, item)
        session.add(item)
    session.flush()
    _recalculate_total(session, quote)
    session.commit()
    session.refresh(quote)
    return {"quote": quote, "skipped": skipped}


@router.get("/{program_id}/pdf")
def program_pdf(program_id: int, session: Session = Depends(get_session)):
    program = _program_or_404(session, program_id)
    if program.mating_date is None:
        raise HTTPException(status_code=422, detail="Set the first mating date to print this program")
    client = session.get(Client, program.client_id) if program.client_id else None
    groups = session.exec(select(AnimalGroup).where(AnimalGroup.program_id == program_id)).all()
    pdf = generate_program_pdf(get_business(session), client, program, groups,
                               herding.schedule(session, program), herding.get_template(session))
    name = re.sub(r"[^A-Za-z0-9]+", "-", f"{client.name if client else ''} {program.name}").strip("-") or "program"
    return Response(content=pdf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=herding-program-{name}.pdf"})
