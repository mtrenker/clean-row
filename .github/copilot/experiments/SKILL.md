# Clean Row — Experiment Authoring Skill

Use this skill when creating a new rowing machine experiment for the Clean Row platform.

---

## What an experiment is

A React component that turns live rowing data into an interactive experience. The rowing machine sends real-time `watts`, `spm` (strokes per minute), `strokeCount`, and `drag` at ~10 Hz via browser CustomEvents. Your experiment listens to these via the platform's hooks and renders something compelling.

Experiments live in `platform/client/src/experiments/<slug>/index.jsx` and are registered in `ExperimentPage.jsx`. They appear on the dashboard automatically once activated in the database. The platform is built with Vite + React 18. Output is served statically by nginx from `platform/web/`.

---

## Project structure

```
platform/client/src/
  experiments/<slug>/
    index.jsx              ← your experiment component (required)
    <Slug>.module.css      ← scoped styles
  pixi/
    index.js               ← barrel: { PixiStage, usePixi, usePixiTicker, usePixiApp }
    PixiStage.jsx          ← full-screen Pixi canvas + PixiContext provider
    usePixiApp.js          ← initialises Application, attaches canvas
    usePixiTicker.js       ← per-frame game loop hook
    PixiContext.js         ← app context + usePixi()
  hooks/
    useRowingData.js       ← onStroke / onInterval callbacks
    useRowingConnection.js ← { connected, message }
    useSession.js          ← session lifecycle (handled by ExperimentLayout)
    useDevSimulator.js     ← auto-fires fake data in browser (handled by ExperimentLayout)
  components/
    ExperimentLayout.jsx   ← shell: StatusBar + RatingOverlay + session mgmt
    StatusBar.jsx
    RatingOverlay.jsx
  pages/
    ExperimentPage.jsx     ← lazy-loads experiment by slug
    Dashboard.jsx
  context/
    RowingContext.jsx       ← { connected, sessionId, elapsedS, ended, markComplete, ... }
```

---

## Experiment component contract

Your experiment component receives **nothing via props**. All context comes from hooks:

```jsx
import { useRowing } from '../../context/RowingContext.jsx';
import { useRowingData } from '../../hooks/useRowingData.js';

export default function MyExperiment() {
  const { markComplete, elapsedS, ended } = useRowing();

  useRowingData({
    onStroke: ({ watts, spm, strokeCount, drag }) => { /* update game */ },
    onInterval: ({ watts, spm, drag })             => { /* 1s tick    */ },
  });

  // ... render
}
```

`ExperimentLayout` (wrapping every experiment automatically via `ExperimentPage`) handles:
- Starting the dev simulator in browser environments
- Session creation on first stroke, stroke batching, session end
- Rendering `<StatusBar>` and `<RatingOverlay>` (shown automatically when `ended === true`)
- Back navigation

**You do not need to manage sessions, connection state, or the back button yourself.**

---

## RowingContext values

```js
const {
  connected,       // boolean — machine is connected
  sessionId,       // string|null — UUID of current session (null before first stroke)
  elapsedS,        // number — seconds since first stroke
  ended,           // boolean — session has ended
  completed,       // boolean — markComplete() was called
  markComplete,    // () => void — call when goal is achieved
  endSession,      // (opts?) => void — call to quit early
  submitRating,    // (1-5) => Promise — called automatically by RatingOverlay
} = useRowing();
```

---

## useRowingData

```js
useRowingData({
  // Fires on every rowingData CustomEvent (~10 Hz from machine / simulator)
  onStroke: ({ watts, spm, strokeCount, drag }) => { },

  // Fires every 1 second with latest reading
  onInterval: ({ watts, spm, drag }) => { },
});
```

Both callbacks are kept in refs internally — safe to define inline without triggering re-registrations.

---

## PixiJS base layer

For GPU-accelerated, high-fidelity experiments use the pixi module. PixiJS v8 is already installed.

### `<PixiStage>`

