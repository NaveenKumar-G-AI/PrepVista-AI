-- ============================================================================
-- ACEAPT AI — Feature 16 — Reference relational schema
-- ============================================================================
-- This is a REFERENCE design (Postgres-flavoured), not something to apply
-- blindly. Section 39 of the brief is explicit: reuse existing models, avoid
-- duplicate data systems. Before running any of this against a real database:
--
--   1. Check whether `students` and `skills` (or equivalents) already exist
--      elsewhere in your system — they almost certainly do, since Features
--      10-15 depend on them. Point the foreign keys below at those tables
--      instead of creating new ones.
--   2. Only create the Feature-16-specific tables (attempts through events)
--      if there isn't already an equivalent.
--   3. The prototype in /server uses an embedded JSON file
--      (server/data/db.json) instead of this schema, precisely so it runs
--      with zero infrastructure setup. Swap server/src/data/store.ts for a
--      real DB client once you point it at this schema (or your existing
--      equivalent) — nothing above that module needs to change.

-- Likely already exists elsewhere — included only for referential completeness.
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Likely already exists as part of Feature 14/15's skill graph.
CREATE TABLE IF NOT EXISTS skills (
  id                      TEXT PRIMARY KEY,
  label                   TEXT NOT NULL,
  parent_skill_id         TEXT REFERENCES skills(id),
  prerequisite_skill_ids  TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL REFERENCES students(id),
  skill_id              TEXT NOT NULL REFERENCES skills(id),
  micro_skill_id        TEXT,
  question_id           TEXT NOT NULL,
  correct               BOOLEAN NOT NULL,
  response_time_seconds INTEGER NOT NULL,
  expected_time_seconds INTEGER NOT NULL,
  difficulty            TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  question_type         TEXT NOT NULL,
  hints_used            INTEGER NOT NULL DEFAULT 0,
  self_reported_reason  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_student_skill_time ON attempts (student_id, skill_id, created_at);

CREATE TABLE IF NOT EXISTS solution_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id   UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  step_number  INTEGER NOT NULL,
  description  TEXT NOT NULL,
  step_type    TEXT NOT NULL CHECK (step_type IN ('concept','strategy','procedure','calculation','interpretation')),
  correct      BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_solution_steps_attempt ON solution_steps (attempt_id, step_number);

CREATE TABLE IF NOT EXISTS diagnoses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id            UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  root_cause            TEXT NOT NULL,
  confidence            TEXT NOT NULL CHECK (confidence IN ('HIGH','MODERATE','LOW')),
  is_primary            BOOLEAN NOT NULL DEFAULT true,
  evidence_summary      TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnoses_attempt ON diagnoses (attempt_id);

CREATE TABLE IF NOT EXISTS interventions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         TEXT NOT NULL REFERENCES students(id),
  skill_id           TEXT NOT NULL REFERENCES skills(id),
  micro_skill_id     TEXT,
  root_cause         TEXT NOT NULL,
  intervention_type  TEXT NOT NULL,
  escalation_level   SMALLINT NOT NULL DEFAULT 0,
  status             TEXT NOT NULL CHECK (status IN ('recommended','in_progress','completed_improved','completed_not_improved')),
  before_accuracy    REAL,
  after_accuracy     REAL,
  source_attempt_id  UUID REFERENCES attempts(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_interventions_student_skill_status ON interventions (student_id, skill_id, status);

CREATE TABLE IF NOT EXISTS intervention_outcomes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id       UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  before_accuracy       REAL NOT NULL,
  after_accuracy        REAL NOT NULL,
  improved              BOOLEAN NOT NULL,
  independence_trend    TEXT NOT NULL,
  transfer_status       TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hint_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id  UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students(id),
  level            SMALLINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          TEXT NOT NULL REFERENCES students(id),
  skill_id            TEXT NOT NULL REFERENCES skills(id),
  micro_skill_id      TEXT,
  triggering_pattern  TEXT NOT NULL,
  root_cause          TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('in_progress','completed','abandoned')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS recovery_session_steps (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_session_id  UUID NOT NULL REFERENCES recovery_sessions(id) ON DELETE CASCADE,
  step_index           SMALLINT NOT NULL,
  step_type            TEXT NOT NULL,
  title                TEXT NOT NULL,
  estimated_minutes    SMALLINT NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('pending','completed')),
  UNIQUE (recovery_session_id, step_index)
);

CREATE TABLE IF NOT EXISTS student_intervention_profile (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         TEXT NOT NULL REFERENCES students(id),
  intervention_type  TEXT NOT NULL,
  helpful_count      INTEGER NOT NULL DEFAULT 0,
  unhelpful_count    INTEGER NOT NULL DEFAULT 0,
  last_outcome_at    TIMESTAMPTZ,
  UNIQUE (student_id, intervention_type)
);

CREATE TABLE IF NOT EXISTS events (
  id               TEXT PRIMARY KEY, -- idempotency key
  event_type       TEXT NOT NULL,
  student_id       TEXT NOT NULL REFERENCES students(id),
  payload_json     JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_student_type ON events (student_id, event_type, created_at);
