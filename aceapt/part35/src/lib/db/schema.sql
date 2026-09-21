-- Feature 35 — Career Conversion & Failure-Recovery Intelligence
-- Documented target schema.
--
-- The running app in this repo persists to a local JSON file (see store.ts) so
-- it works with zero setup. This file is the relational shape that data is
-- intended to live in once wired to ACEAPT's real database — the repository
-- functions in repository.ts map 1:1 onto these tables, so porting is a
-- swap of implementation, not of data model.
--
-- Per Section 30/54 of the brief: before running this against a real system,
-- check whether `students` already exists as a richer profile table elsewhere
-- in ACEAPT and FK into that instead of creating a second source of truth.

CREATE TABLE students (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  target_role   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE opportunities (
  id                  TEXT PRIMARY KEY,
  student_id          TEXT NOT NULL REFERENCES students(id),
  company_name        TEXT NOT NULL,
  role_title          TEXT NOT NULL,
  role_category       TEXT NOT NULL,
  source              TEXT,
  target_alignment    TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (target_alignment IN ('aligned','partial','misaligned','unknown')),
  custom_stage_label  TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Flexible, ordered per-opportunity stage tracking (Section 5/6): every
-- canonical stage up to and including the furthest one reached gets a row.
CREATE TABLE application_stages (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id),
  stage_key       TEXT NOT NULL,
  label           TEXT NOT NULL,
  sort_order      INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('passed','rejected','withdrawn','offer_received','pending')),
  is_furthest     INTEGER NOT NULL DEFAULT 0,
  completed_at    TEXT
);

-- Evidence is stored as given, never invented (Section 8/35). REPEATED_SIGNAL
-- and UNKNOWN are *derived* states computed by the pattern engine at read
-- time, not stored values — an empty evidence set for a stage IS "unknown".
CREATE TABLE outcome_evidence (
  id                    TEXT PRIMARY KEY,
  opportunity_id        TEXT NOT NULL REFERENCES opportunities(id),
  application_stage_id  TEXT REFERENCES application_stages(id),
  evidence_type         TEXT NOT NULL CHECK (evidence_type IN ('DIRECT_EVIDENCE','POSSIBLE_CONTRIBUTOR')),
  source                TEXT NOT NULL CHECK (source IN (
                          'recruiter_feedback','student_feedback','trainer_feedback',
                          'assessment_result','simulation_result','resume_alignment',
                          'project_evidence','other')),
  failure_category      TEXT,
  content_text          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE recovery_plans (
  id                  TEXT PRIMARY KEY,
  student_id          TEXT NOT NULL REFERENCES students(id),
  opportunity_id      TEXT REFERENCES opportunities(id),
  failure_category    TEXT NOT NULL,
  pattern_strength    TEXT NOT NULL CHECK (pattern_strength IN ('limited_evidence','emerging_pattern','repeated_pattern')),
  rationale_fallback  TEXT NOT NULL,
  rationale_ai        TEXT,
  status              TEXT NOT NULL DEFAULT 'recommended' CHECK (status IN ('recommended','started','completed')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  started_at          TEXT,
  completed_at        TEXT
);

-- One primary + up to two supporting actions per plan (Section 15/16 — never
-- a generic checklist of many tasks).
CREATE TABLE recovery_actions (
  id                TEXT PRIMARY KEY,
  recovery_plan_id  TEXT NOT NULL REFERENCES recovery_plans(id),
  action_type       TEXT NOT NULL CHECK (action_type IN ('primary','supporting')),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  completed_at      TEXT
);

CREATE TABLE reassessments (
  id                TEXT PRIMARY KEY,
  recovery_plan_id  TEXT NOT NULL REFERENCES recovery_plans(id),
  result            TEXT NOT NULL CHECK (result IN ('improved','no_change','declined','unclear')),
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lightweight stand-in for Feature 34 (Career Trajectory Intelligence)
-- integration: every meaningful outcome/recovery/reassessment appends a note
-- here (Section 27, P0 item 10 — "updated student trajectory"). Once Feature
-- 34 exists, this table becomes its inbound event log instead of a leaf.
CREATE TABLE trajectory_notes (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  summary     TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('outcome','recovery_completed','reassessment')),
  source_id   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE product_events (
  id          TEXT PRIMARY KEY,
  student_id  TEXT REFERENCES students(id),
  event_type  TEXT NOT NULL,
  payload     TEXT, -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_opportunities_student ON opportunities(student_id);
CREATE INDEX idx_stages_opportunity ON application_stages(opportunity_id);
CREATE INDEX idx_evidence_opportunity ON outcome_evidence(opportunity_id);
CREATE INDEX idx_recovery_student ON recovery_plans(student_id);
CREATE INDEX idx_recovery_actions_plan ON recovery_actions(recovery_plan_id);
CREATE INDEX idx_trajectory_student ON trajectory_notes(student_id);
