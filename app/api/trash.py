# The recycle bin (app/core/trash.py). Admin only: the deletes it undoes are admin only too.
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core import trash
from app.core.db import get_session
from app.core.security import require_admin
from app.models.trash import TrashItem

router = APIRouter(prefix="/trash", tags=["Recycle bin"], dependencies=[Depends(require_admin)])


def _item_or_404(session: Session, item_id: int) -> TrashItem:
    item = session.get(TrashItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="That is no longer in the recycle bin")
    return item


@router.get("/")
def list_trash(session: Session = Depends(get_session)):
    trash.purge_old(session)  # a PC left on for weeks never restarts, so expiry is also checked here
    items = session.exec(select(TrashItem).order_by(TrashItem.deleted_at.desc(), TrashItem.id.desc())).all()
    return [{"id": i.id, "kind": i.kind, "label": i.label, "rows": i.row_count, "deleted_at": i.deleted_at,
             "days_left": max(0, trash.RETAIN_DAYS - (datetime.utcnow() - i.deleted_at).days)} for i in items]


@router.post("/{item_id}/restore")
def restore(item_id: int, session: Session = Depends(get_session)):
    trash.restore(session, _item_or_404(session, item_id))
    return {"ok": True}


@router.delete("/{item_id}")
def delete_forever(item_id: int, session: Session = Depends(get_session)):
    session.delete(_item_or_404(session, item_id))
    session.commit()
    return {"ok": True}
