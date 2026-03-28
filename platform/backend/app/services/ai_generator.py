import httpx
from typing import Optional
from app.config import settings


async def generate_experiment(
    recent_stats: dict,
    existing_slugs: list[str],
    model: str = "qwen2.5-coder:32b",
) -> Optional[str]:
    """
    Ask ollama to generate a new rowing experiment HTML using the SDK template.
    Returns raw HTML string or None on failure.
    """
    sdk_description = """
The Experiment SDK is a JavaScript library that bridges rowing machine data to your experiment.

Include this in your HTML:
<script src="/sdk/experiment-sdk.js"></script>

Then initialize:
const sdk = new ExperimentSDK({
  onStroke: (data) => {
    // data = { strokeNum, watts, spm, drag, elapsedS, sessionId }
    // Update your game/UI here
  },
  onInterval: (data, elapsedS) => {
    // Called every second with latest data
  },
  onSessionEnd: (summary) => {
    // summary = { totalStrokes, avgWatts, maxWatts, avgSpm, durationS }
    // Show end screen here
  }
});

// To control drag resistance:
sdk.setDrag(level); // 0-24

// To show LED color:
sdk.setLed(255, 100, 0); // RGB

// To mark the session complete:
sdk.markComplete();

Rules:
- Single HTML file, no external CDN dependencies
- Must call sdk.markComplete() when the experiment goal is achieved
- Must visually respond to onStroke events (make it interactive!)
- Include a manifest comment at the top: <!-- manifest: {"type":"game","difficulty":"medium","tags":["interval","power"]} -->
- Keep it fun, visual, and motivating
"""

    stats_str = "\n".join(f"  {k}: {v}" for k, v in recent_stats.items())
    existing_str = ", ".join(existing_slugs) if existing_slugs else "none"

    prompt = f"""You are an expert web developer creating rowing machine workout experiments.

Context about the user's recent workout data:
{stats_str}

Existing experiment slugs (do not duplicate): {existing_str}

{sdk_description}

Create a new, unique, fun rowing experiment as a single HTML file.
The experiment should be engaging, visually appealing, and use the SDK hooks above.
Think of creative ideas: space travel where watts = speed, fishing where strokes = casts,
rhythm games, beat-matching, virtual races, nature animations, etc.

Respond ONLY with the complete HTML code. No explanation, no markdown, just HTML starting with <!DOCTYPE html>.
"""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.8, "num_predict": 8192},
                },
            )
            response.raise_for_status()
            data = response.json()
            html = data.get("response", "").strip()

            # Basic validation: must look like HTML and contain SDK init
            if "<!DOCTYPE html>" not in html and "<html" not in html:
                return None
            if "ExperimentSDK" not in html:
                return None

            return html
    except Exception:
        return None
