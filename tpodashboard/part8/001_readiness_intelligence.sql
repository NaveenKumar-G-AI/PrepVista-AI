-- PrepVista Part 8 — Placement Readiness Intelligence
-- Reference schema (PostgreSQL). Adapt table/column names to match your
-- actual Parts 1-7 conventions before running — in particular, the
-- REFERENCES lines assume tables named students/institutions/seasons
-- that may not match your real schema exactly.
--
-- gen_random_uuid() is built into PostgreSQL 13+. On an older version,
-- run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` first.

-- ---------------------------------------------------------------------
-- Versioned readiness model configuration (sections 13, 14, 67, 68).
-- Never edit a row in place once it has snapshots referencing it —
-- insert a new version instead, so historical trends stay comparable.
-- ---------------------------------------------------------------------
CREATE TABLE readiness_model_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version           TEXT NOT NULL UNIQUE,          -- e.g. 'v1', 'v2'
  institution_id    UUID NOT NULL,                 -- REFERENCES institutions(id)
  season_id         UUID,                          -- NULL = applies to all seasons until superseded
  dimension_weights JSONB NOT NULL,                 -- { "technical": 25, ... } sums to 100
  bands             JSONB NOT NULL,                 -- [{ level, min, max }, ...]
  min_coverage      NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  momentum_config   JSONB NOT NULL,
  change_threshold  NUMERIC(5,2) NOT NULL,
  effective_from    DATE NOT NULL,
  effective_to      DATE,                           -- NULL = currently active
  created_by        UUID,                           -- admin/TPO user who set this (section 66 audit)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_model_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version                 TEXT NOT NULL UNIQUE,
  institution_id          UUID NOT NULL,
  min_signals_for_medium  INT NOT NULL DEFAULT 2,     -- section 38 false-positive safeguard
  severity_by_signal_count JSONB NOT NULL,             -- [{ minSignals, level }, ...]
  thresholds              JSONB NOT NULL,
  effective_from          DATE NOT NULL,
  effective_to            DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Readiness snapshots (section 15). One row per calculation. Never
-- updated after insert — a new calculation is a new row, which is what
-- makes trend/momentum queries meaningful.
-- ---------------------------------------------------------------------
CREATE TABLE readiness_snapshot (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL,                  -- REFERENCES students(id)
  institution_id      UUID NOT NULL,
  season_id           UUID,
  overall_score       NUMERIC(5,2),                    -- NULL = INSUFFICIENT_DATA, never 0
  coverage_fraction   NUMERIC(4,3) NOT NULL,
  readiness_level     TEXT NOT NULL,                   -- READY | ALMOST_READY | DEVELOPING | HIGH_RISK | INSUFFICIENT_DATA
  dimension_scores    JSONB NOT NULL,                  -- { technical: 84, problemSolving: null, ... }
  momentum_state      TEXT NOT NULL,                   -- RISING | STABLE | DECLINING | INSUFFICIENT_DATA
  momentum_delta      NUMERIC(5,2),
  evidence_summary    JSONB NOT NULL,                  -- strongest/priority/missingDimensions
  calculation_version TEXT NOT NULL REFERENCES readiness_model_config(version),
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_readiness_snapshot_student_time
  ON readiness_snapshot (student_id, calculated_at DESC);
CREATE INDEX idx_readiness_snapshot_institution_season
  ON readiness_snapshot (institution_id, season_id, calculated_at DESC);
-- Cohort/department aggregation queries filter on level + join to a
-- students table for department/batch — index the common filter path.
CREATE INDEX idx_readiness_snapshot_level
  ON readiness_snapshot (institution_id, readiness_level, calculated_at DESC);

-- ---------------------------------------------------------------------
-- Risk state timeline (sections 35-38). One row per (student, evaluation
-- run) so "when did risk enter/leave a state" (section 37) is a query,
-- not a guess.
-- ---------------------------------------------------------------------
CREATE TABLE risk_assessment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL,
  readiness_snapshot_id UUID NOT NULL REFERENCES readiness_snapshot(id),
  level             TEXT NOT NULL,        -- CRITICAL | HIGH | MEDIUM | LOW | NONE | INSUFFICIENT_DATA
  signal_count      INT NOT NULL DEFAULT 0,
  signals           JSONB NOT NULL,        -- [{ type, evidence }, ...]
  first_detected    TIMESTAMPTZ,           -- NULL while level = NONE
  calculation_version TEXT NOT NULL REFERENCES risk_model_config(version),
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_assessment_student_time
  ON risk_assessment (student_id, calculated_at DESC);
CREATE INDEX idx_risk_assessment_level
  ON risk_assessment (level, calculated_at DESC) WHERE level IN ('CRITICAL', 'HIGH');

-- ---------------------------------------------------------------------
-- Skill gap results (sections 23-24). Target always carries a source —
-- there is no code path that writes a gap row without one.
-- ---------------------------------------------------------------------
CREATE TABLE skill_gap_result (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL,
  skill           TEXT NOT NULL,
  current_score   NUMERIC(5,2),                 -- NULL = no current data
  target_score    NUMERIC(5,2) NOT NULL,
  target_source   TEXT NOT NULL,                -- e.g. 'role_config:software_engineer'
  status          TEXT NOT NULL,                -- MET | GAP | NO_DATA
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_gap_student ON skill_gap_result (student_id, calculated_at DESC);
CREATE INDEX idx_skill_gap_skill ON skill_gap_result (skill, status);

-- ---------------------------------------------------------------------
-- Config-change audit (section 66) — only administrative changes are
-- audited here, not routine calculation runs.
-- ---------------------------------------------------------------------
CREATE TABLE readiness_config_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_table  TEXT NOT NULL,      -- 'readiness_model_config' | 'risk_model_config'
  config_id     UUID NOT NULL,
  action        TEXT NOT NULL,      -- 'CREATED' | 'SUPERSEDED' | 'MANUAL_OVERRIDE'
  changed_by    UUID NOT NULL,
  reason        TEXT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
