-- Full audit/history log (Section 35) - creation, updates, target
-- changes, priority changes, milestone events, pauses, resumes,
-- recalculations, completion. Append-only.
CREATE TABLE IF NOT EXISTS goal_history_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN (
                 'CREATED','UPDATED','TARGET_CHANGED','PRIORITY_CHANGED',
                 'MILESTONE_REACHED','PAUSED','RESUMED','RECALCULATED',
                 'COMPLETED','ABANDONED')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_goal_id ON goal_history_events(goal_id, created_at DESC);

ALTER TABLE goal_history_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_history_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS history_isolation ON goal_history_events;
CREATE POLICY history_isolation ON goal_history_events
  USING (EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_history_events.goal_id
      AND g.student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM goals g WHERE g.id = goal_history_events.goal_id
      AND g.student_id = NULLIF(current_setting('app.current_student_id', true), '')::uuid
  ));

GRANT SELECT, INSERT ON goal_history_events TO goal_app;
