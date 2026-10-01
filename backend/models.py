from typing import List, Optional
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.db import Base

class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    room_label: Mapped[str] = mapped_column(String(50), nullable=False)
    room_node: Mapped[str] = mapped_column(String(50), nullable=False)
    floor: Mapped[int] = mapped_column(Integer, default=1)

    schedules: Mapped[List["Schedule"]] = relationship("Schedule", back_populates="doctor", cascade="all, delete-orphan")
    overrides: Mapped[List["Override"]] = relationship("Override", back_populates="doctor", cascade="all, delete-orphan")
    visits: Mapped[List["Visit"]] = relationship("Visit", back_populates="assigned_doctor")

class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), nullable=False)
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Mon, 6=Sun
    start_time: Mapped[str] = mapped_column(String(10), default="09:00")
    end_time: Mapped[str] = mapped_column(String(10), default="17:00")

    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="schedules")

class Override(Base):
    __tablename__ = "overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    status: Mapped[str] = mapped_column(String(20), default="in")  # in, out, leave, delayed
    room_node: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(String(30), default=lambda: datetime.utcnow().isoformat())

    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="overrides")

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)  # APT-1001
    patient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"), nullable=False)
    scheduled_time: Mapped[str] = mapped_column(String(30), nullable=False)

    doctor: Mapped["Doctor"] = relationship("Doctor")

class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    visit_code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # V-1001
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    patient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    visit_type: Mapped[str] = mapped_column(String(30), nullable=False)  # appointment, walkin, directions, emergency
    appointment_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    current_location_node: Mapped[str] = mapped_column(String(50), default="entrance")
    assigned_doctor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("doctors.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, closed
    created_at: Mapped[str] = mapped_column(String(30), default=lambda: datetime.utcnow().isoformat())
    closed_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    feedback_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feedback_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    assigned_doctor: Mapped[Optional["Doctor"]] = relationship("Doctor", back_populates="visits")
    tasks: Mapped[List["VisitTask"]] = relationship("VisitTask", back_populates="visit", cascade="all, delete-orphan", order_by="VisitTask.seq")

class VisitTask(Base):
    __tablename__ = "visit_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # registration, consultation, diagnostics, pharmacy, billing, discharge
    target_node: Mapped[str] = mapped_column(String(50), nullable=False)
    doctor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("doctors.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="waiting")  # waiting, called, done, skipped
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    called_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    completed_at: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), default=lambda: datetime.utcnow().isoformat())

    visit: Mapped["Visit"] = relationship("Visit", back_populates="tasks")
    doctor: Mapped[Optional["Doctor"]] = relationship("Doctor")
