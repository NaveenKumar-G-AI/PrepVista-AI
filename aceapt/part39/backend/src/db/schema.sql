-- FEATURE 39 -- Intelligent Opportunity & Application Strategy Engine
-- Core schema. Kept portable (plain SQL types) so it can be re-pointed at
-- Postgres/MySQL later with minor syntax changes -- see README "Swapping the database".

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  target_role TEXT,
  career_direction TEXT,
  education_level TEXT,
  constraints_json TEXT DEFAULT '{}',   -- e.g. {"remote":true,"relocation":false,"min_salary":null,"priorities":["Long-term career","Learning"]}
  created_at TEXT DEFAULT (datetime('now'))
);

-- Stand-in for Feature 37 (evidence/capability validation). Real Feature 37
-- should own this table; this app only reads/writes the columns it needs.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  name TEXT NOT NULL,
  description TEXT,
  skills_json TEXT DEFAULT '[]',
  completeness TEXT DEFAULT 'COMPLETE', -- COMPLETE | PARTIAL
  recency_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  skill TEXT NOT NULL,
  evidence_type TEXT NOT NULL, -- PROJECT | ASSESSMENT | CERTIFICATE | WORK_EXPERIENCE | COURSEWORK | SELF_DECLARED
  strength TEXT NOT NULL,      -- VERIFIED | STRONG | MODERATE | LIMITED | UNSUPPORTED
  description TEXT,
  project_id TEXT REFERENCES projects(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Stand-in for Feature 38 (positioning). Real Feature 38 should own this;
-- see services/positioningService.js for the swap interface.
CREATE TABLE IF NOT EXISTS positioning_profiles (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  role_direction TEXT,
  statement TEXT,
  differentiators_json TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  title TEXT NOT NULL,
  summary TEXT,
  emphasis_tags_json TEXT DEFAULT '[]',
  is_master INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  role TEXT,
  company TEXT,
  industry TEXT,
  location TEXT,
  work_mode TEXT,              -- REMOTE | HYBRID | ONSITE | UNKNOWN
  seniority TEXT,
  source_url TEXT,
  source_type TEXT DEFAULT 'STUDENT_ADDED', -- OFFICIAL_COMPANY_SOURCE | VERIFIED_JOB_SOURCE | EXTERNAL_SOURCE | STUDENT_ADDED | UNKNOWN
  raw_jd_text TEXT,
  posting_date TEXT,
  deadline TEXT,
  compensation_text TEXT,
  status TEXT DEFAULT 'NEW',   -- NEW | SAVED | SHORTLISTED | ARCHIVED
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunity_requirements (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  requirement_text TEXT NOT NULL,
  category TEXT,   -- MUST_HAVE | PREFERRED | NICE_TO_HAVE
  priority TEXT,    -- CRITICAL | IMPORTANT | SUPPORTING | OPTIONAL | UNKNOWN
  req_type TEXT,    -- SKILL | EXPERIENCE | EDUCATION | OTHER
  skill_key TEXT,
  explanation TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS opportunity_analysis (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  career_alignment INTEGER,
  capability_fit INTEGER,
  evidence_fit INTEGER,
  experience_fit TEXT,
  project_relevance INTEGER,
  location_fit TEXT,
  work_mode_fit TEXT,
  compensation_fit TEXT,
  opportunity_quality INTEGER,
  application_effort TEXT,     -- QUICK | STANDARD | TAILORED | HIGH_EFFORT
  safety_concern_level TEXT,   -- LOW | VERIFY | HIGH
  priority_recommendation TEXT,-- APPLY_NOW | PREPARE_THEN_APPLY | LOW_PRIORITY | DO_NOT_PRIORITIZE | VERIFY_FIRST
  value_score INTEGER,
  confidence TEXT,             -- HIGH | MODERATE | LOW | UNKNOWN
  portfolio_tag TEXT,          -- TARGET | STRETCH | ADJACENT | EXPLORATORY
  next_action TEXT,
  why_json TEXT DEFAULT '[]',
  gaps_json TEXT DEFAULT '[]',
  matches_json TEXT DEFAULT '[]',
  dimensions_json TEXT DEFAULT '{}',
  best_project_id TEXT,
  best_project_reason TEXT,
  secondary_project_ids_json TEXT DEFAULT '[]',
  analysis_method TEXT DEFAULT 'DETERMINISTIC', -- DETERMINISTIC | AI_ENHANCED
  analyzed_at TEXT DEFAULT (datetime('now')),
  stale INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS opportunity_safety_signals (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  signal TEXT NOT NULL,
  detail TEXT,
  severity TEXT DEFAULT 'VERIFY', -- VERIFY | HIGH
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  stage TEXT DEFAULT 'SAVED',
  resume_id TEXT REFERENCES resumes(id),
  positioning_statement TEXT,
  applied_date TEXT,
  next_action TEXT,
  followup_interval_days INTEGER DEFAULT 7,
  outcome TEXT,
  outcome_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_stage_history (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  stage TEXT NOT NULL,
  note TEXT,
  changed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS application_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  doc_type TEXT NOT NULL,   -- ANSWER | RECRUITER_MESSAGE
  question TEXT,
  content TEXT,
  flagged_claims_json TEXT DEFAULT '[]',
  generation_method TEXT DEFAULT 'DETERMINISTIC',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  due_date TEXT,
  reason TEXT,
  channel TEXT,
  message_draft TEXT,
  status TEXT DEFAULT 'PENDING', -- PENDING | SENT | DISMISSED
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opportunities_student ON opportunities(student_id);
CREATE INDEX IF NOT EXISTS idx_requirements_opportunity ON opportunity_requirements(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_analysis_opportunity ON opportunity_analysis(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_applications_opportunity ON applications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_followups_application ON followups(application_id);
CREATE INDEX IF NOT EXISTS idx_evidence_student ON evidence(student_id);
