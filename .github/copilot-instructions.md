# Clean Row — Copilot Instructions

This is a rowing machine gamification platform. See the skills below for domain-specific guidance.

## Skills

- **Experiment authoring**: when asked to create, design, or write a new experiment, read `.github/copilot/experiments/SKILL.md` for the full spec, SDK reference, creative direction, and file conventions.

## Project layout

```
platform/
  web/
    experiments/<slug>/index.html   ← experiment files
    sdk/experiment-sdk.js           ← SDK (read before modifying)
    shared/nav.js                   ← back-button injector
    dashboard/index.html            ← main dashboard
  backend/                          ← FastAPI + SQLAlchemy
  nginx/default.conf
  docker-compose.yml
app/                                ← Android (Kotlin) WebView wrapper
```

## Tech stack

- **Frontend**: vanilla HTML/CSS/JS, no build step, served by nginx
- **Backend**: FastAPI (Python), PostgreSQL 16, SQLAlchemy async
- **Android**: Kotlin WebView, ADB wireless, `webview_multiprocess=0` (required on this device)
- **Docker**: `docker compose up --build -d` from `platform/`; backend rebuild required after Python changes
- **Build**: `JAVA_HOME=/home/martin/.local/jdks/temurin-17 ./gradlew assembleDebug` from repo root
