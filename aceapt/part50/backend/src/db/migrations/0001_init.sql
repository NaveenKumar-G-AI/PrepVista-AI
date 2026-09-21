-- Feature 50: Speed Training Engine - initial schema (spec section 82-85).
-- student_id / question_id / goal_id are left as plain uuid columns (no FK)
-- since the core ACEAPT tables (students, questions, goals) live outside
-- this module. Uncomment the REFERENCES clauses once merged into the real DB.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS speed_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL, -- REFERENCES students(id)
  mode               varchar(32) NOT NULL,
  pressure_level     varchar(32) NOT NULL DEFAULT 'SOFT_TIMER',
  state              varchar(24) NOT NULL DEFAULT 'READY',
  scope_type         varchar(24) NOT NULL,
  scope_id           varchar(128) NOT NULL,
  target_time_ms     integer,
  guardrail_accuracy real NOT NULL DEFAULT 0.85,
  goal_id            uuid, -- REFERENCES goals(id)
  started_at         timestamptz DEFAULT now(),
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS speed_sessions_student_idx ON speed_sessions (student_id);

CREATE TABLE IF NOT EXISTS speed_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES speed_sessions(id),
  student_id            uuid NOT NULL, -- REFERENCES students(id)
  question_id           uuid NOT NULL, -- REFERENCES questions(id)
  skill_id              varchar(128) NOT NULL,
  subskill_id           varchar(128),
  domain                varchar(128),
  topic                 varchar(128),
  difficulty            varchar(16) NOT NULL,
  question_type         varchar(48),
  response_time_ms      integer NOT NULL,
  correct               boolean NOT NULL,
  independent           boolean NOT NULL DEFAULT true,
  hint_level            integer NOT NULL DEFAULT 0,
  novelty_level         varchar(16),
  stage_reading_ms      integer,
  stage_strategy_ms     integer,
  stage_calculation_ms  integer,
  stage_verification_ms integer,
  decision              varchar(16),
  retry_count           integer,
  idle_ms               integer,
  confidence_rating     integer,
  expected_time_ms      integer,
  expected_time_source  varchar(24),
  relative_speed        real,
  performance_state     varchar(24),
  client_attempt_id     varchar(128) NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT speed_attempts_session_client_idx UNIQUE (session_id, client_attempt_id)
);

CREATE INDEX IF NOT EXISTS speed_attempts_student_skill_idx ON speed_attempts (student_id, skill_id, difficulty);

CREATE TABLE IF NOT EXISTS speed_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid NOT NULL,
  scope_type           varchar(24) NOT NULL,
  scope_id             varchar(128) NOT NULL,
  average_time_ms      integer NOT NULL,
  median_time_ms       integer NOT NULL,
  accuracy             real NOT NULL,
  expected_time_ms     integer,
  expected_time_source varchar(24),
  relative_speed       real,
  sample_size          integer NOT NULL,
  confidence           varchar(12) NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT speed_profiles_student_scope_idx UNIQUE (student_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS speed_bottlenecks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL,
  scope_type   varchar(24) NOT NULL,
  scope_id     varchar(128),
  type         varchar(24) NOT NULL,
  evidence     text NOT NULL,
  metrics      jsonb,
  confidence   varchar(12) NOT NULL,
  status       varchar(16) NOT NULL DEFAULT 'ACTIVE',
  detected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS speed_bottlenecks_student_idx ON speed_bottlenecks (student_id, status);

CREATE TABLE IF NOT EXISTS speed_targets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL,
  scope_type          varchar(24) NOT NULL,
  scope_id            varchar(128) NOT NULL,
  current_target_ms   integer NOT NULL,
  baseline_ms         integer NOT NULL,
  guardrail_accuracy  real NOT NULL,
  last_ramped_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT speed_targets_student_scope_idx UNIQUE (student_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS pacing_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL,
  speed_session_id    uuid REFERENCES speed_sessions(id),
  mode                varchar(24) NOT NULL,
  total_questions     integer NOT NULL,
  time_budget_ms      integer NOT NULL,
  time_elapsed_ms     integer NOT NULL DEFAULT 0,
  questions_completed integer NOT NULL DEFAULT 0,
  correct_count       integer NOT NULL DEFAULT 0,
  state               varchar(24) NOT NULL DEFAULT 'READY',
  started_at          timestamptz DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS pacing_sessions_student_idx ON pacing_sessions (student_id);
