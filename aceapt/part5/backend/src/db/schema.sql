-- ACEAPT Feature 5 schema.
-- SQLite chosen only because no existing project database was provided to
-- adapt to (see README "Assumptions"). Every table is accessed exclusively
-- through repositories/*.ts, so swapping engines later means rewriting
-- those files, not the engines/services above them.

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  name TEXT NOT NULL,
  prerequisites TEXT NOT NULL DEFAULT '[]' -- JSON string[]
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  difficulty_level INTEGER NOT NULL,
  quality_status TEXT NOT NULL,
  source TEXT NOT NULL,
  template_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL, -- full Question JSON (source of truth for content)
  FOREIGN KEY (skill_id) REFERENCES skills(id)
);
CREATE INDEX IF NOT EXISTS idx_questions_skill ON questions(skill_id);
CREATE INDEX IF NOT EXISTS idx_questions_quality ON questions(quality_status);

CREATE TABLE IF NOT EXISTS question_exposure (
  student_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  PRIMARY KEY (student_id, question_id)
);

CREATE TABLE IF NOT EXISTS skill_practice_state (
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  last_practiced TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  recent_accuracy REAL NOT NULL DEFAULT 0,
  average_time_seconds REAL NOT NULL DEFAULT 0,
  confidence_calibration TEXT NOT NULL DEFAULT 'UNKNOWN',
  error_distribution TEXT NOT NULL DEFAULT '{}', -- JSON
  difficulty_exposure TEXT NOT NULL DEFAULT '{}', -- JSON
  hint_usage_rate REAL NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  mastery_state TEXT NOT NULL DEFAULT 'NOT_STARTED',
  next_review TEXT,
  current_difficulty INTEGER NOT NULL DEFAULT 1,
  suspected_memorization INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, skill_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  objective TEXT NOT NULL,
  objective_reason TEXT NOT NULL,
  skill_focus TEXT NOT NULL, -- JSON string[]
  plan TEXT NOT NULL, -- JSON SessionPlanItem[]
  plan_index INTEGER NOT NULL DEFAULT 0,
  questions_served TEXT NOT NULL DEFAULT '[]',
  attempts TEXT NOT NULL DEFAULT '[]',
  current_difficulty INTEGER NOT NULL,
  current_focus_dimension TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  adaptation_log TEXT NOT NULL DEFAULT '[]',
  verification_stage INTEGER,
  current_question_served_at TEXT,
  current_question_hints_used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_student ON sessions(student_id, status);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  selected_option_id TEXT,
  is_correct INTEGER NOT NULL,
  time_to_start_ms INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,
  expected_time_ms INTEGER NOT NULL,
  relative_speed TEXT NOT NULL,
  hints_used INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER,
  error_category TEXT,
  performance_interpretation TEXT,
  difficulty_at_attempt TEXT NOT NULL, -- JSON DifficultyProfile
  question_index_in_session INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_student_skill ON attempts(student_id, skill_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id);

CREATE TABLE IF NOT EXISTS mastery_evidence (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  detail TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mastery_student_skill ON mastery_evidence(student_id, skill_id);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  student_id TEXT,
  payload TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(type, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
