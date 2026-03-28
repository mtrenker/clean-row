import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Experiments ─────────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    type: str = "game"
    html_content: str
    manifest: dict = Field(default_factory=dict)
    generated_by: str = "human"


class ExperimentUpdate(BaseModel):
    status: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    html_content: Optional[str] = None
    manifest: Optional[dict] = None


class ExperimentOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str]
    type: str
    status: str
    generated_by: Optional[str]
    composite_score: Optional[float]
    play_count: int
    created_at: datetime
    manifest: dict

    class Config:
        from_attributes = True


class ExperimentDetail(ExperimentOut):
    html_content: str


# ── Sessions ─────────────────────────────────────────────────────────────────

class StrokeIn(BaseModel):
    stroke_num: int
    watts: Optional[float] = None
    spm: Optional[float] = None
    drag: Optional[float] = None


class SessionStart(BaseModel):
    experiment_id: Optional[uuid.UUID] = None


class SessionStrokeBatch(BaseModel):
    strokes: list[StrokeIn]


class SessionEnd(BaseModel):
    total_strokes: Optional[int] = None
    avg_watts: Optional[float] = None
    max_watts: Optional[float] = None
    avg_spm: Optional[float] = None
    avg_drag: Optional[float] = None
    completed: bool = False
    fun_rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None
    raw_summary: Optional[dict] = None


class SessionOut(BaseModel):
    id: uuid.UUID
    experiment_id: Optional[uuid.UUID]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_s: Optional[int]
    total_strokes: Optional[int]
    avg_watts: Optional[float]
    max_watts: Optional[float]
    avg_spm: Optional[float]
    completed: bool
    fun_rating: Optional[int]

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardOut(BaseModel):
    active_experiments: list[ExperimentOut]
    pending_experiments: list[ExperimentOut]
    recent_sessions: list[SessionOut]
    next_session_recommendation: Optional[str]
    total_sessions: int
    total_strokes: int


# ── Garmin ────────────────────────────────────────────────────────────────────

class GarminDailyIn(BaseModel):
    calendar_date: str       # ISO date string
    sleep_score: Optional[int] = None
    body_battery_max: Optional[int] = None
    body_battery_min: Optional[int] = None
    resting_hr: Optional[int] = None
    hrv_status: Optional[str] = None
    hrv_weekly_avg: Optional[float] = None
    stress_avg: Optional[int] = None
    raw: Optional[dict] = None
