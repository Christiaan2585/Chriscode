from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.core.security import get_current_user
from app.models.note import ClientNote
from app.models.user import User

KINDS = {None, "", "call"}

router = APIRouter(prefix="/notes", tags=["Notes & Reminders"])

@router.post("/", response_model=ClientNote)
def create_note(note: ClientNote, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    note.id = None  # the database picks the number
    if note.kind not in KINDS:
        raise HTTPException(status_code=422, detail="A note is either an ordinary note or a call")
    note.kind = note.kind or None
    note.author = user.name  # who wrote it is never taken from the request
    note.reminder_date = coerce_datetime(note.reminder_date)
    session.add(note)
    session.commit()
    session.refresh(note)
    return note

@router.get("/client/{client_id}", response_model=List[ClientNote])
def read_notes_by_client(client_id: int, session: Session = Depends(get_session)):
    statement = select(ClientNote).where(ClientNote.client_id == client_id)
    return session.exec(statement).all()

@router.patch("/{note_id}/complete")
def complete_note(note_id: int, session: Session = Depends(get_session)):
    note = session.get(ClientNote, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.is_completed = True
    session.add(note)
    session.commit()
    return {"ok": True}

@router.delete("/{note_id}")
def delete_note(note_id: int, session: Session = Depends(get_session)):
    note = session.get(ClientNote, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    session.delete(note)
    session.commit()
    return {"ok": True}
