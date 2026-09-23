from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.models.herd import Herd

router = APIRouter(prefix="/herds", tags=["Herds"])

@router.post("/", response_model=Herd)
def create_herd(herd: Herd, session: Session = Depends(get_session)):
    session.add(herd)
    session.commit()
    session.refresh(herd)
    return herd

@router.get("/", response_model=List[Herd])
def read_herds(session: Session = Depends(get_session)):
    return session.exec(select(Herd)).all()

@router.get("/{herd_id}", response_model=Herd)
def read_herd(herd_id: int, session: Session = Depends(get_session)):
    herd = session.get(Herd, herd_id)
    if not herd:
        raise HTTPException(status_code=404, detail="Herd not found")
    return herd

@router.put("/{herd_id}", response_model=Herd)
def update_herd(herd_id: int, herd_data: Herd, session: Session = Depends(get_session)):
    db_herd = session.get(Herd, herd_id)
    if not db_herd:
        raise HTTPException(status_code=404, detail="Herd not found")

    # Exclude "id": unset on a normal edit payload, so applying it via setattr
    # would null out the primary key and break the update.
    for key, value in herd_data.dict(exclude={"id"}).items():
        setattr(db_herd, key, value)

    session.add(db_herd)
    session.commit()
    session.refresh(db_herd)
    return db_herd

@router.delete("/{herd_id}")
def delete_herd(herd_id: int, session: Session = Depends(get_session)):
    herd = session.get(Herd, herd_id)
    if not herd:
        raise HTTPException(status_code=404, detail="Herd not found")
    session.delete(herd)
    session.commit()
    return {"ok": True}
