from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.models.weight import WeightLog

router = APIRouter(prefix="/weights", tags=["Weight Tracking"])

@router.post("/", response_model=WeightLog)
def add_weight(log: WeightLog, session: Session = Depends(get_session)):
    session.add(log)
    session.commit()
    session.refresh(log)
    return log

@router.get("/animal/{animal_id}", response_model=List[WeightLog])
def read_weights_by_animal(animal_id: int, session: Session = Depends(get_session)):
    statement = select(WeightLog).where(WeightLog.animal_id == animal_id).order_by(WeightLog.date)
    return session.exec(statement).all()

@router.delete("/{weight_id}")
def delete_weight(weight_id: int, session: Session = Depends(get_session)):
    log = session.get(WeightLog, weight_id)
    if not log:
        raise HTTPException(status_code=404, detail="Weight entry not found")
    session.delete(log)
    session.commit()
    return {"ok": True}
