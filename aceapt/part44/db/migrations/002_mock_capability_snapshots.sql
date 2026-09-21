-- Stand-in for real ACEAPT capability data (Feature 43 / diagnostics /
-- skill intelligence). Feature 44 reads from this shape but never writes
-- to it and never recomputes mastery itself (see src/integrations/capability).
-- In the real codebase this table does not exist here at all; the
-- CapabilityDataClient interface is instead implemented against Feature 43's
-- real service.
CREATE TABLE IF NOT EXISTS mock_capability_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- per-dimension mastery, 0-100
  quant             NUMERIC(5,2),
  logical           NUMERIC(5,2),
  verbal            NUMERIC(5,2),
  probability       NUMERIC(5,2),
  data_interpretation NUMERIC(5,2),
  accuracy          NUMERIC(5,2),
  speed_band        TEXT CHECK (speed_band IN ('SLOW','DEVELOPING','ON_PACE','FAST')),
  consistency       NUMERIC(5,2),
  -- observed improvement rate, capability points gained per hour of
  -- focused practice, per dimension - used by the priority/feasibility
  -- engines. NULL means "not enough evidence yet", never fabricated.
  improvement_rate_per_hour JSONB
);

CREATE INDEX IF NOT EXISTS idx_mock_capability_student ON mock_capability_snapshots(student_id, assessed_at DESC);

GRANT SELECT, INSERT ON mock_capability_snapshots TO goal_app;
