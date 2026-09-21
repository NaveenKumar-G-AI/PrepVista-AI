-- Reference schema for a production-grade SocraticRepository (section 87 of
-- the spec). The shipped code uses a dependency-free file-backed
-- implementation (src/repositories/socraticRepository.ts) so the project
-- runs with zero setup; this file documents the relational shape to migrate
-- to once you have a real database, and the entity names below are exactly
-- what SocraticRepository's methods expect to read and write.
--
-- Written for Postgres. Adjust types for your actual engine.

CREATE TABLE socratic_session (
  id                    UUID PRIMARY KEY,
  student_id            TEXT NOT NULL,
  objective             JSONB NOT NULL,      -- LearningObjectiveContract
  state                 TEXT NOT NULL,       -- TeachingState
  thinking_state        JSONB NOT NULL,      -- StudentThinkingState
  problem_context       JSONB NOT NULL,      -- ProblemContext (never expose trustedAnswer while status='active')
  misconception_state   JSONB,               -- MisconceptionExperimentState | null
  status                TEXT NOT NULL,       -- active | completed | escalated | abandoned
  version               INTEGER NOT NULL DEFAULT 1,  -- optimistic concurrency (section 89)
  completion_summary    JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_socratic_session_student ON socratic_session (student_id);

CREATE TABLE socratic_turn (
  id                      UUID PRIMARY KEY,
  session_id              UUID NOT NULL REFERENCES socratic_session (id) ON DELETE CASCADE,
  sequence                INTEGER NOT NULL,
  speaker                 TEXT NOT NULL,     -- tutor | student
  content                 TEXT NOT NULL,
  intent                  TEXT,
  target_skill            TEXT,
  target_step             TEXT,
  help_level              SMALLINT,
  response_classification TEXT,
  why_this_question       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence)              -- guards against duplicate/concurrent submissions (section 89/111)
);

CREATE INDEX idx_socratic_turn_session ON socratic_turn (session_id, sequence);

CREATE TABLE socratic_learning_signal (
  id          UUID PRIMARY KEY,
  student_id  TEXT NOT NULL,
  session_id  UUID NOT NULL REFERENCES socratic_session (id) ON DELETE CASCADE,
  skill       TEXT NOT NULL,
  signal      TEXT NOT NULL,     -- e.g. 'misconception_detected:percentage_increase_decrease_cancel'
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_socratic_signal_student_skill ON socratic_learning_signal (student_id, skill);
