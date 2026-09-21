CREATE TABLE IF NOT EXISTS goals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

  goal_type               TEXT NOT NULL CHECK (goal_type IN (
                             'PLACEMENT_READINESS','ASSESSMENT_PREPARATION',
                             'SKILL_IMPROVEMENT','PERFORMANCE_IMPROVEMENT',
                             'SPEED_IMPROVEMENT','ACCURACY_IMPROVEMENT',
                             'OVERALL_APTITUDE','CUSTOM')),
  title                   TEXT NOT NULL,
  description             TEXT,

  status                  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
                             'ACTIVE','PAUSED','COMPLETED','ABANDONED')),

  is_primary              BOOLEAN NOT NULL DEFAULT true,
  priority_order          INTEGER NOT NULL DEFAULT 1,

  -- Deadline Intelligence (Section 16) - exactly one representation is
  -- authoritative at a time, selected by deadline_type.
  deadline_type           TEXT NOT NULL CHECK (deadline_type IN (
                             'EXACT_DATE','DAYS_FROM_NOW','NONE','UNKNOWN')),
  target_date             DATE,                -- set when deadline_type = EXACT_DATE
                                                  -- or resolved from DAYS_FROM_NOW at creation time

  -- Availability Intelligence (Section 17) - per-day minutes, irregular
  -- schedules allowed, e.g. {"monday":30,"tuesday":15,...,"sunday":0}
  available_time          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Target state (Section 19). Nullable per-dimension - a dimension with
  -- no target is TARGET_PENDING, never invented.
  target_capability       JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_accuracy         NUMERIC(5,2),
  target_speed_band       TEXT CHECK (target_speed_band IN ('DEVELOPING','ON_PACE','FAST')),

  -- Section 14: what the student *said*, kept separate from what the
  -- system has actually measured. Never promoted to fact automatically.
  student_reported_weakness TEXT,

  -- Snapshots captured at last recalculation (Sections 9, 18-20)
  current_state_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_state_snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  gap_snapshot             JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority_snapshot        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Sections 23-26
  health                  TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (health IN (
                             'HEALTHY','IMPROVING','NEEDS_ATTENTION','AT_RISK',
                             'PAUSED','COMPLETED')),
  health_reason            TEXT,
  feasibility              TEXT CHECK (feasibility IN (
                             'ON_TRACK','CHALLENGING','HIGHLY_CONSTRAINED',
                             'INSUFFICIENT_EVIDENCE')),  -- NULL when no deadline (Section 47)
  confidence                TEXT NOT NULL DEFAULT 'LOW' CHECK (confidence IN ('LOW','MODERATE','HIGH')),
  progress                  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Section 33: student clicking done is never sufficient on its own.
  student_marked_complete  BOOLEAN NOT NULL DEFAULT false,
  system_verified_complete BOOLEAN NOT NULL DEFAULT false,
  completed_at              TIMESTAMPTZ,

  paused_at                 TIMESTAMPTZ,
  resumed_at                TIMESTAMPTZ,

  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_student_id ON goals(student_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_target_date ON goals(target_date);
CREATE INDEX IF NOT EXISTS idx_goals_student_status ON goals(student_id, status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_goals_updated_at ON goals;
CREATE TRIGGER trg_goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Row Level Security ----------
-- Student A must never be able to read or write Student B's goals
-- (Section 53, tested explicitly in tests/integration/rls.test.ts).
-- The app sets app.current_student_id via set_config() at the start of
-- every request (see src/db/pool.ts). Absence of the setting denies all
-- rows (fail closed) rather than defaulting to allow.
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goals_isolation ON goals;
CREATE POLICY goals_isolation ON goals
  USING (student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid)
  WITH CHECK (student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON goals TO goal_app;
