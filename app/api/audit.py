"""Reading the activity log (admins only). Writing is done by app/core/audit.py."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, func, or_, select

from app.core.db import get_session
from app.core.security import require_admin
from app.models.audit import AuditEntry
from app.models.user import User

router = APIRouter(prefix="/audit", tags=["Activity log"])


@router.get("")
def read_audit(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), q: Optional[str] = None,
               user_id: Optional[int] = None, _: User = Depends(require_admin), session: Session = Depends(get_session)):
    """Newest first. `q` matches the action, who, and what it was about; `user_id` narrows to one person."""
    query = select(AuditEntry)
    if user_id is not None:
        query = query.where(AuditEntry.user_id == user_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(AuditEntry.action.ilike(like), AuditEntry.user_name.ilike(like),
                                AuditEntry.entity.ilike(like), AuditEntry.summary.ilike(like)))
    total = session.exec(select(func.count()).select_from(query.subquery())).one()
    rows = session.exec(query.order_by(AuditEntry.at.desc(), AuditEntry.id.desc()).offset(offset).limit(limit)).all()
    return {"total": total, "items": [r.model_dump() for r in rows]}
