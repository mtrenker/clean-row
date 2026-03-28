from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import GarminDaily
from app.api.schemas import GarminDailyIn

router = APIRouter(prefix="/garmin", tags=["garmin"])


@router.post("/daily", status_code=204)
async def upsert_garmin_daily(body: GarminDailyIn, db: AsyncSession = Depends(get_db)):
    """Upsert Garmin daily stats. Called by n8n workflow."""
    cal_date = date.fromisoformat(body.calendar_date)

    result = await db.execute(
        select(GarminDaily).where(GarminDaily.calendar_date == cal_date)
    )
    existing = result.scalar_one_or_none()

    if existing:
        for field, val in body.model_dump(exclude={"calendar_date"}, exclude_none=True).items():
            setattr(existing, field, val)
    else:
        db.add(GarminDaily(
            calendar_date=cal_date,
            sleep_score=body.sleep_score,
            body_battery_max=body.body_battery_max,
            body_battery_min=body.body_battery_min,
            resting_hr=body.resting_hr,
            hrv_status=body.hrv_status,
            hrv_weekly_avg=body.hrv_weekly_avg,
            stress_avg=body.stress_avg,
            raw=body.raw,
        ))

    await db.commit()


@router.get("/daily/latest")
async def get_latest_garmin(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GarminDaily).order_by(GarminDaily.calendar_date.desc()).limit(1)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="No Garmin data yet")
    return {
        "calendar_date": entry.calendar_date.isoformat(),
        "sleep_score": entry.sleep_score,
        "body_battery_max": entry.body_battery_max,
        "body_battery_min": entry.body_battery_min,
        "resting_hr": entry.resting_hr,
        "hrv_status": entry.hrv_status,
        "hrv_weekly_avg": entry.hrv_weekly_avg,
        "stress_avg": entry.stress_avg,
    }
