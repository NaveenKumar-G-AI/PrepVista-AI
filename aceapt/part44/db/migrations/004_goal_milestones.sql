CREATE TABLE IF NOT EXISTS goal_milestones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id            UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,

  title              TEXT NOT NULL,
  description        TEXT,
  sequence           INTEGER NOT NULL,

  status             TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN (
                        'UPCOMING','ACTIVE','ACHIEVED')),

  -- Outcome-based target, e.g. {"dimension":"logical","min_score":65,
  -- "min_consistency":70} - never "complete N questions" (Section 10).
  target_state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_required  TEXT NOT NULL,

  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (goal_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON goal_milestones(goal_id);

DROP TRIGGER IF EXISTS trg_milestones_updated_at ON goal_milestones;
CREATE TRIGGER trg_milestones_updated_at BEFORE UPDATE ON goal_milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_milestones FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS milestones_isolation ON goal_milestones;
CREATE POLICY milestones_isolation ON goal_milestones
  USING (EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_milestones.goal_id
      AND g.student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_milestones.goal_id
      AND g.student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid
  ));

GRANT SELECT, INSERT, UPDATE ON goal_milestones TO goal_app;
