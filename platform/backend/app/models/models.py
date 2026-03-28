import uuid
from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    String, Text, Integer, SmallInteger, Numeric, Boolean,
    DateTime, Date, BigInteger, ForeignKey, JSON
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB

from app.db.session import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String, default="game")
    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    manifest: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String, default="pending")
    generated_by: Mapped[Optional[str]] = mapped_column(String)
    composite_score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    play_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="experiment")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_s: Mapped[Optional[int]] = mapped_column(Integer)
    total_strokes: Mapped[Optional[int]] = mapped_column(Integer)
    avg_watts: Mapped[Optional[float]] = mapped_column(Numeric(6, 1))
    max_watts: Mapped[Optional[float]] = mapped_column(Numeric(6, 1))
    avg_spm: Mapped[Optional[float]] = mapped_column(Numeric(5, 1))
    avg_drag: Mapped[Optional[float]] = mapped_column(Numeric(5, 1))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    fun_rating: Mapped[Optional[int]] = mapped_column(SmallInteger)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    raw_summary: Mapped[Optional[dict]] = mapped_column(JSONB)

    experiment: Mapped[Optional["Experiment"]] = relationship("Experiment", back_populates="sessions")
    strokes: Mapped[list["SessionStroke"]] = relationship("SessionStroke", back_populates="session", cascade="all, delete-orphan")


class SessionStroke(Base):
    __tablename__ = "session_strokes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    stroke_num: Mapped[int] = mapped_column(Integer, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    watts: Mapped[Optional[float]] = mapped_column(Numeric(6, 1))
    spm: Mapped[Optional[float]] = mapped_column(Numeric(5, 1))
    drag: Mapped[Optional[float]] = mapped_column(Numeric(5, 1))

    session: Mapped["Session"] = relationship("Session", back_populates="strokes")


class GarminDaily(Base):
    __tablename__ = "garmin_daily"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    calendar_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    sleep_score: Mapped[Optional[int]] = mapped_column(SmallInteger)
    body_battery_max: Mapped[Optional[int]] = mapped_column(SmallInteger)
    body_battery_min: Mapped[Optional[int]] = mapped_column(SmallInteger)
    resting_hr: Mapped[Optional[int]] = mapped_column(SmallInteger)
    hrv_status: Mapped[Optional[str]] = mapped_column(String)
    hrv_weekly_avg: Mapped[Optional[float]] = mapped_column(Numeric(5, 1))
    stress_avg: Mapped[Optional[int]] = mapped_column(SmallInteger)
    raw: Mapped[Optional[dict]] = mapped_column(JSONB)


class SessionRecommendation(Base):
    __tablename__ = "session_recommendations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    target_date: Mapped[date] = mapped_column(Date)
    experiment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="SET NULL"), nullable=True
    )
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    intensity: Mapped[Optional[str]] = mapped_column(String)
    target_duration_s: Mapped[Optional[int]] = mapped_column(Integer)
    target_avg_watts: Mapped[Optional[float]] = mapped_column(Numeric(6, 1))
    model_used: Mapped[Optional[str]] = mapped_column(String)
    prompt_context: Mapped[Optional[dict]] = mapped_column(JSONB)
