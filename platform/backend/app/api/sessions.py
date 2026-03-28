import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Session, SessionStroke, Experiment
from app.api.schemas import SessionStart, SessionStrokeBatch, SessionEnd, SessionOut
from app.services.scoring import recalculate_experiment_score

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut, status_code=201)
async def start_session(body: SessionStart, db: AsyncSession = Depends(get_db)):
    """Create a new session when the user launches an experiment."""
    session = Session(
        experiment_id=body.experiment_id,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)

    if body.experiment_id:
        result = await db.execute(
            select(Experiment).where(Experiment.id == body.experiment_id)
        )
        exp = result.scalar_one_or_none()
        if exp:
            exp.play_count += 1

    await db.commit()
    await db.refresh(session)
    return session


@router.post("/{session_id}/strokes", status_code=204)
async def add_strokes(
    session_id: uuid.UUID,
    body: SessionStrokeBatch,
    db: AsyncSession = Depends(get_db),
):
    """Batch ingest per-stroke data at approximately 5-second intervals."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    strokes = [
        SessionStroke(
            session_id=session_id,
            stroke_num=s.stroke_num,
            watts=s.watts,
            spm=s.spm,
            drag=s.drag,
        )
        for s in body.strokes
    ]
    db.add_all(strokes)
    await db.commit()


@router.post("/{session_id}/end", response_model=SessionOut)
async def end_session(
    session_id: uuid.UUID,
    body: SessionEnd,
    db: AsyncSession = Depends(get_db),
):
    """Finalize a session with aggregate stats and optional fun rating."""
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Idempotent: only update stats if not already ended (sendBeacon may arrive after quit())
    if session.ended_at is None:
        now = datetime.now(timezone.utc)
        session.ended_at = now
        session.duration_s = int((now - session.started_at).total_seconds())

    for field, val in body.model_dump(exclude_none=True).items():
        setattr(session, field, val)

    # Compute aggregate stats from stored strokes (authoritative, overrides client values)
    stats_result = await db.execute(
        select(
            func.count(SessionStroke.id).label("total_strokes"),
            func.avg(SessionStroke.watts).label("avg_watts"),
            func.max(SessionStroke.watts).label("max_watts"),
            func.avg(SessionStroke.spm).label("avg_spm"),
        ).where(SessionStroke.session_id == session_id)
    )
    stats = stats_result.one()
    if stats.total_strokes:
        session.total_strokes = stats.total_strokes
        session.avg_watts = round(stats.avg_watts, 1) if stats.avg_watts else None
        session.max_watts = stats.max_watts
        session.avg_spm = round(stats.avg_spm, 1) if stats.avg_spm else None

    await db.commit()

    # Recalculate experiment composite score if this session has one
    if session.experiment_id:
        await recalculate_experiment_score(session.experiment_id, db)

    await db.refresh(session)
    return session


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("", response_model=list[SessionOut])
async def list_sessions(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Session).order_by(Session.started_at.desc()).limit(limit)
    )
    return result.scalars().all()
