# Photos on a client's page (app/models/client_photo.py): take or choose one on the phone or PC, add a caption, see them
# newest first, open one full size. Behind main.py's router-wide sign-in.
import base64
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlmodel import Session, select

from app.core import images
from app.core.db import get_session
from app.core.security import get_current_user
from app.models.client import Client
from app.models.client_photo import ClientPhoto
from app.models.user import User

router = APIRouter(prefix="/photos", tags=["Client photos"])

MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # a phone camera photo is a few MB
MAX_PER_CLIENT = 200
MAX_CAPTION = 200


@router.post("/client/{client_id}")
async def add_photo(client_id: int, file: UploadFile = File(...), caption: str = Form(""),
                    session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if session.get(Client, client_id) is None:
        raise HTTPException(status_code=404, detail="Client not found")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That photo is over 12 MB")
    if len(session.exec(select(ClientPhoto.id).where(ClientPhoto.client_id == client_id)).all()) >= MAX_PER_CLIENT:
        raise HTTPException(status_code=409, detail=f"A client can have at most {MAX_PER_CLIENT} photos")
    try:
        image, thumb = images.process_photo(data)
    except images.NotAnImage:
        raise HTTPException(status_code=422, detail="That isn't a picture the app can read (use a JPEG or PNG photo)")
    row = ClientPhoto(client_id=client_id, image=image, thumb=thumb, caption=" ".join((caption or "").split())[:MAX_CAPTION] or None,
                      by_user_id=user.id if user else None)
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"id": row.id, "caption": row.caption, "created_at": row.created_at}


@router.get("/client/{client_id}")
def list_photos(client_id: int, session: Session = Depends(get_session)):
    """Newest first, each with its thumbnail inline (small) - the full picture is fetched on its own."""
    names = {u.id: u.name for u in session.exec(select(User)).all()}
    rows = session.exec(select(ClientPhoto).where(ClientPhoto.client_id == client_id)
                        .order_by(ClientPhoto.created_at.desc(), ClientPhoto.id.desc())).all()
    return [{"id": r.id, "caption": r.caption, "created_at": r.created_at, "by": names.get(r.by_user_id),
             "thumb": "data:image/jpeg;base64," + base64.b64encode(r.thumb).decode("ascii")} for r in rows]


@router.get("/{photo_id}/image")
def photo_image(photo_id: int, session: Session = Depends(get_session)):
    row = session.get(ClientPhoto, photo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=row.image, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@router.delete("/{photo_id}")
def delete_photo(photo_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    """Whoever added a photo can remove it, and so can an admin."""
    row = session.get(ClientPhoto, photo_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    if not (user.is_admin or row.by_user_id == user.id):
        raise HTTPException(status_code=403, detail="Only the person who added a photo, or an admin, can remove it")
    session.delete(row)
    session.commit()
    return {"ok": True}
