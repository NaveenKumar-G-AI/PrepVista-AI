-- ACEAPT AI — Feature 13: Continuous Readiness & Exam-Condition Performance Engine
-- Migration 0001: core schema
--
-- Design notes (read this before wiring into the real PrepVista/ACEAPT DB):
--
-- * `students` below is a STUB. In production this feature reads/writes against
--   your existing student table. Drop this table and repoint every `student_id`
--   foreign key at your real one — the rest of the schema does not care where
--   student identity comes from.
-- * `topics` / `questions` are a minimal reference question bank so the
--   simulator has real content to assemble. If ACEAPT already has a question
--   bank, extend that one instead of this one (see README "Integration Guide").
-- * IDs are application-generated UUID v4 (see src/db/ids.ts), not
--   `gen_random_uuid()`, so the schema has no extension dependency.
-- * Enums are modeled as TEXT + CHECK rather than native Postgres ENUM types
--   — easier to extend later without ALTER TYPE migrations.
-- * Row Level Security: every student-scoped table carries a denormalized
--   `student_id` (even where it is reachable via a join) so RLS policies are
--   a single equality check, not a correlated subquery, on every row. This is
--   deliberate for query performance under RLS (see Section 47 "Performance"
--   in the brief) at the cost of a bit of write-side duplication, which the
--   repository layer (src/db/repository.ts) is responsible for keeping
--   consistent — it is the only code allowed to write these tables.

-- ---------------------------------------------------------------------------
-- Session helpers used by RLS policies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_student_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_student_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_service_context() RETURNS boolean AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_service_role', true), ''), 'false')::boolean
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------
-- Reference / stub identity
-- ---------------------------------------------------------------------------

