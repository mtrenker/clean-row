import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Experiment, Session, SessionStroke
from app.api.schemas import (
    ExperimentCreate, ExperimentUpdate, ExperimentOut, ExperimentDetail
)
from app.services.scoring import recalculate_experiment_score

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("", response_model=list[ExperimentOut])
async def list_experiments(
    status: str = "active",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Experiment)
        .where(Experiment.status == status)
        .order_by(Experiment.composite_score.desc().nulls_last(), Experiment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{slug_or_id}", response_model=ExperimentDetail)
async def get_experiment(slug_or_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch experiment by slug or UUID."""
    import uuid as _uuid
    try:
        uid = _uuid.UUID(slug_or_id)
        result = await db.execute(select(Experiment).where(Experiment.id == uid))
    except ValueError:
        result = await db.execute(select(Experiment).where(Experiment.slug == slug_or_id))
    exp = result.scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return exp


@router.post("", response_model=ExperimentDetail, status_code=201)
async def create_experiment(body: ExperimentCreate, db: AsyncSession = Depends(get_db)):
    exp = Experiment(**body.model_dump())
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


@router.patch("/{experiment_id}", response_model=ExperimentOut)
async def update_experiment(
    experiment_id: uuid.UUID,
    body: ExperimentUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Experiment).where(Experiment.id == experiment_id))
    exp = result.scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    for field, val in body.model_dump(exclude_none=True).items():
        setattr(exp, field, val)
    exp.updated_at = datetime.utcnow()

    # When activating a pending experiment, increment is fine; score may still be null
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/{experiment_id}/activate", response_model=ExperimentOut)
async def activate_experiment(experiment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Experiment).where(Experiment.id == experiment_id))
    exp = result.scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    exp.status = "active"
    exp.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/{experiment_id}/archive", response_model=ExperimentOut)
async def archive_experiment(experiment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Experiment).where(Experiment.id == experiment_id))
    exp = result.scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    exp.status = "archived"
    exp.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(exp)
    return exp
