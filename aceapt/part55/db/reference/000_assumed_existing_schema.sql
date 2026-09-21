-- =============================================================================
-- REFERENCE ONLY — NOT PART OF THE FEATURE 55 MIGRATION SET.
--
-- Feature 55 reads from Questions, Question Versions, Attempts, Students —
-- these already exist in the real ACEAPT codebase (owned by earlier features).
-- Per the build brief ("inspect the real repository, reuse, do not duplicate"),
-- this file is a minimal stand-in shape so this reference implementation can
-- run and be tested standalone against a fresh database.
--
-- DO NOT run this against the real ACEAPT database. When integrating:
--   1. Delete this file.
--   2. Point src/config/schema-mapping.ts at the real table/column names.
--   3. If real column names differ, update the SQL in
--      src/services/calibration-eligibility.service.ts and
--      src/services/expected-time.service.ts accordingly (they are the only
--      two files that read these tables directly).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  parent_skill_id UUID REFERENCES skills(id)
);

CREATE TABLE IF NOT EXISTS question_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL
);

DO $$ BEGIN
  CREATE TYPE question_purpose AS ENUM
    ('LEARNING','PRACTICE','DIAGNOSTIC','TRANSFER','MASTERY','TIMED','ASSESSMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE answer_type AS ENUM
    ('NUMERIC','SINGLE_SELECT','MULTI_SELECT','FREE_TEXT','ORDERING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  skill_id UUID REFERENCES skills(id),
  family_id UUID REFERENCES question_families(id),
  purpose question_purpose NOT NULL DEFAULT 'PRACTICE',
  answer_type answer_type NOT NULL DEFAULT 'SINGLE_SELECT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stand-ins for Feature 53 (quality) / Feature 54 (validation) verdicts.
-- In the real codebase these live on (or are derived from) their own tables;
-- Feature 55 only ever reads them through the adapters in src/integrations/.
CREATE TABLE IF NOT EXISTS question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  version_number INT NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  reading_length INT,
  number_of_steps INT,
  number_of_variables INT,
  number_of_constraints INT,
  concept_dependencies INT,
  content_preview TEXT,                      -- question stem text, truncated; used only for the optional AI initial estimate
  initial_difficulty_label TEXT,             -- author's Easy/Medium/Hard, if any
  is_valid BOOLEAN NOT NULL DEFAULT true,     -- Feature 54 stand-in
  quality_status TEXT NOT NULL DEFAULT 'OK',  -- Feature 53 stand-in: OK | UNRESOLVED | POOR
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE attempt_mode AS ENUM ('UNTIMED','TIMED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  is_test_account BOOLEAN NOT NULL DEFAULT false
);

-- Minimal attempt shape covering the conditioning dimensions Feature 55 needs:
-- mode (timed/untimed), hints_used (assistance), exposure_number + is_novel
-- (Feature 49 stand-in), session_position_pct (fatigue), and
-- respondent_ability_proxy (a crude 0..1 proxy for the discrimination-lite
-- calculation — in the real system this would come from Feature 45/mastery,
-- never computed by Feature 55 itself).
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  student_id UUID NOT NULL REFERENCES students(id),
  question_version_id UUID NOT NULL REFERENCES question_versions(id),
  session_id UUID,
  is_correct BOOLEAN,
  response_time_ms INT,
  mode attempt_mode NOT NULL DEFAULT 'UNTIMED',
  hints_used INT NOT NULL DEFAULT 0,
  exposure_number INT NOT NULL DEFAULT 1,
  is_novel BOOLEAN NOT NULL DEFAULT true,
  session_position_pct NUMERIC,
  respondent_ability_proxy NUMERIC,
  completed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_qv ON attempts(question_version_id);
CREATE INDEX IF NOT EXISTS idx_attempts_tenant ON attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);
