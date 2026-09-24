from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.animal import Animal

router = APIRouter(prefix="/animals", tags=["Animals"])

@router.post("/", response_model=Animal)
def create_animal(animal: Animal, session: Session = Depends(get_session)):
    animal.birth_date = coerce_datetime(animal.birth_date)
    session.add(animal)
    session.commit()
    session.refresh(animal)
    return animal

@router.get("/", response_model=List[Animal])
def read_animals(
    species: Optional[str] = None,
    age_group: Optional[str] = None,
    session: Session = Depends(get_session)
):
    statement = select(Animal)
    if species:
        statement = statement.where(Animal.species == species)
    if age_group:
        statement = statement.where(Animal.age_group == age_group)
    animals = session.exec(statement).all()
    return animals

@router.get("/client/{client_id}", response_model=List[Animal])
def read_animals_by_client(client_id: int, session: Session = Depends(get_session)):
    statement = select(Animal).where(Animal.client_id == client_id)
    animals = session.exec(statement).all()
    return animals

@router.get("/{animal_id}", response_model=Animal)
def read_animal(animal_id: int, session: Session = Depends(get_session)):
    animal = session.get(Animal, animal_id)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    return animal

@router.put("/{animal_id}", response_model=Animal)
def update_animal(animal_id: int, animal_data: Animal, session: Session = Depends(get_session)):
    db_animal = session.get(Animal, animal_id)
    if not db_animal:
        raise HTTPException(status_code=404, detail="Animal not found")

    animal_data.birth_date = coerce_datetime(animal_data.birth_date)

    # Exclude "id" and "created_at": id is unset on a normal edit payload (it
    # would otherwise null the primary key), and created_at should stay as
    # the animal's original registration date, not reset on every edit.
    for key, value in animal_data.dict(exclude={"id", "created_at"}).items():
        setattr(db_animal, key, value)

    session.add(db_animal)
    session.commit()
    session.refresh(db_animal)
    return db_animal

@router.delete("/{animal_id}")
def delete_animal(animal_id: int, session: Session = Depends(get_session)):
    animal = session.get(Animal, animal_id)
    if not animal:
        raise HTTPException(status_code=404, detail="Animal not found")
    session.delete(animal)
    session.commit()
    return {"ok": True}
