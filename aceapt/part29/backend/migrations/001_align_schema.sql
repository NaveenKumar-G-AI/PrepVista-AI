-- ============================================================================
-- ACEAPT FEATURE 29 — ALIGN
-- Migration 001: core schema
--
-- Conventions carried over from the rest of ACEAPT: Postgres (not SQLite),
-- Row Level Security scoping every student-owned table to that student via
-- a session-local setting (app.current_student_id), set per-request by the
-- API layer after verifying auth (see src/db/pool.ts::withStudentContext).
--
-- IMPORTANT: every RLS table below is also given FORCE ROW LEVEL SECURITY.
-- Postgres exempts a table's OWNER from its own RLS policies by default —
-- ENABLE alone is not enough if the application connects as the owning
-- role (which it will, in a single-role dev/local setup). This was caught
-- by a manual psql proof while building this migration: an "alice" session
-- was able to insert a row claiming to be "bob" until FORCE was added.
-- Production should still prefer a non-owner application role as defense
-- in depth, but FORCE is what actually closes the hole in the meantime.
--
-- Also note: the custom GUC is named app.actor_role, not app.current_role —
-- current_role collides with Postgres's reserved CURRENT_ROLE keyword and
-- fails to parse as a plain SET target.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Target profiles (spec §13-15, §49) — configuration, not per-student data.
-- Readable by any authenticated caller; writes are expected to go through an
-- admin/TPO-authorized path in the host app, not through student sessions.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS target_profiles (
  target_id                  TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  description                  TEXT NOT NULL DEFAULT '',
  active                        BOOLEAN NOT NULL DEFAULT true,
  typical_preparation_weeks      INTEGER,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS target_capability_requirements (
  id              BIGSERIAL PRIMARY KEY,
  target_id       TEXT NOT NULL REFERENCES target_profiles(target_id) ON DELETE CASCADE,
  capability_id   TEXT NOT NULL,
  importance      TEXT NOT NULL CHECK (importance IN ('CORE', 'IMPORTANT', 'SUPPORTING')),
  required_level  TEXT NOT NULL CHECK (
    required_level IN ('VERY_WEAK', 'WEAK', 'DEVELOPING', 'MEDIUM', 'STRONG', 'VERY_STRONG')
  ),
  UNIQUE (target_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_target_capability_requirements_target
  ON target_capability_requirements (target_id);

-- ----------------------------------------------------------------------------
-- Capability evidence (spec §11) — REFERENCE / FALLBACK STORE.
--
-- This table exists so the module runs standalone against real Postgres.
-- In production, point src/integrations/evidenceSource.ts at whichever
-- tables Feature 3/5/6/8/20 already use for attempts/assessments instead of
-- this one — see spec §11 ("reuse existing ACEAPT data structures") and
-- docs/INTEGRATION.md.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capability_evidence_events (
  id              BIGSERIAL PRIMARY KEY,
  student_id      TEXT NOT NULL,
  capability_id   TEXT NOT NULL,
  performance     REAL NOT NULL CHECK (performance >= 0 AND performance <= 1),
  occurred_at     TIMESTAMPTZ NOT NULL,
  difficulty      REAL NOT NULL CHECK (difficulty >= 0 AND difficulty <= 1),
  novelty         REAL NOT NULL CHECK (novelty >= 0 AND novelty <= 1),
  timed           BOOLEAN NOT NULL DEFAULT false,
  proof_verified  BOOLEAN NOT NULL DEFAULT false,
  source_ref      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_student_capability
  ON capability_evidence_events (student_id, capability_id);

ALTER TABLE capability_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE capability_evidence_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evidence_student_isolation ON capability_evidence_events;
CREATE POLICY evidence_student_isolation ON capability_evidence_events
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));

-- Service role (used by ingestion jobs / other ACEAPT features writing
-- evidence on a student's behalf) bypasses per-row isolation entirely.
DROP POLICY IF EXISTS evidence_service_role_bypass ON capability_evidence_events;
CREATE POLICY evidence_service_role_bypass ON capability_evidence_events
  USING (current_setting('app.actor_role', true) = 'service')
  WITH CHECK (current_setting('app.actor_role', true) = 'service');

-- ----------------------------------------------------------------------------
-- Student target selection / drift tracking (spec §34, §51 StudentTarget)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_targets (
  id                  BIGSERIAL PRIMARY KEY,
  student_id          TEXT NOT NULL,
  target_id           TEXT NOT NULL REFERENCES target_profiles(target_id),
  selected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_target_id  TEXT,
  reason              TEXT
);

CREATE INDEX IF NOT EXISTS idx_student_targets_student
  ON student_targets (student_id, selected_at DESC);

ALTER TABLE student_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_targets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_targets_isolation ON student_targets;
CREATE POLICY student_targets_isolation ON student_targets
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));

DROP POLICY IF EXISTS student_targets_service_role_bypass ON student_targets;
CREATE POLICY student_targets_service_role_bypass ON student_targets
  USING (current_setting('app.actor_role', true) IN ('service', 'tpo'))
  WITH CHECK (current_setting('app.actor_role', true) = 'service');

-- ----------------------------------------------------------------------------
-- Alignment results (spec §52) — the cache §57 asks for, so the dashboard
-- isn't recomputing the full engine on every render.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alignment_results (
  student_id                          TEXT NOT NULL,
  target_id                           TEXT NOT NULL REFERENCES target_profiles(target_id),
  fit_score                           INTEGER,
  readiness_score                     INTEGER,
  confidence                          TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  alignment_state                     TEXT NOT NULL CHECK (
    alignment_state IN ('STRONGLY_ALIGNED', 'DEVELOPING_ALIGNMENT', 'LOW_ALIGNMENT', 'INSUFFICIENT_EVIDENCE')
  ),
  strengths                           JSONB NOT NULL DEFAULT '[]',
  critical_gaps                       JSONB NOT NULL DEFAULT '[]',
  supporting_gaps                     JSONB NOT NULL DEFAULT '[]',
  next_best_action                    JSONB,
  insufficient_evidence_capabilities  JSONB NOT NULL DEFAULT '[]',
  insufficient_evidence_reason        TEXT,
  calculated_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_alignment_results_student
  ON alignment_results (student_id);

ALTER TABLE alignment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_results FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alignment_results_isolation ON alignment_results;
CREATE POLICY alignment_results_isolation ON alignment_results
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));

