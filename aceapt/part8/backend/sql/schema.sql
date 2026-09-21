-- ============================================================
-- ACEAPT FEATURE 8 — Mastery Verification, Retention & Transfer Engine
-- Core schema. Idempotent (safe to run multiple times).
--
-- Isolation model:
--   aceapt_service  -> owns everything, BYPASSRLS. Used for migrations,
--                       seeding, and cross-student background jobs
--                       (review sweep, regression sweep).
--   aceapt_app      -> used by the per-request API pool. Subject to RLS
--                       on every student-scoped table. Each authenticated
--                       request runs `SET LOCAL app.current_student_id`
--                       inside a transaction before touching these tables
--                       (see src/lib/db.ts -> withStudentScope).
-- ============================================================

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE novelty_level AS ENUM ('FAMILIAR','SLIGHTLY_VARIANT','NOVEL','COMPLEX_APPLICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE context_type AS ENUM ('LABELED','MIXED_CONTEXT','REAL_WORLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_quality_status AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_source AS ENUM ('SEED','AI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exposure_state AS ENUM ('SEEN','PRACTICED','VERIFIED','REPEATED','MEMORIZATION_RISK','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE evidence_type AS ENUM ('PRACTICE','ASSESSMENT','VARIATION','TRANSFER','DELAYED','MIXED_CONTEXT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mastery_state_enum AS ENUM (
    'UNKNOWN','INTRODUCED','LEARNING','PRACTICING','IMPROVING',
    'PROVISIONALLY_MASTERED','VERIFIED_MASTERED','STABLE_MASTERED',
    'AT_RISK','REGRESSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM ('LOW','MEDIUM','HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_objective AS ENUM (
    'PROVISIONAL_CHECK','VERIFY_TRANSFER','STABILITY_CHECK',
    'MAINTENANCE_CHECK','DELAYED_VERIFICATION','RECOVERY_CHECK'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attempt_status AS ENUM ('IN_PROGRESS','COMPLETED','ABANDONED','TECHNICAL_FAILURE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attempt_result AS ENUM ('MASTERY_VERIFIED','NOT_STABLE_YET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Core tables ----------

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  importance DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  form_group_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  choices JSONB NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty DOUBLE PRECISION NOT NULL,
  novelty_level novelty_level NOT NULL DEFAULT 'FAMILIAR',
  context_type context_type NOT NULL DEFAULT 'LABELED',
  expected_time_seconds INTEGER NOT NULL,
  generated_by question_source NOT NULL DEFAULT 'SEED',
  quality_status question_quality_status NOT NULL DEFAULT 'APPROVED',
  quality_checks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_skill_novelty ON questions(skill_id, novelty_level, quality_status);
CREATE INDEX IF NOT EXISTS idx_questions_form_group ON questions(form_group_id);

CREATE TABLE IF NOT EXISTS question_exposures (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  state exposure_state NOT NULL DEFAULT 'SEEN',
  seen_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_was_correct BOOLEAN,
  UNIQUE(student_id, question_id)
);

CREATE TABLE IF NOT EXISTS mastery_evidence (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES questions(id),
  evidence_type evidence_type NOT NULL,
  score DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 1),
  difficulty DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  timed BOOLEAN NOT NULL DEFAULT false,
  time_taken_seconds INTEGER,
  expected_time_seconds INTEGER,
  context_type context_type NOT NULL DEFAULT 'LABELED',
  novelty_level novelty_level NOT NULL DEFAULT 'FAMILIAR',
  question_exposure_state exposure_state,
  source TEXT NOT NULL,
  verification_attempt_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_student_skill ON mastery_evidence(student_id, skill_id, created_at);

CREATE TABLE IF NOT EXISTS mastery_state (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  state mastery_state_enum NOT NULL DEFAULT 'UNKNOWN',
  confidence confidence_level NOT NULL DEFAULT 'LOW',
  concept_score DOUBLE PRECISION,
  execution_score DOUBLE PRECISION,
  transfer_score DOUBLE PRECISION,
  retention_score DOUBLE PRECISION,
  timed_score DOUBLE PRECISION,
  consistency_score DOUBLE PRECISION,
  verified_snapshot JSONB,
  last_verified_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  mastery_model_version TEXT NOT NULL DEFAULT 'v1.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_mastery_state_review ON mastery_state(next_review_at);

CREATE TABLE IF NOT EXISTS verification_attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  objective verification_objective NOT NULL,
  status attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
  result attempt_result,
  question_plan JSONB NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  evidence_summary JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_attempts_student_skill ON verification_attempts(student_id, skill_id, started_at);

CREATE TABLE IF NOT EXISTS review_schedule (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  priority_score DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, skill_id)
);

CREATE TABLE IF NOT EXISTS mastery_history_events (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_student_skill ON mastery_history_events(student_id, skill_id, created_at);

-- Durable outbox for Feature 3/4/6/7 signals (see services/integration).
-- Not student-facing directly, so no RLS - only the service layer and
-- internal/admin routes touch this table.
CREATE TABLE IF NOT EXISTS signal_outbox (
  id TEXT PRIMARY KEY,
  target_feature TEXT NOT NULL,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  signal TEXT NOT NULL,
  severity TEXT,
  confidence DOUBLE PRECISION,
  payload JSONB NOT NULL,
  delivered_at TIMESTAMPTZ,
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signal_outbox_undelivered ON signal_outbox(delivered_at) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS system_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  student_id TEXT,
  skill_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type, created_at);

-- ---------- Row-Level Security: per-student isolation ----------
-- aceapt_service (table owner) has BYPASSRLS and ignores all of this by
-- design. aceapt_app is forced through it even though it will typically
-- also be the table's grantee, not owner, so FORCE is technically
-- redundant for a non-owner grantee - kept anyway so this remains safe
-- if ownership is ever changed.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'question_exposures','mastery_evidence','mastery_state',
    'verification_attempts','review_schedule','mastery_history_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS student_isolation ON %I;', t);
    EXECUTE format(
      'CREATE POLICY student_isolation ON %I
         USING (student_id = NULLIF(current_setting(''app.current_student_id'', true), ''''))
         WITH CHECK (student_id = NULLIF(current_setting(''app.current_student_id'', true), ''''));',
      t
    );
  END LOOP;
END $$;

-- ---------- Grants for the RLS-bound app role ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aceapt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aceapt_app;
