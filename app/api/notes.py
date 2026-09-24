from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.note import ClientNote

router = APIRouter(prefix="/notes", tags=["Notes & Reminders"])

@router.post("/", response_model=ClientNote)
def create_note(note: ClientNote, session: Session = Depends(get_session)):
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