CREATE TABLE students (
  id                UUID PRIMARY KEY,
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  institution_id    UUID,
  target_score      NUMERIC,
  target_assessment TEXT,
  target_date       DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Question bank (minimal reference implementation — see note above)
-- ---------------------------------------------------------------------------

CREATE TABLE topics (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL
);

CREATE TABLE questions (
  id                     UUID PRIMARY KEY,
  topic_id               UUID NOT NULL REFERENCES topics(id),
  skill                  TEXT NOT NULL,
  difficulty             TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question_type          TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq')),
  prompt                 TEXT NOT NULL,
  options                JSONB NOT NULL,
  correct_option_id      TEXT NOT NULL,
  explanation            TEXT,
  expected_time_seconds  INT NOT NULL DEFAULT 60,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_topic_difficulty ON questions(topic_id, difficulty) WHERE is_active;

-- ---------------------------------------------------------------------------
-- Assessment profiles + blueprints (Sections 5-6)
-- ---------------------------------------------------------------------------

CREATE TABLE assessment_profiles (
  id                             UUID PRIMARY KEY,
  name                           TEXT NOT NULL,
  assessment_type                TEXT NOT NULL,
  duration_minutes               INT NOT NULL,
  question_count                 INT NOT NULL,
  sections                       JSONB NOT NULL,        -- [{name, topic_ids[], question_count}]
  difficulty_distribution        JSONB NOT NULL,        -- {easy, medium, hard} fractions summing ~1
  negative_marking               JSONB NOT NULL,        -- {enabled, penalty_fraction}
  scoring_rules                  JSONB NOT NULL,        -- {correct_marks, unanswered_marks}
  target_score                   NUMERIC,
  question_time_expectation_seconds INT NOT NULL DEFAULT 60,
  is_active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assessment_blueprints (
  id           UUID PRIMARY KEY,
  profile_id   UUID NOT NULL REFERENCES assessment_profiles(id),
  composition  JSONB NOT NULL,   -- [{topic_id, skill, difficulty, question_type, expected_time_seconds, weight, section}]
  validation   JSONB NOT NULL,   -- {question_count_ok, topic_coverage_ok, difficulty_distribution_ok, timing_ok, novelty_ok, issues[]}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Simulations (Sections 4, 43)
-- ---------------------------------------------------------------------------

CREATE TABLE simulations (
  id             UUID PRIMARY KEY,
  student_id     UUID NOT NULL REFERENCES students(id),
  profile_id     UUID NOT NULL REFERENCES assessment_profiles(id),
  blueprint_id   UUID NOT NULL REFERENCES assessment_blueprints(id),
  practice_mode  TEXT NOT NULL CHECK (practice_mode IN ('topic_practice', 'timed_practice', 'mixed_practice', 'realistic_simulation')),
  status         TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'submitted', 'abandoned')),
  started_at     TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ,
  duration_minutes INT NOT NULL,
  total_score    NUMERIC,
  max_score      NUMERIC,
  accuracy       NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_simulations_student ON simulations(student_id, created_at DESC);

CREATE TABLE simulation_questions (
  id                     UUID PRIMARY KEY,
  simulation_id          UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  student_id             UUID NOT NULL REFERENCES students(id),
  question_id            UUID NOT NULL REFERENCES questions(id),
  section                TEXT NOT NULL,
  sequence_order         INT NOT NULL,
  expected_time_seconds  INT NOT NULL,
  weight                 NUMERIC NOT NULL DEFAULT 1,
  UNIQUE (simulation_id, sequence_order)
);

CREATE INDEX idx_sim_questions_sim ON simulation_questions(simulation_id, sequence_order);

-- Raw, append-only event log (Section 43)
CREATE TABLE simulation_question_events (
  id               UUID PRIMARY KEY,
  simulation_id    UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id),
  question_id      UUID REFERENCES questions(id),
  event_type       TEXT NOT NULL CHECK (event_type IN (
                     'ASSESSMENT_STARTED', 'QUESTION_VIEWED', 'QUESTION_ANSWERED',
                     'QUESTION_SKIPPED', 'QUESTION_REVISITED', 'QUESTION_SUBMITTED',
                     'ASSESSMENT_SECTION_CHANGED', 'ASSESSMENT_SUBMITTED', 'ASSESSMENT_ABANDONED'
                   )),
  event_timestamp  TIMESTAMPTZ NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_sim ON simulation_question_events(simulation_id, event_timestamp);

-- Derived per-question outcome, rebuilt from the event log at submit time
-- (Section 44: never trust a single event; this is the reconciled view).
CREATE TABLE simulation_attempts (
  id                   UUID PRIMARY KEY,
  simulation_id        UUID NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES students(id),
  question_id          UUID NOT NULL REFERENCES questions(id),
  topic_id             UUID NOT NULL REFERENCES topics(id),
  difficulty           TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  section              TEXT NOT NULL,
  sequence_position     INT NOT NULL,
  selected_option_id   TEXT,
  is_correct           BOOLEAN,
  time_spent_seconds   INT NOT NULL DEFAULT 0,
  first_viewed_at      TIMESTAMPTZ,
  answered_at          TIMESTAMPTZ,
  skip_count           INT NOT NULL DEFAULT 0,
  revisit_count        INT NOT NULL DEFAULT 0,
  final_status         TEXT NOT NULL CHECK (final_status IN ('answered', 'skipped', 'unanswered', 'flagged')),
  UNIQUE (simulation_id, question_id)
);

CREATE INDEX idx_attempts_sim ON simulation_attempts(simulation_id, sequence_position);
CREATE INDEX idx_attempts_student_topic ON simulation_attempts(student_id, topic_id);

-- ---------------------------------------------------------------------------
-- Readiness (Sections 1-3, 17-24)
-- ---------------------------------------------------------------------------

CREATE TABLE readiness_snapshots (
  id                   UUID PRIMARY KEY,
  student_id           UUID NOT NULL REFERENCES students(id),
  profile_id           UUID REFERENCES assessment_profiles(id), -- NULL = cross-profile overall snapshot
  previous_snapshot_id UUID REFERENCES readiness_snapshots(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_score        NUMERIC NOT NULL,
  overall_state        TEXT NOT NULL CHECK (overall_state IN (
                          'INSUFFICIENT_EVIDENCE', 'EARLY_EVIDENCE', 'DEVELOPING',
                          'NEAR_READY', 'CONDITIONALLY_READY', 'STRONGLY_READY'
                        )),
  confidence_level     TEXT NOT NULL CHECK (confidence_level IN ('LOW', 'MEDIUM', 'HIGH')),
  confidence_score     NUMERIC NOT NULL,
  evidence_count       INT NOT NULL,
  simulation_ids       JSONB NOT NULL DEFAULT '[]'::jsonb,
  dimension_scores     JSONB NOT NULL,  -- denormalized copy of readiness_dimension_scores for this snapshot
  gap_map              JSONB NOT NULL,  -- denormalized copy of readiness_gaps for this snapshot
  contributors         JSONB NOT NULL DEFAULT '[]'::jsonb -- [{dimension_key, delta, direction}] vs previous_snapshot_id
);

CREATE INDEX idx_readiness_snapshots_student ON readiness_snapshots(student_id, created_at DESC);

CREATE TABLE readiness_dimension_scores (
  id               UUID PRIMARY KEY,
  snapshot_id      UUID NOT NULL REFERENCES readiness_snapshots(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id),
  dimension_key    TEXT NOT NULL CHECK (dimension_key IN (
                      'concept', 'accuracy', 'speed', 'time_pressure', 'mixed_topic',
                      'novel_question', 'retention', 'consistency', 'assessment_condition',
                      'recovery', 'question_selection', 'time_allocation'
                    )),
  score            NUMERIC NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('READY', 'DEVELOPING', 'HIGH_RISK')),
  confidence       TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  evidence_summary TEXT NOT NULL,
  UNIQUE (snapshot_id, dimension_key)
);

CREATE INDEX idx_dim_scores_snapshot ON readiness_dimension_scores(snapshot_id);

CREATE TABLE readiness_gaps (
  id             UUID PRIMARY KEY,
  snapshot_id    UUID NOT NULL REFERENCES readiness_snapshots(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES students(id),
  dimension_key  TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('DEVELOPING', 'HIGH_RISK')),
  description    TEXT NOT NULL,
  evidence_ids   JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_gaps_snapshot ON readiness_gaps(snapshot_id);

CREATE TABLE readiness_evidence (
  id               UUID PRIMARY KEY,
  snapshot_id      UUID NOT NULL REFERENCES readiness_snapshots(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id),
  dimension_key    TEXT, -- nullable: some evidence supports the overall claim, not one dimension
  claim            TEXT NOT NULL,
  observation      TEXT NOT NULL,
  sample_size      INT NOT NULL,
  time_window      TEXT NOT NULL,
  confidence       TEXT NOT NULL CHECK (confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  supporting_data  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_evidence_snapshot ON readiness_evidence(snapshot_id);

-- ---------------------------------------------------------------------------
-- Feature 12 integration ledger (Section 26) — records what was recommended
-- and whether the follow-up resimulation showed the gap closing. Feature 12
-- itself is out of scope here; see src/integration/feature12Client.ts.
-- ---------------------------------------------------------------------------

CREATE TABLE interventions (
  id                     UUID PRIMARY KEY,
  student_id             UUID NOT NULL REFERENCES students(id),
  readiness_snapshot_id  UUID NOT NULL REFERENCES readiness_snapshots(id),
  gap_dimension_key      TEXT NOT NULL,
  intervention_type      TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'recommended' CHECK (status IN ('recommended', 'in_progress', 'completed')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ,
  resulting_simulation_id UUID REFERENCES simulations(id)
);

CREATE INDEX idx_interventions_student ON interventions(student_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Application role + Row Level Security
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aceapt_app') THEN
    -- Dev-only password, not a secret — matches .env.example's DATABASE_URL
    -- for this throwaway local DB. Rotate it (ALTER ROLE ... PASSWORD) for
    -- any real environment.
    CREATE ROLE aceapt_app LOGIN PASSWORD 'dev_only_local_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO aceapt_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO aceapt_app;
GRANT SELECT ON topics, questions, assessment_profiles, assessment_blueprints TO aceapt_app;

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_question_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_dimension_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY students_isolation ON students
  USING (is_service_context() OR id = current_student_id())
  WITH CHECK (is_service_context() OR id = current_student_id());

CREATE POLICY simulations_isolation ON simulations
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY simulation_questions_isolation ON simulation_questions
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY simulation_events_isolation ON simulation_question_events
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY simulation_attempts_isolation ON simulation_attempts
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY readiness_snapshots_isolation ON readiness_snapshots
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY readiness_dimensions_isolation ON readiness_dimension_scores
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY readiness_gaps_isolation ON readiness_gaps
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY readiness_evidence_isolation ON readiness_evidence
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());

CREATE POLICY interventions_isolation ON interventions
  USING (is_service_context() OR student_id = current_student_id())
  WITH CHECK (is_service_context() OR student_id = current_student_id());