DROP POLICY IF EXISTS alignment_results_service_role_bypass ON alignment_results;
CREATE POLICY alignment_results_service_role_bypass ON alignment_results
  USING (current_setting('app.actor_role', true) IN ('service', 'tpo'))
  WITH CHECK (current_setting('app.actor_role', true) = 'service');

-- ----------------------------------------------------------------------------
-- Alignment history (spec §33, §53) — insert-only snapshots.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alignment_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  student_id        TEXT NOT NULL,
  target_id         TEXT NOT NULL REFERENCES target_profiles(target_id),
  fit_score         INTEGER,
  readiness_score   INTEGER,
  alignment_state   TEXT NOT NULL,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alignment_snapshots_lookup
  ON alignment_snapshots (student_id, target_id, captured_at);

ALTER TABLE alignment_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alignment_snapshots_isolation ON alignment_snapshots;
CREATE POLICY alignment_snapshots_isolation ON alignment_snapshots
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));

DROP POLICY IF EXISTS alignment_snapshots_service_role_bypass ON alignment_snapshots;
CREATE POLICY alignment_snapshots_service_role_bypass ON alignment_snapshots
  USING (current_setting('app.actor_role', true) IN ('service', 'tpo'))
  WITH CHECK (current_setting('app.actor_role', true) = 'service');

-- ----------------------------------------------------------------------------
-- What-if scenarios (spec §28-30, §54) — explicitly NOT the same table as
-- actual results; a scenario is a hypothetical and must never be readable
-- as if it were measured.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alignment_scenarios (
  id                        BIGSERIAL PRIMARY KEY,
  student_id                TEXT NOT NULL,
  target_id                 TEXT NOT NULL REFERENCES target_profiles(target_id),
  capability_id              TEXT NOT NULL,
  current_level               TEXT NOT NULL,
  projected_level              TEXT NOT NULL,
  projected_fit_score           INTEGER,
  projected_readiness_score      INTEGER,
  projection_reliable            BOOLEAN NOT NULL,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alignment_scenarios_student
  ON alignment_scenarios (student_id, target_id, created_at DESC);

ALTER TABLE alignment_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_scenarios FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alignment_scenarios_isolation ON alignment_scenarios;
CREATE POLICY alignment_scenarios_isolation ON alignment_scenarios
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));

-- ----------------------------------------------------------------------------
-- Durable outbox (matches the signal-bus pattern already used for
-- Feature 3/4/6/7 integration elsewhere in ACEAPT) — ALIGN -> ADAPT,
-- ALIGN -> PROOF. Internal plumbing only; no student-facing RLS policy,
-- service role only.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS align_outbox (
  id                  BIGSERIAL PRIMARY KEY,
  event_type          TEXT NOT NULL,
  student_id          TEXT NOT NULL,
  payload             JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at       TIMESTAMPTZ,
  dispatch_attempts   INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_align_outbox_undispatched
  ON align_outbox (created_at) WHERE dispatched_at IS NULL;

ALTER TABLE align_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE align_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS align_outbox_service_only ON align_outbox;
CREATE POLICY align_outbox_service_only ON align_outbox
  USING (current_setting('app.actor_role', true) = 'service')
  WITH CHECK (current_setting('app.actor_role', true) = 'service');

INSERT INTO schema_migrations (version) VALUES ('001_align_schema')
  ON CONFLICT (version) DO NOTHING;
