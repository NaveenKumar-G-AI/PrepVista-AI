-- Feature 58 — Guessing Intelligence Engine
-- Schema for NEW tables only. Per the reuse-first rule (spec §15/124/186), this
-- migration does NOT create Student, Assessment, Question, Attempt or Confidence
-- tables — those already exist in ACEAPT. Cross-entity references below are plain
-- UUID columns (no FK constraint into tables this module doesn't own), so this
-- migration can be applied standalone without depending on the rest of the schema.
-- Wire real FKs in once this is merged into the actual database if you want them.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE decision_context AS ENUM ('TRAINING', 'PRACTICE', 'MOCK', 'FORMAL_ASSESSMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE decision_action AS ENUM (
    'FULL_SOLVE', 'PARTIAL_SOLVE', 'CONTINUE', 'ELIMINATE', 'ESTIMATE',
    'INFORMED_GUESS', 'BLIND_GUESS', 'SKIP', 'RETURN_LATER',
    'SWITCH_METHOD', 'KEEP_ANSWER', 'CHANGE_ANSWER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE uncertainty_state AS ENUM (
    'CERTAIN', 'HIGH_CONFIDENCE', 'PROBABLE', 'UNCERTAIN', 'LOW_CONFIDENCE', 'NO_USEFUL_EVIDENCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confidence_band AS ENUM ('VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE insight_confidence AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE strategy_assistance_level AS ENUM ('NONE', 'POST_ONLY', 'LIVE_LIMITED', 'FULL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE scoring_policy_source AS ENUM ('VERIFIED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE training_mode AS ENUM (
    'DECISION', 'ELIMINATION', 'INFORMED_GUESS', 'ESTIMATION', 'RISK',
    'TIME', 'SWITCH', 'CONFIDENCE', 'REVIEW'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- decision_policy_versions — versioned snapshot of scoring rules actually used
-- for a decision, so historical decisions stay reproducible even if the real
-- assessment's scoring config changes later (§122-123).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_policy_versions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  assessment_version_id   UUID NOT NULL,
  correct_reward          NUMERIC(10,4) NOT NULL,
  wrong_penalty           NUMERIC(10,4) NOT NULL DEFAULT 0, -- non-negative magnitude deducted on a wrong attempt
  blank_value             NUMERIC(10,4) NOT NULL DEFAULT 0,
  partial_value           NUMERIC(10,4),
  time_limit_seconds      INTEGER,
  navigation_rules        JSONB NOT NULL DEFAULT '{"canSkip":true,"canReturnLater":true,"canChangeAnswer":true}'::jsonb,
  strategy_assistance     strategy_assistance_level NOT NULL DEFAULT 'NONE',
  source                  scoring_policy_source NOT NULL DEFAULT 'UNKNOWN',
  version                 INTEGER NOT NULL,
  effective_from          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, assessment_version_id, version)
);

-- ---------------------------------------------------------------------------
-- decision_events — the core telemetry table (§125). One row per uncertain-
-- question decision, across TRAINING/PRACTICE/MOCK/FORMAL_ASSESSMENT contexts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_events (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL,
  student_id                      UUID NOT NULL,
  assessment_id                   UUID NOT NULL,
  assessment_version_id           UUID,
  question_version_id             UUID NOT NULL,
  attempt_id                      UUID,
  context                         decision_context NOT NULL,
  action                          decision_action NOT NULL,
  uncertainty_state               uncertainty_state,
  confidence_band                 confidence_band,
  confidence_probability          SMALLINT CHECK (confidence_probability IS NULL OR confidence_probability BETWEEN 0 AND 100),
  evidence_used                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  eliminated_option_ids           JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_options                   SMALLINT,
  question_expected_time_seconds  INTEGER,
  student_expected_time_seconds   INTEGER,
  elapsed_time_seconds            INTEGER NOT NULL,
  remaining_test_time_seconds     INTEGER,
  scoring_policy_version_id       UUID REFERENCES decision_policy_versions(id),
  initial_option_id               TEXT,
  final_option_id                 TEXT,
  answer_changed                  BOOLEAN NOT NULL DEFAULT false,
  is_correct                      BOOLEAN, -- null until graded / results released
  decision_quality                JSONB,   -- computed post-hoc from decision-time fields only, see domain/decisionQuality.ts
  idempotency_key                 TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_decision_events_student   ON decision_events (tenant_id, student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_events_assessment ON decision_events (tenant_id, assessment_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_question   ON decision_events (question_version_id);
CREATE INDEX IF NOT EXISTS idx_decision_events_action     ON decision_events (tenant_id, student_id, action);

-- ---------------------------------------------------------------------------
-- decision_insights — generated, evidence-backed observations (§127, §203-205)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  student_id    UUID NOT NULL,
  insight_type  TEXT NOT NULL,
  message       TEXT NOT NULL,
  evidence      JSONB NOT NULL,
  confidence    insight_confidence NOT NULL,
  sample_size   INTEGER NOT NULL,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_insights_student ON decision_insights (tenant_id, student_id, generated_at DESC);

-- ---------------------------------------------------------------------------
-- confidence_calibration_snapshots (§128)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS confidence_calibration_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  student_id              UUID NOT NULL,
  confidence_band         confidence_band NOT NULL,
  predicted_probability   NUMERIC(5,2),
  observed_accuracy       NUMERIC(5,2) NOT NULL,
  sample_size             INTEGER NOT NULL,
  period_start            TIMESTAMPTZ NOT NULL,
  period_end              TIMESTAMPTZ NOT NULL,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, student_id, confidence_band, period_start, period_end)
);

-- ---------------------------------------------------------------------------
-- decision_training_scenarios — content served in DECISION/ELIMINATION/RISK/
-- etc. training modes (§77, §194 validation pipeline).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_training_scenarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  mode                training_mode NOT NULL,
  difficulty_level    SMALLINT NOT NULL,
  question_version_id UUID,
  policy_version_id   UUID REFERENCES decision_policy_versions(id),
  generated_by        TEXT NOT NULL DEFAULT 'CURATED', -- 'CURATED' | 'AI_GENERATED'
  validation_status   TEXT NOT NULL DEFAULT 'PENDING',  -- 'PENDING' | 'VALIDATED' | 'REJECTED'
  payload             JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_servable ON decision_training_scenarios (tenant_id, mode, difficulty_level) WHERE validation_status = 'VALIDATED';
