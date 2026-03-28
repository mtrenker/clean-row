import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Session, Experiment, GarminDaily, SessionRecommendation
from app.api.schemas import ExperimentOut
from app.services.ai_generator import generate_experiment

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/generate-experiment", response_model=ExperimentOut, status_code=201)
async def trigger_generate_experiment(
    model: str = "qwen2.5-coder:32b",
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger AI experiment generation. Called by n8n on a schedule or manually.
    The generated experiment lands in 'pending' status for human review.
    """
    # Gather recent stats to inform the prompt
    sessions_result = await db.execute(
        select(Session).where(Session.ended_at.is_not(None)).order_by(Session.started_at.desc()).limit(10)
    )
    recent_sessions = sessions_result.scalars().all()

    avg_watts = 0.0
    avg_duration = 0
    total_sessions = len(recent_sessions)
    if recent_sessions:
        avg_watts = sum(s.avg_watts or 0 for s in recent_sessions) / total_sessions
        avg_duration = sum(s.duration_s or 0 for s in recent_sessions) // total_sessions

    garmin_result = await db.execute(
        select(GarminDaily).order_by(GarminDaily.calendar_date.desc()).limit(1)
    )
    garmin = garmin_result.scalar_one_or_none()

    recent_stats = {
        "total_completed_sessions": total_sessions,
        "avg_watts_last_10_sessions": round(avg_watts, 1),
        "avg_duration_seconds_last_10_sessions": avg_duration,
        "garmin_sleep_score": garmin.sleep_score if garmin else "unknown",
        "garmin_body_battery": garmin.body_battery_max if garmin else "unknown",
        "garmin_hrv_status": garmin.hrv_status if garmin else "unknown",
    }

    slugs_result = await db.execute(select(Experiment.slug))
    existing_slugs = [row[0] for row in slugs_result.all()]

    html = await generate_experiment(recent_stats, existing_slugs, model=model)
    if not html:
        raise HTTPException(status_code=502, detail="AI generation failed or produced invalid output")

    # Extract manifest from comment if present
    manifest = {}
    match = re.search(r'<!--\s*manifest:\s*(\{.*?\})\s*-->', html)
    if match:
        import json
        try:
            manifest = json.loads(match.group(1))
        except Exception:
            pass

    # Derive a slug from a title tag if present, else use timestamp
    title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
    raw_name = title_match.group(1) if title_match else f"AI Experiment {datetime.now().strftime('%m%d-%H%M')}"
    slug = re.sub(r'[^a-z0-9]+', '-', raw_name.lower()).strip('-')[:60]
    # Ensure uniqueness
    if slug in existing_slugs:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    exp = Experiment(
        slug=slug,
        name=raw_name,
        description=manifest.get("description"),
        type=manifest.get("type", "game"),
        html_content=html,
        manifest=manifest,
        status="pending",
        generated_by=f"ai:{model}",
    )
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


@router.post("/recommend-session", status_code=201)
async def generate_session_recommendation(
    model: str = "llama3.2:latest",
    db: AsyncSession = Depends(get_db),
):
    """
    Generate an upcoming session recommendation. Called by n8n daily.
    """
    import httpx
    from app.config import settings

    sessions_result = await db.execute(
        select(Session).where(Session.ended_at.is_not(None)).order_by(Session.started_at.desc()).limit(7)
    )
    recent = sessions_result.scalars().all()

    garmin_result = await db.execute(
        select(GarminDaily).order_by(GarminDaily.calendar_date.desc()).limit(1)
    )
    garmin = garmin_result.scalar_one_or_none()

    context = {
        "recent_sessions": [
            {
                "date": s.started_at.date().isoformat(),
                "duration_s": s.duration_s,
                "avg_watts": float(s.avg_watts or 0),
                "total_strokes": s.total_strokes,
                "completed": s.completed,
                "fun_rating": s.fun_rating,
            }
            for s in recent
        ],
        "garmin": {
            "date": garmin.calendar_date.isoformat() if garmin else None,
            "sleep_score": garmin.sleep_score if garmin else None,
            "body_battery_max": garmin.body_battery_max if garmin else None,
            "hrv_status": garmin.hrv_status if garmin else None,
            "resting_hr": garmin.resting_hr if garmin else None,
        } if garmin else None,
    }

    prompt = f"""You are a personal rowing coach assistant. Based on the following data, 
give a short, motivating recommendation for the next rowing session. 
Be specific about duration, target watts, and intensity. Keep it under 100 words.

Data:
{context}

Respond with a JSON object:
{{
  "recommendation": "...",
  "intensity": "recovery|moderate|hard",
  "target_duration_s": 900,
  "target_avg_watts": 150
}}
"""

    import json as json_mod

    rec_text = "Row at a comfortable pace today and enjoy the experience."
    intensity = "moderate"
    target_duration = 900
    target_watts = 150.0

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.5, "num_predict": 512}},
            )
            response.raise_for_status()
            raw = response.json().get("response", "")
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            if json_match:
                parsed = json_mod.loads(json_match.group())
                rec_text = parsed.get("recommendation", rec_text)
                intensity = parsed.get("intensity", intensity)
                target_duration = parsed.get("target_duration_s", target_duration)
                target_watts = parsed.get("target_avg_watts", target_watts)
    except Exception:
        pass  # Fall back to defaults

    rec = SessionRecommendation(
        generated_at=datetime.now(timezone.utc),
        recommendation=rec_text,
        intensity=intensity,
        target_duration_s=target_duration,
        target_avg_watts=target_watts,
        model_used=model,
        prompt_context=context,
    )
    db.add(rec)
    await db.commit()

    return {"recommendation": rec_text, "intensity": intensity,
            "target_duration_s": target_duration, "target_avg_watts": target_watts}
