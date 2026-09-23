from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.models.program import HerdingProgram, ProgramAssignment, AnimalGroup

router = APIRouter(prefix="/programs", tags=["Herding Programs"])

@router.post("/", response_model=HerdingProgram)
def create_program(program: HerdingProgram, session: Session = Depends(get_session)):
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
