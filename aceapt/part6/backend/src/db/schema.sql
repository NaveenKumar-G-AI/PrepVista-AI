-- ACEAPT Feature 6 schema.
-- JSON-shaped columns are stored as TEXT (SQLite has no native JSON type) and
-- (de)serialized in db/db.ts / repositories. Booleans are stored as 0/1.

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  topic TEXT NOT NULL,
  skill TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  prompt TEXT NOT NULL,
  context TEXT,
  options_json TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation TEXT NOT NULL,
  expected_time_seconds INTEGER NOT NULL,
  health TEXT NOT NULL DEFAULT 'HEALTHY',
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_topic_diff ON questions(topic, difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_health ON questions(health);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  type TEXT NOT NULL,
  blueprint_id TEXT NOT NULL,
  status TEXT NOT NULL,
  question_ids_json TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  started_at TEXT,
  ends_at TEXT,
  submitted_at TEXT,
  current_question_id TEXT,
  form_label TEXT NOT NULL DEFAULT 'FORM_A',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessments_student ON assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);

CREATE TABLE IF NOT EXISTS attempts (
  assessment_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  first_viewed_at TEXT,
  first_answered_at TEXT,
  first_answer TEXT,
  final_answer TEXT,
  answer_change_count INTEGER NOT NULL DEFAULT 0,
  correct INTEGER, -- 0/1/NULL(unscored)
  time_spent_ms INTEGER NOT NULL DEFAULT 0,
  current_interval_started_at TEXT, -- internal: open viewing interval, closed on navigate/submit
  skipped INTEGER NOT NULL DEFAULT 0,
  revisited INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  navigation_log_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS question_exposure (
  student_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  statuses_json TEXT NOT NULL DEFAULT '[]',
  times_seen INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  times_incorrect INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  PRIMARY KEY (student_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_exposure_student ON question_exposure(student_id);

CREATE TABLE IF NOT EXISTS assessment_results (
  assessment_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  overall_readiness_score REAL NOT NULL,
  readiness_state TEXT NOT NULL,
  scored_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_student ON assessment_results(student_id);

-- One row per scored assessment; feeds the Consistency Engine (section 29) and
-- readiness-confidence evidence counting (section 32) without re-parsing every
-- result_json blob on every request.
CREATE TABLE IF NOT EXISTS readiness_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  assessment_type TEXT NOT NULL,
  overall_score REAL NOT NULL,
  accuracy_pct REAL NOT NULL,
  state TEXT NOT NULL,
  model_version TEXT NOT NULL,
  topics_covered_json TEXT NOT NULL,
  computed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readiness_history_student ON readiness_history(student_id, computed_at);

-- Feature 5 adapter persistence (mock target system - see adapters/feature5Adapter.ts)
CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  source_assessment_id TEXT NOT NULL,
  recommendation_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  simulated_result_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_practice_student ON practice_sessions(student_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_student_id TEXT,
  action TEXT NOT NULL,
  details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
