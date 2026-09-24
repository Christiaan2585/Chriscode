from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.core.dates import coerce_datetime
from app.models.medical import MedicalRecord

router = APIRouter(prefix="/medical", tags=["Medical Records"])

@router.post("/", response_model=MedicalRecord)
def create_record(record: MedicalRecord, session: Session = Depends(get_session)):
    record.date = coerce_datetime(record.date)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record

@router.get("/animal/{animal_id}", response_model=List[MedicalRecord])
def read_records_by_animal(animal_id: int, session: Session = Depends(get_session)):
    statement = select(MedicalRecord).where(MedicalRecord.animal_id == animal_id)
    records = session.exec(statement).all()
    return records

@router.get("/{record_id}", response_model=MedicalRecord)
def read_record(record_id: int, session: Session = Depends(get_session)):
    record = session.get(MedicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")
    return record

@router.delete("/{record_id}")
def delete_record(record_id: int, session: Session = Depends(get_session)):
    record = session.get(MedicalRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")
    session.delete(record)
    session.commit()
    return {"ok": True}
