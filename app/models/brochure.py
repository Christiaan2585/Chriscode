from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class BrochureSend(SQLModel, table=True):
    """Who was sent which brochure (a PDF in the catalogue library, which lives in files, hence the plain id),
    and how - so the next send can show who already has it. Removed with the brochure and with the client."""
    id: Optional[int] = Field(default=None, primary_key=True)
    catalogue_id: str = Field(index=True)
    client_id: int = Field(foreign_key="client.id", index=True)
    via: str  # email | whatsapp
    at: datetime = Field(default_factory=datetime.utcnow)
