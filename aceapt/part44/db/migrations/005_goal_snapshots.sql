-- Historical snapshots (Section 11) - append-only, enables longitudinal
-- analysis and is what "before/after" (Section 27) and the priority-shift
-- history (Section 29) read from. Never updated after insert.
CREATE TABLE IF NOT EXISTS goal_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id            UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  captured_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  trigger            TEXT NOT NULL CHECK (trigger IN (
                        'CREATED','RECALCULATED','MILESTONE_REACHED',
                        'PAUSED','RESUMED','MANUAL','PERFORMANCE_UPDATE')),

  current_capability JSONB NOT NULL,
  target_capability  JSONB NOT NULL,
  gap                JSONB NOT NULL,
  priority_skills    JSONB NOT NULL,
  health             TEXT NOT NULL,
  progress           NUMERIC(5,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_goal_id ON goal_snapshots(goal_id, captured_at DESC);

ALTER TABLE goal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS snapshots_isolation ON goal_snapshots;
CREATE POLICY snapshots_isolation ON goal_snapshots
  USING (EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_snapshots.goal_id
      AND g.student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_snapshots.goal_id
      AND g.student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid
  ));

GRANT SELECT, INSERT ON goal_snapshots TO goal_app;
