CREATE TABLE report_definitions (
  id                 TEXT PRIMARY KEY,
  institution_id     TEXT NOT NULL,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL,   -- executive | department | drive | offer | joining | readiness | student
  version            INTEGER NOT NULL,
  sections           TEXT NOT NULL,   -- JSON array of section keys
  metric_config      TEXT NOT NULL,   -- JSON: metric names this report depends on
  visibility         TEXT NOT NULL,   -- tpo | management | student
  created_by         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- A published report is a frozen snapshot: definition version, metric
-- versions, filters and the fully computed payload are all captured at
-- generation time, so reopening it later reproduces the SAME numbers
-- even if source data or definitions change afterward (section 44).

CREATE TABLE report_snapshots (
  id                          TEXT PRIMARY KEY,
  institution_id              TEXT NOT NULL,
  report_definition_id        TEXT NOT NULL REFERENCES report_definitions(id),
  report_definition_version   INTEGER NOT NULL,
  season                      TEXT NOT NULL,
  filters                     TEXT NOT NULL,   -- JSON
  metric_definition_versions  TEXT NOT NULL,   -- JSON map: metric name -> version used
  data_through                TEXT NOT NULL,   -- freshest source timestamp included
  payload                     TEXT NOT NULL,   -- JSON: frozen computed report content
  warnings                    TEXT NOT NULL,   -- JSON array
  quality_score               REAL NOT NULL,
  generated_at                TEXT NOT NULL,
  generated_by                TEXT NOT NULL
);

CREATE INDEX idx_snapshots_def ON report_snapshots(report_definition_id);
CREATE INDEX idx_snapshots_institution_season ON report_snapshots(institution_id, season);

CREATE TABLE management_review_comments (
  id                  TEXT PRIMARY KEY,
  institution_id      TEXT NOT NULL,
  report_snapshot_id  TEXT REFERENCES report_snapshots(id),
  section             TEXT,
  author              TEXT NOT NULL,
  comment             TEXT NOT NULL,
  created_at          TEXT NOT NULL
);

CREATE TABLE decision_log (
  id                  TEXT PRIMARY KEY,
  institution_id      TEXT NOT NULL,
  report_snapshot_id  TEXT REFERENCES report_snapshots(id),
  decision             TEXT NOT NULL,
  reason              TEXT,
  owner               TEXT NOT NULL,
  due_date            TEXT,
  status              TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done | dropped
  created_at          TEXT NOT NULL
);

CREATE TABLE management_targets (
  id              TEXT PRIMARY KEY,
  institution_id  TEXT NOT NULL,
  season          TEXT NOT NULL,
  metric_name     TEXT NOT NULL,  -- placement_rate | offers | joining_rate | readiness
  target_value    REAL NOT NULL,
  set_by          TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_targets_unique ON management_targets(institution_id, season, metric_name);
