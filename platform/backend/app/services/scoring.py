import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Session, Experiment


# Composite score weights — tune these over time
WEIGHTS = {
    "watts_delta": 0.30,
    "completion": 0.30,
    "duration_delta": 0.20,
    "fun_rating": 0.20,
}

# Baseline assumptions when no history exists yet
BASELINE_WATTS = 100.0
BASELINE_DURATION_S = 600


async def recalculate_experiment_score(experiment_id: uuid.UUID, db: AsyncSession) -> None:
    """
    Recalculate the composite score for an experiment based on all its completed sessions.
    Called after every session ends.
    """
    result = await db.execute(
        select(Session).where(
            Session.experiment_id == experiment_id,
            Session.ended_at.is_not(None),
        ).order_by(Session.started_at.asc())
    )
    sessions = result.scalars().all()

    if not sessions:
        return

    # Compute per-session subscores then average
    subscores = []
    for i, s in enumerate(sessions):
        # Watts delta: compare to mean of previous sessions or baseline
        if i == 0:
            ref_watts = BASELINE_WATTS
        else:
            prev = sessions[:i]
            ref_watts = sum(float(p.avg_watts or 0) for p in prev) / len(prev)

        watts = float(s.avg_watts or 0)
        watts_delta_score = min(1.0, max(0.0, (watts - ref_watts + 50) / 100))

        # Completion score
        completion_score = 1.0 if s.completed else 0.0

        # Duration delta: compare to baseline
        if i == 0:
            ref_duration = BASELINE_DURATION_S
        else:
            prev = sessions[:i]
            ref_duration = sum(float(p.duration_s or 0) for p in prev) / len(prev)
        duration = float(s.duration_s or 0)
        duration_delta_score = min(1.0, max(0.0, (duration - ref_duration + 300) / 600))

        # Fun rating (1-5 → 0-1)
        fun_score = ((s.fun_rating or 3) - 1) / 4.0

        composite = (
            WEIGHTS["watts_delta"] * watts_delta_score
            + WEIGHTS["completion"] * completion_score
            + WEIGHTS["duration_delta"] * duration_delta_score
            + WEIGHTS["fun_rating"] * fun_score
        )
        subscores.append(composite)

    avg_score = sum(subscores) / len(subscores)

    exp_result = await db.execute(select(Experiment).where(Experiment.id == experiment_id))
    exp = exp_result.scalar_one_or_none()
    if exp:
        exp.composite_score = round(avg_score * 100, 2)
        await db.commit()
