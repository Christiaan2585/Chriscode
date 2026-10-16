# Sent history (app/models/sends.py): the preview's WhatsApp / Email / Send-from-app buttons record each send here,
# and the lists ask for the latest one per document.
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, delete, select

from app.core.db import get_session
from app.core.security import get_current_user
from app.models.sends import DocumentSend
from app.models.user import User

router = APIRouter(prefix="/sends", tags=["Sent history"])

Kind = Literal["quote", "invoice", "statement", "reminder", "program", "program-costs", "treatments", "order-form"]


class SendIn(BaseModel):
    kind: Kind
    via: Literal["whatsapp", "email", "app-email"]
    doc_id: Optional[int] = None
    client_id: Optional[int] = None
    to: Optional[str] = Field(default=None, max_length=254)

    @field_validator("to")
    @classmethod
    def one_line(cls, value):
        value = " ".join((value or "").split())  # no line breaks or control characters
        return value or None


@router.post("/")
def record_send(body: SendIn, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    row = DocumentSend(kind=body.kind, via=body.via, doc_id=body.doc_id, client_id=body.client_id,
                       to_address=body.to, by_user_id=user.id)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.get("/latest")
def latest_sends(kind: Kind, session: Session = Depends(get_session)):
    """{document id: the newest send of that kind} - what the lists show beside each document."""
    names = {u.id: u.name for u in session.exec(select(User)).all()}
    out: dict = {}
    rows = session.exec(select(DocumentSend).where(DocumentSend.kind == kind, DocumentSend.doc_id != None)  # noqa: E711
                        .order_by(DocumentSend.at, DocumentSend.id)).all()
    for row in rows:  # oldest first, so the newest overwrites
        out[str(row.doc_id)] = {"via": row.via, "at": row.at.isoformat(), "to": row.to_address, "by": names.get(row.by_user_id)}
    return out


def forget(session: Session, kind: str, doc_id: int) -> None:
    """A deleted document's history goes with it (a reused number must not inherit "sent")."""
    session.exec(delete(DocumentSend).where(DocumentSend.kind == kind, DocumentSend.doc_id == doc_id))
