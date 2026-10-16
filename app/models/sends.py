from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class DocumentSend(SQLModel, table=True):
    """One line each time a document went to a client: which kind, which one, how, to what address, who, when.
    Kept for the lists ("Sent by email, 16 Oct") - never the document itself. Removed with the document (api/sends.forget)
    and with the client."""
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = Field(index=True)  # quote | invoice | statement | reminder | program | program-costs | treatments | order-form
    doc_id: Optional[int] = Field(default=None, index=True)  # the quote/invoice/program id (none for a statement or message)
    client_id: Optional[int] = Field(default=None, index=True)
    via: str  # whatsapp | email | app-email
    to_address: Optional[str] = None
    by_user_id: Optional[int] = None
    at: datetime = Field(default_factory=datetime.utcnow)
