from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
from app.core.db import get_session
from app.models.appointment import Appointment

router = APIRouter(prefix="/appointments", tags=["Appointments"])

@router.post("/", response_model=Appointment)
def create_appointment(appointment: Appointment, session: Session = Depends(get_session)):
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    return appointment

@router.get("/", response_model=List[Appointment])
def read_appointments(session: Session = Depends(get_session)):
    return session.exec(select(Appointment)).all()

@router.get("/client/{client_id}", response_model=List[Appointment])
def read_appointments_by_client(client_id: int, session: Session = Depends(get_session)):
    statement = select(Appointment).where(Appointment.client_id == client_id)
    return session.exec(statement).all()

@router.get("/{app_id}", response_model=Appointment)
def read_appointment(app_id: int, session: Session = Depends(get_session)):
    appointment = session.get(Appointment, app_id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment

@router.put("/{app_id}", response_model=Appointment)
def update_appointment(app_id: int, appointment_data: Appointment, session: Session = Depends(get_session)):
    db_app = session.get(Appointment, app_id)
    if not db_app:
        raise HTTPException(status_code=404, detail="Appointment not found")

    # Exclude "id" and "created_at": id is unset on a normal edit payload (it
    # would otherwise null the primary key), and created_at should stay as
    # the appointment's original creation time, not reset on every edit.
    for key, value in appointment_data.dict(exclude={"id", "created_at"}).items():
        setattr(db_app, key, value)

    session.add(db_app)
    session.commit()
    session.refresh(db_app)
    return db_app

@router.delete("/{app_id}")
def delete_appointment(app_id: int, session: Session = Depends(get_session)):
    appointment = session.get(Appointment, app_id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    session.delete(appointment)
    session.commit()
    return {"ok": True}
