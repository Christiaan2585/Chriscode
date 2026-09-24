from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from typing import List, Optional
import io
import pandas as pd
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.client import Client
from app.models.program import HerdingProgram, ProgramAssignment, AnimalGroup

router = APIRouter(prefix="/programs", tags=["Herding Programs"])

@router.post("/", response_model=HerdingProgram)
def create_program(program: HerdingProgram, session: Session = Depends(get_session)):
    program.start_date = coerce_datetime(program.start_date)
    program.end_date = coerce_datetime(program.end_date)
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
    for assignment in session.exec(select(ProgramAssignment).where(ProgramAssignment.program_id == program_id)).all():
        session.delete(assignment)
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
    and only need to appear once per program (the first non-blank value for
    that program wins).

    Every row is handled independently so one bad row can't abort the whole
    import. Re-importing the same file creates a second copy of each
    program rather than merging into the one from the first import - there
    is no "already imported" tracking (v1 limitation, same as this app's
    other importers don't yet dedupe across separate import runs)."""
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

    created_programs, created_groups, skipped = 0, 0, 0
    errors = []
    # Groups rows into one HerdingProgram per (client_id, program name) seen
    # so far in this import, rather than one row = one program.
    programs_by_key: dict = {}

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
                program = HerdingProgram(
                    name=program_name,
                    client_id=client.id,
                    goal=_clean(row_dict.get(column_map.get("goal"))) if "goal" in column_map else None,
                    start_date=_parse_date(row_dict.get(column_map.get("start_date"))) if "start_date" in column_map else None,
                    end_date=_parse_date(row_dict.get(column_map.get("end_date"))) if "end_date" in column_map else None,
                )
                session.add(program)
                session.flush()  # assigns program.id without ending the transaction
                programs_by_key[key] = program
                created_programs += 1

            session.add(AnimalGroup(program_id=program.id, animal_type=animal_type, group_size=count))
            created_groups += 1
        except Exception as exc:
            errors.append({"row": excel_row_num, "error": str(exc)})

    session.commit()
    return {
        "created": created_programs,
        "updated": created_groups,
        "skipped_blank": skipped,
        "columns_matched": column_map,
        "errors": errors,
    }
