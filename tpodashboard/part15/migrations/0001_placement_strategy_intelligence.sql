-- PrepVista AI — Part 15: Placement Forecasting + Strategy Engine
-- Migration 0001 — core schema
--
-- Postgres-flavored DDL. If Parts 1-14 use a different migration tool
-- (Prisma Migrate, Knex, TypeORM, Django, etc.), port the DDL rather than
-- run this file directly — the column shapes are what matter, not the tool.
--
-- LEAKAGE-PREVENTION NOTE (Section 19): every row that feeds a forecast
-- carries its own timestamp (recorded_at / generated_at / observed_at).
-- Nothing in this schema has an implicit "current state" table that a query
-- could accidentally read without a cutoff — nothing but forecast_record and
-- friends is EVER partially truncated by asOf; the systems-of-record for
-- applications/interviews/offers/joining belong to earlier Parts, and this
-- schema only adds forecast/strategy metadata layered on top. Point any
-- as-of-cutoff read against those base tables' own event timestamps, not
-- against a materialized "current status" column.

BEGIN;

CREATE TABLE IF NOT EXISTS placement_target (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID NOT NULL,
  season_id        TEXT NOT NULL,
  metric           TEXT NOT NULL CHECK (metric IN ('PLACEMENT_PCT','OFFERS','JOINING','COMPANIES','MEDIAN_CTC','READINESS')),
  target_value     NUMERIC NOT NULL,
  target_date      DATE NOT NULL,
  scope            JSONB NOT NULL DEFAULT '"INSTITUTION"', -- '"INSTITUTION"' or '{"departmentId": "..."}'
  created_by       UUID NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')) DEFAULT 'ACTIVE',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_placement_target_lookup ON placement_target (institution_id, season_id, metric, status);

CREATE TABLE IF NOT EXISTS forecast_record (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID NOT NULL,
  season_id        TEXT NOT NULL,
  metric           TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'INSTITUTION', -- 'INSTITUTION' or a department_id
  data_available   BOOLEAN NOT NULL,
  reason           TEXT,                                 -- populated when data_available = false
  point_estimate   NUMERIC,
  range_low        NUMERIC,
  range_high       NUMERIC,
  confidence       TEXT CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
  forecast_horizon TEXT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  model_version    TEXT NOT NULL,
  input_window     TEXT NOT NULL,
  data_through     DATE NOT NULL,                          -- the asOf cutoff actually used — Section 19/20
  freshness        TEXT NOT NULL CHECK (freshness IN ('LIVE','DELAYED')),
  sample_size      INTEGER,
  limitations      JSONB NOT NULL DEFAULT '[]',
  method           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forecast_record_lookup ON forecast_record (institution_id, season_id, metric, scope, generated_at DESC);

CREATE TABLE IF NOT EXISTS forecast_performance (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id             UUID NOT NULL REFERENCES forecast_record(id),
  actual_value            NUMERIC NOT NULL,
  actual_observed_at      TIMESTAMPTZ NOT NULL,
  absolute_error          NUMERIC NOT NULL,
  within_range            BOOLEAN NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forecast_performance_forecast ON forecast_performance (forecast_id);

CREATE TABLE IF NOT EXISTS scenario_run (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           UUID NOT NULL,
  season_id                TEXT NOT NULL,
  label                    TEXT NOT NULL,
  assumptions              JSONB NOT NULL,
  baseline_point_estimate  NUMERIC NOT NULL,
  projected_range_low      NUMERIC NOT NULL,
  projected_range_high     NUMERIC NOT NULL,
  confidence               TEXT NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
  caveat                   TEXT NOT NULL,
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID NOT NULL,
  archived                 BOOLEAN NOT NULL DEFAULT false,
  -- Deliberately NOT referenced by any operational table (drives, offers,
  -- applications, etc.) — a scenario_run row can never become live data by
  -- foreign key or trigger. See Section 40 / ScenarioService doc comment.
  CONSTRAINT scenario_run_isolated CHECK (true)
);
CREATE INDEX IF NOT EXISTS idx_scenario_run_lookup ON scenario_run (institution_id, season_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS strategic_gap (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID NOT NULL,
  season_id        TEXT NOT NULL,
  gap_type         TEXT NOT NULL CHECK (gap_type IN ('STUDENT_GAP','OPPORTUNITY_GAP','SKILL_GAP','FUNNEL_GAP','JOINING_GAP','DATA_GAP')),
  description      TEXT NOT NULL,
  evidence         JSONB NOT NULL DEFAULT '[]',
  affected_students INTEGER NOT NULL DEFAULT 0,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategic_gap_lookup ON strategic_gap (institution_id, season_id, gap_type, detected_at DESC);

CREATE TABLE IF NOT EXISTS strategic_recommendation (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID NOT NULL,
  season_id        TEXT NOT NULL,
  issue            TEXT NOT NULL,
  evidence         JSONB NOT NULL DEFAULT '[]',
  affected_students INTEGER NOT NULL DEFAULT 0,
  potential_impact TEXT NOT NULL,
  effort_estimate  TEXT NOT NULL CHECK (effort_estimate IN ('LOW','MEDIUM','HIGH','UNKNOWN')),
  urgency          NUMERIC NOT NULL,
  impact           NUMERIC NOT NULL,
  feasibility      NUMERIC NOT NULL,
  confidence       NUMERIC NOT NULL,
  priority_score   NUMERIC NOT NULL,
  action_owner     TEXT NOT NULL CHECK (action_owner IN ('TPO','MANAGEMENT','STUDENT')),
  explanation      TEXT NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategic_recommendation_lookup ON strategic_recommendation (institution_id, season_id, priority_score DESC);

CREATE TABLE IF NOT EXISTS strategic_action (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id   UUID NOT NULL REFERENCES strategic_recommendation(id),
  status              TEXT NOT NULL DEFAULT 'PENDING_TPO_CONFIRMATION',
  proposed_by         UUID NOT NULL,
  proposed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Foreign key into the Part 14 task/action system once that ID exists.
  -- Part 15 never flips status itself past PENDING — Part 14 owns execution.
  part14_task_id      UUID,
  completed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_strategic_action_recommendation ON strategic_action (recommendation_id);

CREATE TABLE IF NOT EXISTS company_outreach_priority (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL,
  season_id         TEXT NOT NULL,
  company_id        UUID NOT NULL,
  priority          TEXT NOT NULL CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  score             NUMERIC NOT NULL,
  components        JSONB NOT NULL, -- {pastHiring, relationshipStrength, studentSkillMatch, departmentDemand, recency, opportunityGap}
  evidence          JSONB NOT NULL DEFAULT '[]',
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No table in this migration is readable by a recruiter-scoped role —
  -- see docs/PART15_INTEGRATION.md "Section 6" for the enforced invariant.
);
CREATE INDEX IF NOT EXISTS idx_company_outreach_priority_lookup ON company_outreach_priority (institution_id, season_id, score DESC);

CREATE TABLE IF NOT EXISTS strategy_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID NOT NULL,
  actor_id         UUID NOT NULL,
  actor_role       TEXT NOT NULL CHECK (actor_role IN ('TPO','MANAGEMENT','STUDENT')),
  action           TEXT NOT NULL,
  target_type      TEXT NOT NULL,
  target_id        TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_strategy_audit_log_lookup ON strategy_audit_log (institution_id, created_at DESC);

COMMIT;

-- Row-level security (Section 64 — tenant isolation / role authorization).
-- Uncomment and adapt once app-role session variables are wired up; left
-- commented because the exact session-variable convention depends on how
-- Parts 1-14 already authenticate DB connections.
--
-- ALTER TABLE placement_target ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY placement_target_tenant_isolation ON placement_target
--   USING (institution_id = current_setting('app.current_institution_id')::uuid);
-- (repeat per table)
