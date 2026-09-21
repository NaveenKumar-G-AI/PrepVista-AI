-- ACEAPT Feature 20 — Adaptive Real-World Aptitude Simulation & Pressure
-- Intelligence Engine. Schema is intentionally self-contained (no FK out to
-- an external student/auth table) since no existing ACEAPT repo was
-- available to extend — see README.md "Integration notes".

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Configurable assessment blueprints (Feature 20 §23). One row per distinct
-- test shape (the 15Q/18min main simulation, the two drill shapes, etc).
CREATE TABLE IF NOT EXISTS blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'drill')),
  question_count INT NOT NULL,
  duration_sec INT NOT NULL,
  marking_correct NUMERIC(4,2) NOT NULL DEFAULT 1,
  marking_wrong NUMERIC(4,2) NOT NULL DEFAULT -0.25,
  marking_skip NUMERIC(4,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reusable question bank. In production this is Feature 17's generation
-- engine; here it is a small hand-verified seed set (see seed.ts).
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  concept TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Very Hard')),
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_index INT NOT NULL,
  explanation TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fixed, intentionally-mixed ordering of a blueprint's questions (Feature 20
-- §2/§3 — mixed topics, volatile difficulty, never grouped).
CREATE TABLE IF NOT EXISTS blueprint_questions (
  blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sequence_index INT NOT NULL,
  PRIMARY KEY (blueprint_id, sequence_index)
);

-- Minimal student stub — no auth system exists to integrate with in this
-- standalone build. Swap for your real user table; every FK below only
-- needs a stable UUID.
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL DEFAULT 'Demo Student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simulation state machine (Feature 20 §53).
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  blueprint_id UUID NOT NULL REFERENCES blueprints(id),
  parent_session_id UUID REFERENCES sessions(id),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'TIME_EXPIRED', 'PROCESSING', 'ANALYZED', 'COMPLETED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  used_sec INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id);

-- Per-question response + decision state within a session (Feature 20 §5/§18/§19).
CREATE TABLE IF NOT EXISTS session_responses (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id),
  sequence_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unvisited' CHECK (status IN ('unvisited', 'viewed', 'answered')),
  selected_index INT,
  marked_for_review BOOLEAN NOT NULL DEFAULT false,
  time_spent_ms BIGINT NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  visits INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, question_id)
);

-- Full event log (Feature 20 §54) — powers navigation-intelligence analysis.
CREATE TABLE IF NOT EXISTS session_events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  question_id UUID,
  from_index INT,
  to_index INT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, occurred_at);

-- Cached computed evidence + AI narrative for a completed session, so the
-- report never recomputes (or re-calls the AI) on every page load.
CREATE TABLE IF NOT EXISTS session_evidence (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  evidence JSONB NOT NULL,
  narrative TEXT,
  narrative_source TEXT CHECK (narrative_source IN ('ai', 'fallback')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Longitudinal mock-consistency tracking (Feature 20 §35).
CREATE TABLE IF NOT EXISTS mock_history (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES students(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  score NUMERIC(6,2) NOT NULL,
  max_score NUMERIC(6,2) NOT NULL,
  accuracy INT NOT NULL,
  selection_quality TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mock_history_student ON mock_history(student_id, completed_at);
