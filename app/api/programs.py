from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.models.program import HerdingProgram, ProgramAssignment
from app.models.animal import Animal

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

@router.get("/client/{client_id}", response_model=List[HerdingProgram])
def read_programs_by_client(client_id: int, session: Session = Depends(get_session)):
    """Every program with at least one animal belonging to this client assigned to it."""
    animal_ids = session.exec(select(Animal.id).where(Animal.client_id == client_id)).all()
    if not animal_ids:
        return []
    program_ids = session.exec(
        select(ProgramAssignment.program_id).where(ProgramAssignment.animal_id.in_(animal_ids))
    ).all()
    if not program_ids:
        return []
    statement = select(HerdingProgram).where(HerdingProgram.id.in_(set(program_ids)))
    return session.exec(statement).all()

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
