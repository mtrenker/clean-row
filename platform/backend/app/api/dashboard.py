from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Experiment, Session, SessionRecommendation, SessionStroke
from app.api.schemas import DashboardOut, ExperimentOut, SessionOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    # Active experiments ranked by composite score
    active_result = await db.execute(
        select(Experiment)
        .where(Experiment.status == "active")
        .order_by(Experiment.composite_score.desc().nulls_last(), Experiment.created_at.desc())
        .limit(20)
    )
    active_experiments = active_result.scalars().all()

    # Pending experiments (for review)
    pending_result = await db.execute(
        select(Experiment)
        .where(Experiment.status == "pending")
        .order_by(Experiment.created_at.desc())
        .limit(10)
    )
    pending_experiments = pending_result.scalars().all()

    # Recent sessions
    sessions_result = await db.execute(
        select(Session).order_by(Session.started_at.desc()).limit(10)
    )
    recent_sessions = sessions_result.scalars().all()

    # Latest recommendation
    rec_result = await db.execute(
        select(SessionRecommendation)
        .order_by(SessionRecommendation.generated_at.desc())
        .limit(1)
    )
    rec = rec_result.scalar_one_or_none()
    next_recommendation = rec.recommendation if rec else None

    # Totals
    total_sessions_result = await db.execute(select(func.count()).select_from(Session))
    total_sessions = total_sessions_result.scalar() or 0

    total_strokes_result = await db.execute(select(func.count()).select_from(SessionStroke))
    total_strokes = int(total_strokes_result.scalar() or 0)

    return DashboardOut(
        active_experiments=[ExperimentOut.model_validate(e) for e in active_experiments],
        pending_experiments=[ExperimentOut.model_validate(e) for e in pending_experiments],
        recent_sessions=[SessionOut.model_validate(s) for s in recent_sessions],
        next_session_recommendation=next_recommendation,
        total_sessions=total_sessions,
        total_strokes=total_strokes,
    )
