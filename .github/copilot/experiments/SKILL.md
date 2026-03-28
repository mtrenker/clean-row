# Clean Row — Experiment Authoring Skill

Use this skill when creating a new rowing machine experiment for the Clean Row platform.

---

## What an experiment is

A single self-contained HTML file that turns live rowing data into an interactive experience. The rowing machine sends real-time `watts`, `spm` (strokes per minute), `strokeCount`, and `drag` at ~10 Hz. Your experiment listens to these via the SDK and does something compelling with them.

Experiments live in `platform/web/experiments/<slug>/index.html` and are served statically by nginx. They appear on the dashboard automatically once activated in the database.

---

## File anatomy

```html
<!-- manifest: {"type":"game","difficulty":"hard","tags":["rhythm","sound"]} -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Experiment</title>
  <style>/* everything inline — no external CDN */</style>
</head>
<body>
<script src="/shared/nav.js"></script>   <!-- ← always first, injects back button -->

<!-- your markup -->
<div id="hud">
  <span id="connection">⚪ Connecting...</span>
  <!-- other HUD elements -->
</div>

<script src="/sdk/experiment-sdk.js"></script>
<script>
  const sdk = new ExperimentSDK({
    onStroke:     (data, elapsedS) => { /* fired on every stroke */ },
    onInterval:   (data, elapsedS) => { /* fired every second */   },
    onSessionEnd: (summary)        => { /* show end screen */       },
  });
</script>
</body>
</html>
```

### Rules that are non-negotiable

| Rule | Reason |
|---|---|
| Manifest comment on line 1 | Dashboard reads it to display type/difficulty/tags |
| `<script src="/shared/nav.js"></script>` as first element in `<body>` | Injects back button into the element with `id="status-bar"` or `id="hud"` |
| `<script src="/sdk/experiment-sdk.js"></script>` before your script | Provides `ExperimentSDK` class |
| No external CDN dependencies | Tablet may have no internet; only local resources |
| Single HTML file | Deployed by copying the folder; no build step |
| Call `sdk.markComplete()` when the goal is achieved | Marks the session `completed=true` in the DB, which feeds the scoring model |
| Top-level HUD element must have `id="status-bar"` **or** `id="hud"` | nav.js injects the back button as first child of whichever one exists |
| Listen to `connectionStatus` and update the connection indicator | User needs to know if the machine is connected |

---

## SDK reference

### Data shape

```js
// onStroke data
{
  strokeNum: 42,      // total strokes since session start
  watts: 187,         // current power output
  spm: 24,            // strokes per minute
  drag: 16,           // drag factor (0-24, 16 ≈ medium resistance)
  elapsedS: 120,      // seconds elapsed
  sessionId: "uuid",
}

// onInterval data (same but without strokeNum — always latest reading)
{ watts, spm, drag, elapsedS, sessionId }

// onSessionEnd summary
{ total_strokes, avg_watts, avg_spm, duration_s, completed, sessionId }
```

### Machine control

```js
sdk.setDrag(level);         // 0–24  — sets magnetic resistance
sdk.setLed(r, g, b);        // RGB 0–255
sdk.setLedPreset(n);        // 0=off 1=blue 2=cyan 3=green 4=yellow 5=orange 6=red 7=purple
sdk.markComplete();          // ends session as completed, LED → green
sdk.quit();                  // ends session as incomplete
await sdk.submitRating(n);   // 1–5 fun rating after session ends
```

### Properties

```js
sdk.elapsedS   // seconds since first stroke
sdk.sessionId  // UUID of current session (null until first stroke)
```

### Dev simulator

When opened in a regular browser (no Android bridge), the SDK auto-starts a simulator that generates realistic rowing data so you can develop and test without the physical machine.

---

## Manifest fields

```json
{
  "type": "game | pacer | challenge | meditation | race | rhythm",
  "difficulty": "easy | medium | hard | brutal",
  "tags": ["power", "interval", "breathing", "rhythm", "story", "compete"],
  "metric_weights": {
    "watts": 0.5,
    "fun": 0.2,
    "completion": 0.3
  }
}
```

`metric_weights` is optional but influences how the backend's scoring model ranks the experiment. Weights must sum to 1.0. Available keys: `watts`, `fun`, `completion`, `duration`.

---

## Scoring model

The backend computes a `composite_score` (0–100) after every session ends, used to rank experiments on the dashboard. It weighs:

- **watts delta** (30%) — did the user push harder than their baseline?
- **completion** (30%) — did the experiment reach `sdk.markComplete()`?
- **duration delta** (20%) — did the user stay longer than their average?
- **fun rating** (20%) — 1–5 stars submitted after the session