Renders a full-screen canvas, initialises a PixiJS Application, and provides it via context. Children are only rendered once the app is ready.

```jsx
import { PixiStage, usePixi, usePixiTicker } from '../../pixi/index.js';

export default function MyPixiExperiment() {
  return (
    <PixiStage pixiOptions={{ background: '#000011' }}>
      <Scene />
    </PixiStage>
  );
}

function Scene() {
  const app = usePixi(); // the live Application instance

  useEffect(() => {
    const sprite = new Sprite(texture);
    app.stage.addChild(sprite);
    return () => sprite.destroy();
  }, [app]);

  usePixiTicker((ticker) => {
    // ticker.deltaTime ≈ 1 at 60 fps (frame-rate independent)
  });

  return null; // Pixi renders to canvas, not React DOM
}
```

### `usePixiTicker(callback)`

Registers a per-frame callback on `app.ticker`. `ticker.deltaTime` is frame-rate normalised (≈1 at 60 fps). Callback ref is always current — safe to define inline.

### `usePixi()`

Returns the initialised `Application` instance. Must be called inside a `<PixiStage>`.

### `pixiOptions` props forward to `Application.init()`

Common options: `background` (hex string or number), `antialias` (default true), `resolution` (default devicePixelRatio).

---

## Registering a new experiment

### 1 — Create the component

```
platform/client/src/experiments/<slug>/index.jsx
```

### 2 — Register in ExperimentPage

```js
// platform/client/src/pages/ExperimentPage.jsx
const EXPERIMENTS = {
  'target-watts': lazy(() => import('../experiments/target-watts/index.jsx')),
  'my-experiment': lazy(() => import('../experiments/my-experiment/index.jsx')), // ← add
};
```

### 3 — Register in database

```sql
INSERT INTO experiments (id, slug, name, description, type, html_content, manifest, status, generated_by)
VALUES (
  gen_random_uuid(),
  'my-experiment',
  'My Experiment',
  'One sentence pitch.',
  'game',
  '',
  '{"type":"game","difficulty":"medium","tags":["power"]}',
  'active',
  'human'
);
```

Or via API:

```bash
curl -X POST http://localhost:3000/api/experiments \
  -H 'Content-Type: application/json' \
  -d '{"slug":"my-experiment","name":"My Experiment","description":"...","type":"game","manifest":{"type":"game","difficulty":"medium","tags":["power"]}}'
```

### 4 — Build

```bash
cd platform/client && npm run build
```

Output lands in `platform/web/` (served by nginx at `localhost:3000`). For dev: `npm run dev` (runs on port 5173 with API proxy to `:8010`).

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

`metric_weights` is optional but influences how the backend scores the experiment. Weights must sum to 1.0. Available keys: `watts`, `fun`, `completion`, `duration`.

---

## Scoring model

The backend computes a `composite_score` (0–100) after every session ends, used to rank experiments on the dashboard:

- **watts delta** (30%) — did the user push harder than their baseline?
- **completion** (30%) — did the experiment reach `markComplete()`?
- **duration delta** (20%) — did the user stay longer than their average?
- **fun rating** (20%) — 1–5 stars submitted after the session

Design accordingly: experiments that reward sustained effort, clear endpoints, and fun get ranked higher.

---

## Display context

- **Screen**: 1920×1080, landscape, fullscreen (no title bar, no nav bar)
- **Distance**: ~1.5m viewing distance from a rowing machine seat
- **Input**: rowing data only — no touch, no keyboard during workout. Physical buttons via `buttonPress` events
- **Font**: anything readable at distance; avoid tiny text
- **Dark themes**: the dashboard is dark; matching the aesthetic is recommended

```js
// Physical button events (short/long press on machine buttons)
window.addEventListener('buttonPress', (e) => {
  if (e.detail.type === 'longPress') endSession();
});
```

---

## Creative direction

### What already exists — do not duplicate the mechanic

