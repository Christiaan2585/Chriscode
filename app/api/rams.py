"""Ram ID tags: each farm's rams with their ear-tag number, name, breed, birth date and notes.

A ram is an ordinary `Animal` (species Sheep, gender Ram) so its medical and weight records, if any, keep
working; this router is the simple door to them - the whole animals registry stays hidden in the app.
A tag number can only be used once per farm (compared without regard to capital letters)."""
import re
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core import cascade
from app.core.dates import coerce_datetime
from app.core.db import get_session
from app.models.animal import Animal
from app.models.client import Client

router = APIRouter(prefix="/rams", tags=["Rams"])

SPECIES, GENDER = "Sheep", "Ram"
MAX_TAG = 40
YOUNG_DAYS = 365

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class RamCreate(BaseModel):
    client_id: int
    tag_id: str
    name: Optional[str] = None
    breed: Optional[str] = None
    birth_date: Optional[str] = None  # YYYY-MM-DD from the date box
    notes: Optional[str] = None


class RamPatch(BaseModel):
    tag_id: Optional[str] = None
    name: Optional[str] = None
    breed: Optional[str] = None
    birth_date: Optional[str] = None
    notes: Optional[str] = None


def _tag(value: Optional[str]) -> str:
    tag = re.sub(" +", " ", (value or "").strip())
    if not tag:
        raise HTTPException(status_code=422, detail="Every ram needs its tag number")
    if len(tag) > MAX_TAG or _CONTROL.search(tag):
        raise HTTPException(status_code=422, detail=f"A tag number is at most {MAX_TAG} letters and numbers")
    return tag


def _text(value: Optional[str], limit: int) -> Optional[str]:
    text = (value or "").strip()
    return text[:limit] or None


def _age_group(birth_date: Optional[datetime]) -> str:
    return "Young" if birth_date and datetime.utcnow() - birth_date < timedelta(days=YOUNG_DAYS) else "Adult"


def _birth_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return coerce_datetime(value)
    except ValueError:
        raise HTTPException(status_code=422, detail="That birth date is not a date")


def _is_ram(animal: Optional[Animal]) -> bool:
    return bool(animal) and animal.species == SPECIES and animal.gender == GENDER


def _ram_or_404(session: Session, ram_id: int) -> Animal:
    animal = session.get(Animal, ram_id)
    if not _is_ram(animal):
        raise HTTPException(status_code=404, detail="Ram not found")
    return animal


def _check_free(session: Session, client_id: int, tag: str, ignore_id: Optional[int] = None) -> None:
    for other in session.exec(select(Animal).where(Animal.client_id == client_id)).all():
        if other.id != ignore_id and (other.tag_id or "").casefold() == tag.casefold():
            raise HTTPException(status_code=409, detail=f"Tag {tag} is already on another animal on this farm")


@router.get("/", response_model=List[Animal])
def read_rams(session: Session = Depends(get_session)):
    """Every ram on every farm (the top search looks tags up here)."""
    rows = session.exec(select(Animal).where(Animal.species == SPECIES, Animal.gender == GENDER)).all()
    return sorted(rows, key=lambda r: (r.client_id, (r.tag_id or "").casefold()))


@router.get("/client/{client_id}", response_model=List[Animal])
def read_client_rams(client_id: int, session: Session = Depends(get_session)):
    rows = session.exec(select(Animal).where(Animal.client_id == client_id, Animal.species == SPECIES, Animal.gender == GENDER)).all()
    return sorted(rows, key=lambda r: (r.tag_id or "").casefold())


@router.post("/", response_model=Animal)
def create_ram(data: RamCreate, session: Session = Depends(get_session)):
    if not session.get(Client, data.client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    tag = _tag(data.tag_id)
    _check_free(session, data.client_id, tag)
    born = _birth_date(data.birth_date)
    ram = Animal(client_id=data.client_id, tag_id=tag, name=_text(data.name, 80) or f"Ram {tag}", species=SPECIES, gender=GENDER,
                 breed=_text(data.breed, 80), birth_date=born, age_group=_age_group(born), notes=_text(data.notes, 1000))
    session.add(ram)
    session.commit()
    session.refresh(ram)
    return ram


@router.patch("/{ram_id}", response_model=Animal)
def update_ram(ram_id: int, changes: RamPatch, session: Session = Depends(get_session)):
    """Only what was sent changes; a field sent empty is cleared (the tag cannot be)."""
    ram = _ram_or_404(session, ram_id)
    sent = changes.model_dump(exclude_unset=True)
    if "tag_id" in sent:
        tag = _tag(sent["tag_id"])
        _check_free(session, ram.client_id, tag, ignore_id=ram.id)
        ram.tag_id = tag
    if "name" in sent:
        ram.name = _text(sent["name"], 80) or f"Ram {ram.tag_id}"
    if "breed" in sent:
        ram.breed = _text(sent["breed"], 80)
    if "notes" in sent:
        ram.notes = _text(sent["notes"], 1000)
    if "birth_date" in sent:
        ram.birth_date = _birth_date(sent["birth_date"])
        ram.age_group = _age_group(ram.birth_date)
    session.add(ram)
    session.commit()
    session.refresh(ram)
    return ram


@router.delete("/{ram_id}")
def delete_ram(ram_id: int, session: Session = Depends(get_session)):
    ram = _ram_or_404(session, ram_id)
    cascade.delete_animal(session, ram)
    session.commit()
    return {"ok": True}
