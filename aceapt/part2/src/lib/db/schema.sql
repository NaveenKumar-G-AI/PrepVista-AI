-- ACEAPT Feature 2 schema.
--
-- Deliberately normalized where correctness matters (responses, questions,
-- sessions) and NOT duplicated into mutable "current state" tables where
-- that state can instead be derived on demand from the event log below.
-- See lib/domain/capabilityState.ts for why: a session's live evidence
-- state, coverage, and pending follow-ups are all computed fresh from
-- `responses` + `question_presentations` + `questions` rather than stored
-- and kept in sync by hand. Fewer places for state to drift out of sync,
-- at the cost of recomputing a cheap aggregate per request — a good trade
-- at this scale.

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_contexts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  version INTEGER NOT NULL DEFAULT 1,
  preparation_goal TEXT NOT NULL,
  target_date TEXT,
  timeline_category TEXT NOT NULL,
  days_available INTEGER,
  experience_level TEXT NOT NULL,
  previous_preparation TEXT,
  confidence_quantitative TEXT NOT NULL,
  confidence_logical TEXT NOT NULL,
  confidence_verbal TEXT NOT NULL,
  confidence_time_pressure TEXT NOT NULL,
  primary_pain_point TEXT NOT NULL,
  secondary_pain_points TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_nodes (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  subtopic TEXT,
  concept TEXT,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  prerequisite_skill_id TEXT REFERENCES skill_nodes(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  skill_node_id TEXT NOT NULL REFERENCES skill_nodes(id),
  application_type TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'MCQ',
  question_text TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  expected_reasoning TEXT,
  common_error_types TEXT NOT NULL DEFAULT '[]',
  skill_tags TEXT NOT NULL DEFAULT '[]',
  estimated_time_seconds INTEGER NOT NULL DEFAULT 60,
  validation_status TEXT NOT NULL DEFAULT 'PENDING',
  validation_notes TEXT,
  source_type TEXT NOT NULL DEFAULT 'HUMAN_AUTHORED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  onboarding_context_id TEXT NOT NULL REFERENCES onboarding_contexts(id),
  onboarding_context_version INTEGER NOT NULL,
  diagnostic_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  started_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  stop_reason TEXT
);

CREATE TABLE IF NOT EXISTS question_presentations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES diagnostic_sessions(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  purpose TEXT NOT NULL,
  rationale TEXT NOT NULL,
  sequence_index INTEGER NOT NULL,
  capture_confidence INTEGER NOT NULL DEFAULT 0,
  presented_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES diagnostic_sessions(id),
  presentation_id TEXT NOT NULL UNIQUE REFERENCES question_presentations(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  status TEXT NOT NULL, -- ANSWERED | SKIPPED | TIMED_OUT | DONT_KNOW
  student_answer TEXT,
  is_correct INTEGER, -- nullable: 0/1, only meaningful when status = ANSWERED
  confidence_level TEXT,
  question_started_at TEXT NOT NULL,
  question_answered_at TEXT NOT NULL,
  response_duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostic_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES diagnostic_sessions(id),
  result_json TEXT NOT NULL,
  ai_generation_status TEXT NOT NULL DEFAULT 'NOT_ATTEMPTED',
  diagnostic_version INTEGER NOT NULL,
  scoring_version INTEGER NOT NULL,
  algorithm_version INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  student_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presentations_session ON question_presentations(session_id);
CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_skill ON questions(skill_node_id);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON diagnostic_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events(session_id);
