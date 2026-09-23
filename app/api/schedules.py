from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from datetime import datetime, timedelta
from app.core.db import get_session
from app.models.schedule import HealthSchedule

router = APIRouter(prefix="/schedules", tags=["Health Schedules"])

@router.post("/", response_model=HealthSchedule)
def create_schedule(schedule: HealthSchedule, session: Session = Depends(get_session)):
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    return schedule

@router.get("/overdue", response_model=List[HealthSchedule])
def get_overdue_treatments(session: Session = Depends(get_session)):
    all_schedules = session.exec(select(HealthSchedule)).all()
    overdue = []
    now = datetime.utcnow()

    for s in all_schedules:
        next_due = s.last_date + timedelta(days=s.frequency_days)
        if now > next_due:
            overdue.append(s)

    return overdue

@router.get("/animal/{animal_id}", response_model=List[HealthSchedule])
def read_schedules_by_animal(animal_id: int, session: Session = Depends(get_session)):
    statement = select(HealthSchedule).where(HealthSchedule.animal_id == animal_id)
    return session.exec(statement).all()

@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: int, session: Session = Depends(get_session)):
    schedule = session.get(HealthSchedule, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    session.delete(schedule)
    session.commit()
    return {"ok": True}
