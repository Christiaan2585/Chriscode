from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class ClientPhoto(SQLModel, table=True):
    """A photo on a client's page: a modest JPEG plus a small thumbnail (app/core/images.process_photo - camera and GPS
    data are dropped). Stored in the database, so it is in every backup. Never listed in the Excel export."""
    id: Optional[int] = Field(default=None, primary_key=True)
    client_id: int = Field(foreign_key="client.id", index=True)
    image: bytes
    thumb: bytes
    caption: Optional[str] = None
    by_user_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
