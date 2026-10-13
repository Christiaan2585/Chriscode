"""Email a document straight from the app, through the business's own mail server (Settings -> Email). TLS is
always on and the server's certificate is always checked. Everything that goes into a header is cleaned, and the
attachment must be a real PDF within the size limit."""
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

from fastapi import HTTPException
from sqlmodel import Session

from app.core import field_crypto
from app.models.mail import MailSettings

MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
TIMEOUT_SECONDS = 20
_ADDRESS = re.compile(r"[^@\s,;<>\"'()\[\]\\]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")


def valid_address(text: Optional[str]) -> bool:
    return bool(text) and len(text) <= 254 and _ADDRESS.fullmatch(text) is not None


def _one_line(text: str, limit: int) -> str:
    return " ".join((text or "").split())[:limit]


def _safe_filename(name: str) -> str:
    base = re.split(r"[\\/]", name or "")[-1]
    base = re.sub(r"[^\w .()-]", "_", base).strip(" .")[:100] or "document"
    return base if base.lower().endswith(".pdf") else base + ".pdf"


def _settings(session: Session) -> MailSettings:
    row = session.get(MailSettings, 1)
    if row is None or not row.host or not valid_address(row.from_address):
        raise HTTPException(status_code=409, detail="Email isn't set up yet - an admin can do that in Settings -> Email")
    return row


def is_configured(session: Session) -> bool:
    row = session.get(MailSettings, 1)
    return bool(row and row.host and valid_address(row.from_address))


def send_message(session: Session, to: str, subject: str, message: str, filename: Optional[str] = None,
                 pdf: Optional[bytes] = None) -> None:
    settings = _settings(session)
    if not valid_address(to):
        raise HTTPException(status_code=422, detail="That isn't a valid email address")
    msg = EmailMessage()
    msg["From"] = formataddr((_one_line(settings.from_name or "", 100), settings.from_address))
    msg["To"] = to
    msg["Subject"] = _one_line(subject, 200) or "Document"
    msg.set_content((message or "").strip() or "Please find the document attached.")
    if pdf is not None:
        if not pdf.startswith(b"%PDF"):
            raise HTTPException(status_code=422, detail="Only a PDF can be attached")
        if len(pdf) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="That file is too big to email")
        msg.add_attachment(pdf, maintype="application", subtype="pdf", filename=_safe_filename(filename or ""))
    try:
        password = field_crypto.decrypt(settings.password)
    except field_crypto.Unreadable:
        raise HTTPException(status_code=409, detail="The saved email password can't be read on this computer - enter it again in Settings -> Email")
    context = ssl.create_default_context()
    try:
        if settings.security == "ssl":
            server = smtplib.SMTP_SSL(settings.host, settings.port, timeout=TIMEOUT_SECONDS, context=context)
        else:
            server = smtplib.SMTP(settings.host, settings.port, timeout=TIMEOUT_SECONDS)
        with server:
            if settings.security != "ssl":
                server.starttls(context=context)
            if settings.username and password:
                server.login(settings.username, password)
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=502, detail="The mail server refused the user name or password")
    except smtplib.SMTPRecipientsRefused:
        raise HTTPException(status_code=502, detail="The mail server refused that email address")
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't send through the mail server ({type(exc).__name__}). Check the server, port and security in Settings -> Email")


def send_document(session: Session, to: str, subject: str, message: str, filename: str, pdf: bytes) -> None:
    send_message(session, to, subject, message, filename, pdf)
