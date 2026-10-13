from typing import Optional

from sqlmodel import Field, SQLModel


class MailSettings(SQLModel, table=True):
    """The one row (id 1): the business's own mail server, used to email documents from the app (app/core/mailer.py).
    The password is stored encrypted (app/core/field_crypto.py) and is never sent back to the screen."""
    id: Optional[int] = Field(default=1, primary_key=True)
    host: str = ""
    port: int = 587
    security: str = "starttls"  # starttls (port 587) or ssl (port 465)
    username: Optional[str] = None
    password: Optional[str] = None  # enc1:...
    from_address: str = ""
    from_name: Optional[str] = None
