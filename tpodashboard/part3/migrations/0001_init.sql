-- 0001_init.sql
-- Core Drive persistence: the drive itself, versioned eligibility rules,
-- immutable eligibility snapshots, and an append-only audit log.

CREATE TABLE IF NOT EXISTS drives (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  active_rule_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  closed_at TEXT,
  cancelled_at TEXT,
  CHECK (status IN (
    'DRAFT','UNDER_REVIEW','APPROVED','PUBLISHED','APPLICATIONS_OPEN',
    'APPLICATIONS_CLOSED','IN_PROGRESS','SELECTION_PENDING','COMPLETED',
    'CANCELLED','ARCHIVED'
  ))
);

CREATE TABLE IF NOT EXISTS eligibility_rule_versions (
  id TEXT PRIMARY KEY,
  drive_id TEXT NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  rule_tree_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT,
  UNIQUE (drive_id, version_number)
);

CREATE TABLE IF NOT EXISTS eligibility_snapshots (
  id TEXT PRIMARY KEY,
  drive_id TEXT NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  rule_version_id TEXT NOT NULL REFERENCES eligibility_rule_versions(id),
  computed_at TEXT NOT NULL,
  total_students INTEGER NOT NULL,
  eligible_count INTEGER NOT NULL,
  not_eligible_count INTEGER NOT NULL,
  category_breakdown_json TEXT NOT NULL,
  eligible_student_ids_json TEXT NOT NULL,
  not_eligible_student_ids_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_id TEXT NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rule_versions_drive ON eligibility_rule_versions(drive_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_drive ON eligibility_snapshots(drive_id);
CREATE INDEX IF NOT EXISTS idx_audit_drive ON drive_audit_log(drive_id);
