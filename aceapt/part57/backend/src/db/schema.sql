-- ACEAPT Feature 57 - Personal Shortcut Library
-- Schema. See spec secs. 11, 213-218. First-inspect-and-reuse (sec. 9) does
-- not apply in this build: there is no existing ACEAPT codebase in this
-- environment, so these tables are new. Foreign-key-style identifiers into
-- other ACEAPT features (skill_id, formula_id, question_family_id, question_id)
-- are plain nullable TEXT columns, not enforced FKs, because those tables
-- don't exist here yet - wire them up for real when Features 45/54/56 exist.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shortcuts (
  shortcut_id         TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL DEFAULT '',
  owner_student_id    TEXT,                          -- NULL = global/shared shortcut
  canonical_name      TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT '',       -- Quantitative | Logical | Verbal | Data Interpretation | ...
  domain              TEXT NOT NULL DEFAULT '',       -- free-text sub-area, e.g. "Percentages"
  skill_id            TEXT,                           -- Feature 45 integration key - blank until wired
  formula_id          TEXT,                           -- Feature 56 integration key - blank until wired
  question_family_id  TEXT,                           -- integration key - blank until wired
  strategy_type        TEXT NOT NULL,
  classification        TEXT NOT NULL DEFAULT 'EXPERIMENTAL',
  source               TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'DISCOVERED',
  risk_level           TEXT NOT NULL DEFAULT 'UNKNOWN',
  requires_options     INTEGER NOT NULL DEFAULT 0,     -- sec. 109 REQUIRES_OPTIONS
  is_approximation     INTEGER NOT NULL DEFAULT 0,     -- sec. 107 approximation handling
  acceptable_error     REAL,
  current_version      INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shortcuts_owner    ON shortcuts(owner_student_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_tenant   ON shortcuts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_family   ON shortcuts(question_family_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_status   ON shortcuts(status);
CREATE INDEX IF NOT EXISTS idx_shortcuts_strategy ON shortcuts(strategy_type);

-- Versioned content (sec. 133, 214). Editing conditions materially should
-- create a new version and re-trigger validation rather than mutate in place.
CREATE TABLE IF NOT EXISTS shortcut_versions (
  id                     TEXT PRIMARY KEY,
  shortcut_id            TEXT NOT NULL REFERENCES shortcuts(shortcut_id) ON DELETE CASCADE,
  version                INTEGER NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  steps                  TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  conditions             TEXT NOT NULL DEFAULT '[]',   -- JSON ConditionRule[] - machine-checkable "when to use" (sec. 29, 34)
  non_applicability      TEXT NOT NULL DEFAULT '[]',   -- JSON ConditionRule[] - machine-checkable "when not to use" (sec. 29, 34)
  when_to_use_text       TEXT NOT NULL DEFAULT '',     -- free-text guidance from the simple creation form (sec. 90) - display only, not evaluated by the Applicability Engine
  when_not_to_use_text   TEXT NOT NULL DEFAULT '',     -- same, for "when not to use"
  underlying_reason      TEXT NOT NULL DEFAULT '',     -- sec. 69/70 - no black-box shortcuts
  expression             TEXT,                          -- shortcut's own formula, e.g. "x/4"
  canonical_expression   TEXT,                          -- canonical/reference formula, e.g. "x*25/100"
  validation_domain      TEXT,                          -- JSON ValidationDomain
  verification_method    TEXT NOT NULL DEFAULT 'MANUAL',
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(shortcut_id, version)
);

CREATE INDEX IF NOT EXISTS idx_versions_shortcut ON shortcut_versions(shortcut_id);

-- Worked examples and counterexamples (secs. 27-28, 93).
CREATE TABLE IF NOT EXISTS shortcut_examples (
  id                 TEXT PRIMARY KEY,
  shortcut_id        TEXT NOT NULL REFERENCES shortcuts(shortcut_id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  is_counterexample  INTEGER NOT NULL DEFAULT 0,
  input              TEXT NOT NULL DEFAULT '{}',        -- JSON Record<string, number>
  expected_output    REAL,
  question_id        TEXT,                                -- optional link to a Feature-54-validated question
  note               TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_examples_shortcut ON shortcut_examples(shortcut_id, version);

-- Validation run history (secs. 22-28, 172).
CREATE TABLE IF NOT EXISTS shortcut_validations (
  id                  TEXT PRIMARY KEY,
  shortcut_id         TEXT NOT NULL REFERENCES shortcuts(shortcut_id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  validation_type     TEXT NOT NULL,                     -- PROPERTY_BASED | COUNTEREXAMPLE | BOUNDARY | EXAMPLE_SET | MANUAL
  status              TEXT NOT NULL,                      -- PASS | FAIL | INCONCLUSIVE
  evidence            TEXT NOT NULL DEFAULT '{}',         -- JSON: samples tested, failures found, etc.
  validator_version   TEXT NOT NULL DEFAULT 'v1',
  validated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_validations_shortcut ON shortcut_validations(shortcut_id, version);

-- Per-student trust progression (secs. 41, 53, 189-190, 216). This is where
-- "TRUSTED" actually lives - it is always scoped to one student.
CREATE TABLE IF NOT EXISTS student_shortcut_states (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL DEFAULT '',
  student_id             TEXT NOT NULL,
  shortcut_id            TEXT NOT NULL REFERENCES shortcuts(shortcut_id) ON DELETE CASCADE,
  state                  TEXT NOT NULL DEFAULT 'EXPERIMENTAL',
  reliability            REAL NOT NULL DEFAULT 0,          -- success_count / usage_count
  usage_count            INTEGER NOT NULL DEFAULT 0,
  success_count          INTEGER NOT NULL DEFAULT 0,
  avg_time_saved_ratio   REAL,                              -- mean of (baseline-shortcut)/baseline where baseline known
  transfer_evidence      TEXT NOT NULL DEFAULT '{}',        -- JSON { attempts, correct, lastAt }
  retention_evidence     TEXT NOT NULL DEFAULT '{}',        -- JSON { attempts, correct, lastAt }
  preferred              INTEGER NOT NULL DEFAULT 0,        -- sec. 124/125 - student pin/preference
  pinned                 INTEGER NOT NULL DEFAULT 0,
  notes                  TEXT NOT NULL DEFAULT '',          -- sec. 131 - student's own notes, never alters logic
  last_used_at           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, shortcut_id)
);

CREATE INDEX IF NOT EXISTS idx_state_student ON student_shortcut_states(student_id, state);
CREATE INDEX IF NOT EXISTS idx_state_tenant  ON student_shortcut_states(tenant_id);

-- Raw usage/attempt signal (secs. 41, 212, 217). Feature 57 does not
-- duplicate the canonical Attempt model; this table is the shortcut-specific
-- metadata a real integration would attach to that Attempt record.
CREATE TABLE IF NOT EXISTS shortcut_usages (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL DEFAULT '',
  student_id            TEXT NOT NULL,
  shortcut_id           TEXT NOT NULL REFERENCES shortcuts(shortcut_id) ON DELETE CASCADE,
  question_id           TEXT,
  question_family_id    TEXT,
  applied               INTEGER NOT NULL DEFAULT 1,
  correct               INTEGER NOT NULL,
  response_time_ms      INTEGER,
  baseline_time_ms      INTEGER,                              -- student's own comparable-difficulty standard-method time
  difficulty            TEXT,
  novelty               TEXT,
  mode                  TEXT NOT NULL DEFAULT 'PRACTICE',
  timed                 INTEGER NOT NULL DEFAULT 0,
  assisted              INTEGER NOT NULL DEFAULT 0,            -- sec. 257/258 - hint/guided use tracked separately
  excluded_reason       TEXT,                                    -- e.g. QUESTION_INVALIDATED (sec. 136, 259)
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_student_shortcut ON shortcut_usages(student_id, shortcut_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_created           ON shortcut_usages(created_at);

-- Candidate strategies surfaced from repeated behaviour (secs. 71-75, 218).
CREATE TABLE IF NOT EXISTS shortcut_discoveries (
  id                          TEXT PRIMARY KEY,
  tenant_id                   TEXT NOT NULL DEFAULT '',
  student_id                  TEXT NOT NULL,
  candidate_strategy_type     TEXT NOT NULL,
  question_family_id          TEXT,
  method_signature            TEXT NOT NULL,               -- caller-supplied description of the repeated approach
  evidence                    TEXT NOT NULL DEFAULT '{}',  -- JSON { count, successCount, questionIds }
  confidence                  REAL NOT NULL DEFAULT 0,
  status                      TEXT NOT NULL DEFAULT 'CANDIDATE_ACCUMULATING',
  resulting_shortcut_id       TEXT REFERENCES shortcuts(shortcut_id) ON DELETE SET NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at                 TEXT,
  UNIQUE(student_id, question_family_id, method_signature)
);

CREATE INDEX IF NOT EXISTS idx_discoveries_student ON shortcut_discoveries(student_id, status);

-- Recall / selection / application / transfer / pressure / retention drills (secs. 62-67, 179-187).
CREATE TABLE IF NOT EXISTS shortcut_training_attempts (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL DEFAULT '',
  student_id          TEXT NOT NULL,
  shortcut_id         TEXT REFERENCES shortcuts(shortcut_id) ON DELETE SET NULL,
  activity_type       TEXT NOT NULL,
  prompt_ref          TEXT NOT NULL DEFAULT '',
  response            TEXT NOT NULL DEFAULT '{}',
  correct             INTEGER,
  response_time_ms    INTEGER,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_training_student ON shortcut_training_attempts(student_id, activity_type, created_at);

-- Analytics event log (sec. 238).
CREATE TABLE IF NOT EXISTS analytics_events (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL DEFAULT '',
  student_id    TEXT,
  event_type    TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type, created_at);