Design accordingly: experiments that reward sustained effort, clear endpoints, and fun get ranked higher.

---

## Display context

- **Screen**: 1920×1080, landscape, fullscreen (no title bar, no nav bar)
- **Distance**: ~1.5m viewing distance from a rowing machine seat
- **Input**: rowing data only — no touch, no keyboard during workout. Physical buttons can be wired via `buttonPress` events
- **Font**: anything readable at distance; avoid tiny text
- **Dark themes**: the dashboard is dark; matching the aesthetic is nice but not required

```js
// Physical button events (short/long press on machine buttons)
window.addEventListener('buttonPress', (e) => {
  if (e.detail.type === 'longPress') sdk.quit();
});
```

---

## Registering a new experiment

After creating the file, add a row to the database to make it appear on the dashboard:

```sql
INSERT INTO experiments (id, slug, name, description, type, html_content, manifest, status, generated_by)
VALUES (
  gen_random_uuid(),
  'my-experiment',
  'My Experiment',
  'One sentence pitch.',
  'game',
  '',           -- html_content is only used by AI-generated experiments; leave empty for file-based ones
  '{"type":"game","difficulty":"medium","tags":["power"]}',
  'active',
  'human'
);
```

Or use the backend API:

```bash
curl -X POST http://localhost:3000/api/experiments \
  -H 'Content-Type: application/json' \
  -d '{"slug":"my-experiment","name":"My Experiment","description":"...","type":"game","manifest":{"type":"game","difficulty":"medium","tags":["power"]}}'
```

---

## Creative direction

### What already exists — do not duplicate the mechanic

| Slug | Core mechanic |
|---|---|
| `target-watts` | Hit and hold watt targets in a vertical power bar; 8 progressive intervals |
| `breathing-pacer` | Ocean scene; breathing orb expands/contracts; pace-guided meditation |

### What to avoid

- Another vertical bar or gauge as the primary feedback element
- Another ocean/water theme
- Another interval timer with rest periods (unless radically different)
- Anything that doesn't visually respond to strokes — the display should feel alive

### What is encouraged

- **Narrative / story-driven**: each stroke advances a story, moves a character, or changes the world state
- **Sound design** (Web Audio API): synthesise beats, ambient sound, or music that reacts to watt output
- **Competitive / social**: ghost race against personal best from the DB, or a fictional opponent with a watt profile
- **Physiological**: heart-rate zone trainer (estimated from watts/spm), lactate threshold intervals
- **Abstract / generative art**: strokes drive particle systems, fractal growth, or procedural landscapes
- **Adult/mature themes**: dark psychological challenges, explicit competition, brutal honesty about performance — no restrictions beyond basic good taste
- **Punishment mechanics**: drag resistance controlled by the SDK can be raised when the user underperforms and lowered as reward
- **Dual modes**: easy introduction phase that shifts into brutal hard mode after a threshold
- **Humour**: absurd premises, self-deprecating commentary, surprise elements

### Naming

Names should be evocative and short (2–3 words). Avoid generic names like "Interval Trainer" or "Power Game". Examples of good names: *Void Runner*, *Pressure Drop*, *Dead Calm*, *Red Shift*, *The Climb*.

---

## Example skeleton (minimal)

```html
<!-- manifest: {"type":"challenge","difficulty":"hard","tags":["power","story"]} -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Void Runner</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; color: #fff; height: 100vh; overflow: hidden; font-family: monospace; }
  #hud {
    position: fixed; top: 0; left: 0; right: 0;
    display: flex; justify-content: space-between;
    padding: 14px 20px; background: rgba(0,0,0,0.6); font-size: 0.85em;
  }
  /* ... */
</style>
</head>
<body>
<script src="/shared/nav.js"></script>

<div id="hud">
  <span id="connection">⚪ Connecting...</span>
  <span id="elapsed">0:00</span>
  <span id="watts-display">0W</span>
</div>

<!-- main canvas / DOM elements -->

<script src="/sdk/experiment-sdk.js"></script>
<script>
  const sdk = new ExperimentSDK({
    onStroke: ({ watts, spm, strokeNum, elapsedS }) => {
      // update visuals
    },
    onInterval: ({ watts }, elapsedS) => {
      document.getElementById('elapsed').textContent = fmt(elapsedS);
      document.getElementById('watts-display').textContent = `${watts}W`;
    },
    onSessionEnd: (summary) => {
      // show end screen, call sdk.submitRating() after user rates
    },
  });

  window.addEventListener('connectionStatus', (e) => {
    document.getElementById('connection').textContent =
      e.detail.connected ? '🟢 Connected' : '🔴 Disconnected';
  });

  function fmt(s) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
</script>
</body>
</html>
```