| Slug | Core mechanic |
|---|---|
| `target-watts` | Hit and hold watt targets in a vertical power bar; 8 progressive intervals |
| `void-swarm`   | Auto-battler survival: endless enemy waves, watts drive hero speed + fire rate + spread shot; survive 5 min |

- Another vertical bar or gauge as the primary feedback element
- Another interval timer with rest periods (unless radically different)
- Anything that doesn't visually respond to strokes — the display should feel alive

### What is encouraged

- **Narrative / story-driven**: each stroke advances a story, moves a character, or changes the world state
- **Sound design** (Web Audio API): synthesise beats, ambient sound, or music that reacts to watt output
- **Competitive / social**: ghost race against personal best from the DB, or a fictional opponent with a watt profile
- **Physiological**: heart-rate zone trainer (estimated from watts/spm), lactate threshold intervals
- **Abstract / generative art**: strokes drive particle systems, fractal growth, or procedural landscapes
- **Adult/mature themes**: dark psychological challenges, explicit competition, brutal honesty about performance
- **Punishment mechanics**: use `window.cleanRowBridge.postMessage` to set drag, raising resistance when underperforming
- **Dual modes**: easy introduction phase that shifts into brutal hard mode after a threshold
- **Humour**: absurd premises, self-deprecating commentary, surprise elements

### Naming

Names should be evocative and short (2–3 words). Avoid generic names like "Interval Trainer" or "Power Game". Examples of good names: *Void Runner*, *Pressure Drop*, *Dead Calm*, *Red Shift*, *The Climb*.

---

## Example skeleton — plain React (DOM-based)

```jsx
// platform/client/src/experiments/void-runner/index.jsx
import { useState, useCallback } from 'react';
import { useRowing } from '../../context/RowingContext.jsx';
import { useRowingData } from '../../hooks/useRowingData.js';
import styles from './VoidRunner.module.css';

export default function VoidRunner() {
  const { markComplete } = useRowing();
  const [progress, setProgress] = useState(0);

  const handleStroke = useCallback(({ watts }) => {
    setProgress((p) => {
      const next = p + watts * 0.01;
      if (next >= 100) markComplete();
      return Math.min(100, next);
    });
  }, [markComplete]);

  useRowingData({ onStroke: handleStroke });

  return (
    <div className={styles.arena}>
      <div className={styles.bar} style={{ width: `${progress}%` }} />
    </div>
  );
}
```

---

## Example skeleton — PixiJS (GPU-accelerated)

```jsx
// platform/client/src/experiments/red-shift/index.jsx
import { useEffect, useCallback, useRef } from 'react';
import { Graphics, Text } from 'pixi.js';
import { PixiStage, usePixi, usePixiTicker } from '../../pixi/index.js';
import { useRowing } from '../../context/RowingContext.jsx';
import { useRowingData } from '../../hooks/useRowingData.js';

export default function RedShift() {
  return (
    <PixiStage pixiOptions={{ background: '#0a0005' }}>
      <Scene />
    </PixiStage>
  );
}

function Scene() {
  const app = usePixi();
  const { markComplete } = useRowing();
  const stateRef = useRef({ speed: 0, distance: 0 });

  useEffect(() => {
    const g = new Graphics();
    app.stage.addChild(g);
    return () => g.destroy();
  }, [app]);

  useRowingData({
    onStroke: useCallback(({ watts }) => {
      stateRef.current.speed = watts / 200;
    }, []),
  });

  usePixiTicker((ticker) => {
    const s = stateRef.current;
    s.distance += s.speed * ticker.deltaTime;
    if (s.distance >= 1000) markComplete();
    // update pixi display objects here
  });

  return null;
}
```


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

Or via API:

```bash
curl -X POST http://localhost:3000/api/experiments \
  -H 'Content-Type: application/json' \
  -d '{"slug":"my-experiment","name":"My Experiment","description":"...","type":"game","html_content":"","manifest":{"type":"game","difficulty":"medium","tags":["power"]}}'
```
