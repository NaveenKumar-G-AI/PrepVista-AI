-- =============================================================================
-- FEATURE 55 — Question Difficulty Calibration Engine
-- Migration 001: core schema
--
-- Owns: difficulty_calibration_runs, difficulty_snapshots, difficulty_history,
--       difficulty_anomalies, difficulty_review_actions,
--       difficulty_initial_estimates
--
-- Reads (does not own, does not duplicate): questions, question_versions,
--       attempts, students — see db/reference/000_assumed_existing_schema.sql
--       for the shape this reference implementation assumes.
-- =============================================================================

DO $$ BEGIN CREATE TYPE difficulty_status AS ENUM
  ('PROVISIONAL','CALIBRATED','STALE','NEEDS_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE difficulty_source AS ENUM
  ('AUTHOR','AI','STRUCTURAL','EMPIRICAL','CALIBRATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE difficulty_category AS ENUM ('EASY','MEDIUM','HARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OVERALL is the primary, population-representative estimate. The rest are
-- context-conditioned views of the same item (spec §74, §108) — only computed
-- once sample size clears the conditioned-evidence threshold (see
-- calibration.config.ts). None of them ever overwrite OVERALL.
DO $$ BEGIN CREATE TYPE difficulty_mode AS ENUM
  ('OVERALL','UNTIMED','TIMED','FAMILIAR','NOVEL','INDEPENDENT','GUIDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE confidence_level AS ENUM ('LOW','MEDIUM','HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE calibration_run_status AS ENUM
  ('QUEUED','RUNNING','SUCCEEDED','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE anomaly_type AS ENUM (
  'TOO_EASY','TOO_HARD','UNEXPECTEDLY_SLOW','UNEXPECTEDLY_FAST',
  'HIGH_VARIANCE','LABEL_MISMATCH','DIFFICULTY_DRIFT',
  'INSUFFICIENT_DATA','WEAK_DISCRIMINATION'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE anomaly_status AS ENUM
  ('OPEN','REVIEWING','RESOLVED','DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE review_action_type AS ENUM
  ('APPROVE','HOLD','REQUEST_RECALIBRATION','DISMISS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS difficulty_calibration_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  scope                TEXT NOT NULL DEFAULT 'SINGLE_QUESTION', -- SINGLE_QUESTION | SKILL | GLOBAL
  question_version_id  UUID,                                    -- null for SKILL/GLOBAL runs
  skill_id             UUID,
  population_id        TEXT NOT NULL DEFAULT 'default',
  method               TEXT NOT NULL DEFAULT 'P0_FACILITY',
  status               calibration_run_status NOT NULL DEFAULT 'QUEUED',
  triggered_by         TEXT NOT NULL DEFAULT 'SYSTEM',
  questions_processed  INT NOT NULL DEFAULT 0,
  questions_failed     INT NOT NULL DEFAULT 0,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  error                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_tenant ON difficulty_calibration_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON difficulty_calibration_runs(status);

-- -----------------------------------------------------------------------------
-- One row per (question_version, population, mode) PER CALIBRATION EVENT.
-- Only the row with is_active=true is "live" — publication is atomic (see
-- difficulty-snapshot.service.ts) and history is never deleted, only
-- superseded, so calibration history (spec §120-121) is a plain query over
-- this table, no separate copy needed.
CREATE TABLE IF NOT EXISTS difficulty_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  question_version_id   UUID NOT NULL,
  population_id         TEXT NOT NULL DEFAULT 'default',
  mode                  difficulty_mode NOT NULL DEFAULT 'OVERALL',

  estimate              NUMERIC(6,5),   -- 0..1, higher = harder ( = 1 - facility, robustly derived)
  facility              NUMERIC(6,5),
  ci_low                NUMERIC(6,5),   -- Wilson score interval on facility
  ci_high               NUMERIC(6,5),
  sample_size           INT NOT NULL DEFAULT 0,
  confidence            confidence_level NOT NULL DEFAULT 'LOW',

  category              difficulty_category,
  status                difficulty_status NOT NULL DEFAULT 'PROVISIONAL',
  source                difficulty_source NOT NULL DEFAULT 'STRUCTURAL',
  method                TEXT NOT NULL DEFAULT 'P0_FACILITY',

  median_time_ms        INT,
  p25_time_ms           INT,
  p75_time_ms           INT,
  time_sample_size      INT NOT NULL DEFAULT 0,

  discrimination        NUMERIC(5,4),   -- P1-lite: top-third vs bottom-third facility gap
  discrimination_sample_size INT NOT NULL DEFAULT 0,

  label_mismatch        BOOLEAN NOT NULL DEFAULT false,
  initial_category      difficulty_category, -- snapshotted at calibration time, for mismatch display

  content_hash_at_calibration TEXT,
  calibration_run_id    UUID REFERENCES difficulty_calibration_runs(id),
  is_active             BOOLEAN NOT NULL DEFAULT false,
  superseded_at         TIMESTAMPTZ,
  superseded_by         UUID REFERENCES difficulty_snapshots(id),

  calibrated_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- exactly one active snapshot per version/population/mode (spec §150-151, atomicity)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_snapshot
  ON difficulty_snapshots (question_version_id, population_id, mode)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_snapshots_qv ON difficulty_snapshots(question_version_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON difficulty_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_status ON difficulty_snapshots(status);

-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS difficulty_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  question_version_id   UUID NOT NULL,
  snapshot_id           UUID REFERENCES difficulty_snapshots(id),
  previous_snapshot_id  UUID REFERENCES difficulty_snapshots(id),
  field_changed         TEXT NOT NULL,
  old_value             TEXT,
  new_value             TEXT,
  reason                TEXT NOT NULL,
  actor                 TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_qv ON difficulty_history(question_version_id);

-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS difficulty_anomalies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  question_version_id   UUID NOT NULL,
  snapshot_id           UUID REFERENCES difficulty_snapshots(id),
  type                  anomaly_type NOT NULL,
  severity              TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH
  details               JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                anomaly_status NOT NULL DEFAULT 'OPEN',
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  resolved_by           TEXT
);
CREATE INDEX IF NOT EXISTS idx_anomalies_qv ON difficulty_anomalies(question_version_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON difficulty_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON difficulty_anomalies(tenant_id);

-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS difficulty_review_actions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  question_version_id   UUID NOT NULL,
  anomaly_id            UUID REFERENCES difficulty_anomalies(id),
  action                review_action_type NOT NULL,
  actor                 TEXT NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_qv ON difficulty_review_actions(question_version_id);

-- -----------------------------------------------------------------------------
-- Initial (pre-empirical) estimate, computed once at question-version creation
-- time. Never itself treated as ground truth (spec §11, §92) — it only seeds
-- the PROVISIONAL snapshot and gives §32 label-mismatch something to compare
-- against.
CREATE TABLE IF NOT EXISTS difficulty_initial_estimates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  question_version_id   UUID NOT NULL,
  structural_score      NUMERIC(6,5),
  ai_score               NUMERIC(6,5),
  ai_rationale           TEXT,
  ai_source              TEXT,  -- 'anthropic' | 'fallback_template'
  author_label           TEXT,
  combined_estimate      NUMERIC(6,5),
  combined_category      difficulty_category,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_initial_qv ON difficulty_initial_estimates(question_version_id);
