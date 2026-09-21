-- ============================================================
-- ACEAPT Feature 36 — Career Execution Intelligence
-- Data model. IDs are app-generated UUIDs (TEXT). Every table
-- that stores student data carries user_id for isolation, and
-- every query in the repository layer filters by it server-side
-- (never trust a client-supplied id — see lib/auth.ts).
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  institution_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS career_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON career_goals(user_id);

CREATE TABLE IF NOT EXISTS capability_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES career_goals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_current_bottleneck INTEGER NOT NULL DEFAULT 0,
  trend TEXT NOT NULL DEFAULT 'UNKNOWN',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  last_evidence_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_capabilities_user ON capability_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_goal ON capability_areas(goal_id);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES career_goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones(goal_id);

CREATE TABLE IF NOT EXISTS weekly_objectives (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  week_start TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_objectives_milestone ON weekly_objectives(milestone_id);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  organization TEXT,
  event_date TEXT,
  opportunity_type TEXT NOT NULL DEFAULT 'INTERVIEW',
  status TEXT NOT NULL DEFAULT 'UPCOMING',
  required_capabilities TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_opportunities_user ON opportunities(user_id);

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  commitment_type TEXT NOT NULL DEFAULT 'ACADEMIC',
  event_date TEXT NOT NULL,
  load_level TEXT NOT NULL DEFAULT 'HIGH',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_commitments_user ON commitments(user_id);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES career_goals(id) ON DELETE CASCADE,
  weekly_objective_id TEXT REFERENCES weekly_objectives(id) ON DELETE SET NULL,
  capability_area_id TEXT REFERENCES capability_areas(id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  parent_action_id TEXT REFERENCES action_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT NOT NULL DEFAULT 'PRACTICE',
  difficulty_level TEXT NOT NULL DEFAULT 'BASIC',
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  is_primary INTEGER NOT NULL DEFAULT 0,
  priority_rank INTEGER,
  rationale_text TEXT,
  rationale_bullets TEXT NOT NULL DEFAULT '[]',
  rationale_generated_by TEXT,
  defer_count INTEGER NOT NULL DEFAULT 0,
  last_defer_reason TEXT,
  blocked_reason TEXT,
  prerequisite_satisfied INTEGER NOT NULL DEFAULT 1,
  recommended_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_actions_user ON action_items(user_id);
CREATE INDEX IF NOT EXISTS idx_actions_user_status ON action_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_goal ON action_items(goal_id);
CREATE INDEX IF NOT EXISTS idx_actions_capability ON action_items(capability_area_id);
CREATE INDEX IF NOT EXISTS idx_actions_parent ON action_items(parent_action_id);

CREATE TABLE IF NOT EXISTS execution_sessions (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planned_minutes INTEGER NOT NULL,
  actual_minutes INTEGER,
  phases TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON execution_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_action ON execution_sessions(action_id);

CREATE TABLE IF NOT EXISTS action_evidence (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evidence_quality TEXT NOT NULL DEFAULT 'SELF_REPORTED',
  result_summary TEXT,
  score_value REAL,
  score_label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evidence_user ON action_evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_action ON action_evidence(action_id);

CREATE TABLE IF NOT EXISTS action_outcomes (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  impact TEXT NOT NULL DEFAULT 'INSUFFICIENT_DATA',
  next_recommendation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_outcomes_user ON action_outcomes(user_id);

CREATE TABLE IF NOT EXISTS time_availability (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  available_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, week_start)
);

CREATE TABLE IF NOT EXISTS execution_blockers (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  reason_note TEXT,
  resolution_action_id TEXT REFERENCES action_items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blockers_user ON execution_blockers(user_id);

CREATE TABLE IF NOT EXISTS plan_adjustments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id TEXT REFERENCES career_goals(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_adjustments_user ON plan_adjustments(user_id);

CREATE TABLE IF NOT EXISTS execution_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_user ON execution_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_user_type ON execution_events(user_id, event_type);

CREATE TABLE IF NOT EXISTS weekly_review_cache (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  narrative_text TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS execution_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_session_minutes INTEGER,
  confidence TEXT NOT NULL DEFAULT 'LIMITED_DATA',
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
