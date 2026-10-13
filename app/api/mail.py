# Email from the app (app/core/mailer.py). Anyone signed in can send a document and ask whether sending is set up;
# only an admin sees or changes the mail-server settings.
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session

from app.core import field_crypto, mailer
from app.core.db import get_session
from app.core.security import require_admin
from app.core.uploads import read_capped
from app.models.mail import MailSettings

router = APIRouter(prefix="/mail", tags=["Email"])


class MailSettingsIn(BaseModel):
    host: str = Field(min_length=1, max_length=255, pattern=r"^[A-Za-z0-9.-]+$")
    port: int = Field(ge=1, le=65535)
    security: Literal["starttls", "ssl"] = "starttls"
    username: Optional[str] = Field(default=None, max_length=254)
    password: Optional[str] = Field(default=None, max_length=500)  # None = keep the saved one
    from_address: str = Field(max_length=254)
    from_name: Optional[str] = Field(default=None, max_length=100)

    @field_validator("from_address")
    @classmethod
    def valid_from(cls, value: str) -> str:
        if not mailer.valid_address(value):
            raise ValueError("That isn't a valid email address")
        return value


def _out(row: Optional[MailSettings]) -> dict:
    row = row or MailSettings()
    return {"host": row.host, "port": row.port, "security": row.security, "username": row.username,
            "from_address": row.from_address, "from_name": row.from_name, "has_password": bool(row.password)}


@router.get("/status")
def status(session: Session = Depends(get_session)):
    return {"configured": mailer.is_configured(session)}


@router.get("/settings", dependencies=[Depends(require_admin)])
def read_settings(session: Session = Depends(get_session)):
    return _out(session.get(MailSettings, 1))


@router.put("/settings", dependencies=[Depends(require_admin)])
def save_settings(body: MailSettingsIn, session: Session = Depends(get_session)):
    row = session.get(MailSettings, 1) or MailSettings(id=1)
    row.host, row.port, row.security = body.host, body.port, body.security
    row.username = (body.username or "").strip() or None
    row.from_address, row.from_name = body.from_address, (body.from_name or "").strip() or None
    if body.password:
        row.password = field_crypto.encrypt(body.password)
    session.add(row)
    session.commit()
    return _out(row)


class TestIn(BaseModel):
    to: str


@router.post("/test", dependencies=[Depends(require_admin)])
def send_test(body: TestIn, session: Session = Depends(get_session)):
    mailer.send_message(session, body.to, "Test from Sandveld Vee Dienste", "If you can read this, sending email from the app works.")
    return {"ok": True}


@router.post("/send")
async def send(to: str = Form(...), subject: str = Form(""), message: str = Form(""), file: UploadFile = File(...),
               session: Session = Depends(get_session)):
    if not mailer.is_configured(session):
        raise HTTPException(status_code=409, detail="Email isn't set up yet - an admin can do that in Settings -> Email")
    data = await read_capped(file, mailer.MAX_ATTACHMENT_BYTES)
    mailer.send_document(session, to.strip(), subject, message, file.filename or "document.pdf", data)
    return {"ok": True}
