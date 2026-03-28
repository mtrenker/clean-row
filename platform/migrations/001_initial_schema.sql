-- Clean Row Platform - Database Schema
-- Run order matters: tables with FKs come after their dependencies

-- ─────────────────────────────────────────────────────────────────
-- Experiments
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE experiments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,           -- URL-safe identifier
    name            TEXT NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL DEFAULT 'game',   -- game | pacer | visual | audio
    html_content    TEXT NOT NULL,                  -- full HTML of the experiment
    manifest        JSONB NOT NULL DEFAULT '{}',    -- { metric_weights, tags, difficulty }
    status          TEXT NOT NULL DEFAULT 'pending',-- pending | active | archived
    generated_by    TEXT,                           -- 'human' | 'ai:model-name'
    composite_score NUMERIC(5,2),                   -- recalculated after each session
    play_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_experiments_score  ON experiments(composite_score DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────
-- Sessions
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id   UUID REFERENCES experiments(id) ON DELETE SET NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    duration_s      INTEGER,                        -- actual rowing seconds
    total_strokes   INTEGER,
    avg_watts       NUMERIC(6,1),
    max_watts       NUMERIC(6,1),
    avg_spm         NUMERIC(5,1),
    avg_drag        NUMERIC(5,1),
    completed       BOOLEAN NOT NULL DEFAULT FALSE, -- did user finish the experiment
    fun_rating      SMALLINT CHECK (fun_rating BETWEEN 1 AND 5),
    notes           TEXT,
    raw_summary     JSONB                           -- full per-stroke summary blob
);

CREATE INDEX idx_sessions_experiment ON sessions(experiment_id);
CREATE INDEX idx_sessions_started    ON sessions(started_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- Per-stroke metrics  (one row per stroke during a session)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE session_strokes (
    id            BIGSERIAL PRIMARY KEY,
    session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    stroke_num    INTEGER NOT NULL,
    ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    watts         NUMERIC(6,1),
    spm           NUMERIC(5,1),
    drag          NUMERIC(5,1)
);

CREATE INDEX idx_strokes_session ON session_strokes(session_id, stroke_num);

-- Only keep last 500 strokes per session in this table (archive rest in raw_summary)
-- Enforced at application level.

-- ─────────────────────────────────────────────────────────────────
-- Garmin data (daily snapshot)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE garmin_daily (
    id                  BIGSERIAL PRIMARY KEY,
    calendar_date       DATE UNIQUE NOT NULL,
    sleep_score         SMALLINT,
    body_battery_max    SMALLINT,
    body_battery_min    SMALLINT,
    resting_hr          SMALLINT,
    hrv_status          TEXT,       -- 'balanced' | 'unbalanced' | 'poor' | 'low'
    hrv_weekly_avg      NUMERIC(5,1),
    stress_avg          SMALLINT,
    raw                 JSONB       -- full API response for future use
);

-- ─────────────────────────────────────────────────────────────────
-- AI-generated session recommendations
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE session_recommendations (
    id              BIGSERIAL PRIMARY KEY,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_date     DATE NOT NULL DEFAULT CURRENT_DATE + 1,
    experiment_id   UUID REFERENCES experiments(id),
    recommendation  TEXT NOT NULL,          -- human-readable markdown
    intensity       TEXT,                   -- 'recovery' | 'moderate' | 'hard'
    target_duration_s INTEGER,
    target_avg_watts  NUMERIC(6,1),
    model_used      TEXT,
    prompt_context  JSONB                   -- what data was fed to the LLM
);

-- ─────────────────────────────────────────────────────────────────
-- Utility: auto-update updated_at
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
