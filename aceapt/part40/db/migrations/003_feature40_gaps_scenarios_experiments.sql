-- =============================================================================
-- 003_feature40_gaps_scenarios_experiments.sql
-- Student-scoped Feature 40 tables. These carry a private per-student future
-- strategy and therefore get Row-Level Security in migration 005 — enforced
-- against a NON-OWNER application role (aceapt_app), because Postgres exempts
-- a table's owning role from RLS by default (the exact bug the Feature 29
-- build hit and fixed; this build avoids it from the start).
-- =============================================================================

CREATE TYPE future_gap_severity AS ENUM ('CRITICAL','HIGH','MODERATE','OPTIONAL','UNKNOWN');
CREATE TYPE future_gap_status   AS ENUM ('OPEN','IN_PROGRESS','RESOLVED','DISMISSED');
CREATE TYPE experiment_status   AS ENUM ('ACTIVE','COMPLETED','ABANDONED');

-- ---- Future gaps: market expectation vs. student evidence -------------------
CREATE TABLE future_gaps (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_role_id       UUID NOT NULL REFERENCES roles(id),
  skill_id             UUID REFERENCES skills(id),
  severity             future_gap_severity NOT NULL DEFAULT 'UNKNOWN',
  market_expectation   TEXT NOT NULL,
  student_evidence     TEXT NOT NULL,
  explanation          TEXT NOT NULL,
  recommended_action   TEXT NOT NULL,
  confidence           confidence_level NOT NULL DEFAULT 'UNKNOWN',
  period               TEXT NOT NULL,
  status               future_gap_status NOT NULL DEFAULT 'OPEN',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_future_gaps_student_role ON future_gaps(student_id, target_role_id);
CREATE INDEX idx_future_gaps_student_status ON future_gaps(student_id, status);

-- ---- Career scenarios ("What if?") -------------------------------------------
CREATE TABLE career_scenarios (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_role_id       UUID NOT NULL REFERENCES roles(id),
  scenario_type        TEXT NOT NULL,      -- AI_AUTOMATION_INCREASE | TECH_DECLINE | CLOUD_IMPORTANCE_RISES | DEMAND_SHIFT | NEW_ROLE_EMERGES
  title                TEXT NOT NULL,
  assumptions          TEXT NOT NULL,
  task_impact          JSONB NOT NULL DEFAULT '[]',
  skill_impact         JSONB NOT NULL DEFAULT '[]',
  student_position     TEXT NOT NULL,
  student_risk         TEXT NOT NULL,
  student_opportunity  TEXT NOT NULL,
  adaptation           TEXT NOT NULL,
  confidence           confidence_level NOT NULL DEFAULT 'UNKNOWN',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_career_scenarios_student ON career_scenarios(student_id);

-- ---- Career experiments ("Test this career") ---------------------------------
CREATE TABLE career_experiments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  role_id              UUID NOT NULL REFERENCES roles(id),
  status               experiment_status NOT NULL DEFAULT 'ACTIVE',
  duration_days        INT NOT NULL DEFAULT 14,
  tasks                JSONB NOT NULL DEFAULT '[]',
  reflection           TEXT,
  fit_result           TEXT,                 -- STRONG_FIT | MODERATE_FIT | WEAK_FIT | INCONCLUSIVE
  evidence_generated   JSONB,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ
);
CREATE INDEX idx_career_experiments_student ON career_experiments(student_id);
