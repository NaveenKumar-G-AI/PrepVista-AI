-- ACEAPT Feature 4 — initial schema
--
-- Security model:
--   * RLS is enabled on every per-student table. Policies compare student_id
--     to current_setting('app.current_student_id', true), which the app
--     sets via `SET LOCAL` inside each request's transaction (see
--     src/repositories/postgresStore.ts: withStudentSession).
--   * The application role (aceapt_app) is granted SELECT (+ INSERT only on
--     the two append-only log tables) directly. It is NOT granted UPDATE or
--     DELETE on any table, and is not a superuser and does not have
--     BYPASSRLS (see scripts/migrate.ts / setup). Every stateful mutation —
--     path regeneration, action status transitions, intervention recording,
--     evidence upsert — goes through a SECURITY DEFINER function that
--     re-checks the caller's session identity itself. This means even a
--     compromised app role, or a bug in the Fastify authorization layer,
--     cannot write data for a student other than the one the DB session was
--     set up for.
--   * Catalog tables (skills, skill_prerequisites) are not per-student and
--     are world-readable; only the migration owner can write to them.

-- ── Catalog (not per-student) ────────────────────────────────────────────
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  base_relevance JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_learn_minutes INT NOT NULL DEFAULT 20
);

CREATE TABLE skill_prerequisites (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  prerequisite_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (skill_id, prerequisite_id)
);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_prerequisites ENABLE ROW LEVEL SECURITY;
CREATE POLICY skills_read_all ON skills FOR SELECT USING (true);
CREATE POLICY skill_prereqs_read_all ON skill_prerequisites FOR SELECT USING (true);

-- ── Students (stand-in for Feature 1's real student record) ────────────────
CREATE TABLE students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  available_minutes INT NOT NULL DEFAULT 30,
  target_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY students_isolation ON students
  USING (id = current_setting('app.current_student_id', true));

-- ── Skill evidence (Feature-3-shaped; Feature 4 reads, does not compute) ───
CREATE TABLE skill_evidence (
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  foundation JSONB NOT NULL,
  application JSONB NOT NULL,
  transfer_familiar JSONB NOT NULL,
  transfer_variant JSONB NOT NULL,
  recent_difficulty TEXT NOT NULL DEFAULT 'FOUNDATION',
  recent_error_signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, skill_id)
);
ALTER TABLE skill_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_evidence_isolation ON skill_evidence
  USING (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_skill_evidence_student ON skill_evidence(student_id);

-- ── Raw attempts — Feature-4-owned, used only for stuck-detection signals ──
-- (Deliberately separate from skill_evidence: Feature 4 never re-derives
-- mastery from these, only short-window behavioral patterns. See Phase 46.)
CREATE TABLE learning_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  correct BOOLEAN NOT NULL,
  hint_used BOOLEAN NOT NULL DEFAULT false,
  error_signature TEXT,
  time_ms INT NOT NULL,
  expected_time_ms INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE learning_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_attempts_isolation ON learning_attempts
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_learning_attempts_student_skill ON learning_attempts(student_id, skill_id, created_at DESC);

-- ── Learning paths / versions / nodes ───────────────────────────────────────
CREATE TABLE learning_paths (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_paths_isolation ON learning_paths
  USING (student_id = current_setting('app.current_student_id', true));

CREATE TABLE learning_path_versions (
  id TEXT PRIMARY KEY,
  path_id TEXT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  version_number INT NOT NULL,
  reason TEXT NOT NULL,
  triggering_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  tradeoff_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (path_id, version_number)
);
ALTER TABLE learning_path_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_path_versions_isolation ON learning_path_versions
  USING (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_path_versions_student ON learning_path_versions(student_id, version_number DESC);

CREATE TABLE learning_path_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id TEXT NOT NULL REFERENCES learning_path_versions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  node_order INT NOT NULL,
  status TEXT NOT NULL,
  priority_score NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  estimated_minutes INT NOT NULL,
  action JSONB NOT NULL
);
ALTER TABLE learning_path_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_path_nodes_isolation ON learning_path_nodes
  USING (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_path_nodes_version ON learning_path_nodes(version_id, node_order);

-- ── Learning actions ─────────────────────────────────────────────────────
CREATE TABLE learning_actions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority NUMERIC NOT NULL,
  estimated_duration INT NOT NULL,
  target_capability TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  evidence_basis JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING',
  intervention_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  resulting_evidence_summary TEXT
);
ALTER TABLE learning_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_actions_isolation ON learning_actions
  USING (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_actions_student_status ON learning_actions(student_id, status);

-- ── Interventions ────────────────────────────────────────────────────────
CREATE TABLE interventions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  sequence_index INT NOT NULL,
  outcome_improved BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY interventions_isolation ON interventions
  USING (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_interventions_student_skill ON interventions(student_id, skill_id, created_at);

-- ── Events (append-only analytics log) ──────────────────────────────────
CREATE TABLE learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  type TEXT NOT NULL,
  skill_id TEXT,
  action_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_events_isolation ON learning_events
  USING (student_id = current_setting('app.current_student_id', true))
  WITH CHECK (student_id = current_setting('app.current_student_id', true));
CREATE INDEX idx_events_student_created ON learning_events(student_id, created_at DESC);

-- ── Learning outcomes ────────────────────────────────────────────────────
CREATE TABLE learning_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL REFERENCES learning_actions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  outcome TEXT,
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE learning_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_outcomes_isolation ON learning_outcomes
  USING (student_id = current_setting('app.current_student_id', true));

-- ============================================================================
-- SECURITY DEFINER functions — the only way stateful writes happen.
-- Each one re-checks p_student_id against the session setting itself, so
-- authorization does not depend solely on the Fastify layer being correct.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_require_session_student(p_student_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.current_student_id', true) IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'student_id % does not match session identity', p_student_id
      USING ERRCODE = '28000'; -- invalid_authorization_specification
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_upsert_skill_evidence(
  p_student_id TEXT, p_skill_id TEXT,
  p_foundation JSONB, p_application JSONB, p_transfer_familiar JSONB, p_transfer_variant JSONB,
  p_recent_difficulty TEXT, p_recent_error_signatures JSONB, p_verified_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_session_student(p_student_id);
  INSERT INTO skill_evidence (student_id, skill_id, foundation, application, transfer_familiar, transfer_variant, recent_difficulty, recent_error_signatures, verified_at, updated_at)
  VALUES (p_student_id, p_skill_id, p_foundation, p_application, p_transfer_familiar, p_transfer_variant, p_recent_difficulty, p_recent_error_signatures, p_verified_at, now())
  ON CONFLICT (student_id, skill_id) DO UPDATE SET
    foundation = EXCLUDED.foundation, application = EXCLUDED.application,
    transfer_familiar = EXCLUDED.transfer_familiar, transfer_variant = EXCLUDED.transfer_variant,
    recent_difficulty = EXCLUDED.recent_difficulty, recent_error_signatures = EXCLUDED.recent_error_signatures,
    verified_at = EXCLUDED.verified_at, updated_at = now();
END;
$$;

-- Saves a full path version + its nodes atomically, creating the parent
-- learning_paths row on first use. Returns the new version id.
CREATE OR REPLACE FUNCTION fn_save_path_version(
  p_student_id TEXT, p_path_id TEXT, p_version_id TEXT, p_version_number INT,
  p_reason TEXT, p_triggering_evidence JSONB, p_tradeoff_message TEXT, p_nodes JSONB
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_node JSONB;
BEGIN
  PERFORM fn_require_session_student(p_student_id);

  INSERT INTO learning_paths (id, student_id)
  VALUES (p_path_id, p_student_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO learning_path_versions (id, path_id, student_id, version_number, reason, triggering_evidence, tradeoff_message)
  VALUES (p_version_id, p_path_id, p_student_id, p_version_number, p_reason, p_triggering_evidence, p_tradeoff_message);

  FOR v_node IN SELECT * FROM jsonb_array_elements(p_nodes)
  LOOP
    INSERT INTO learning_path_nodes (version_id, student_id, skill_id, node_order, status, priority_score, reason, estimated_minutes, action)
    VALUES (
      p_version_id, p_student_id, v_node->>'skillId', (v_node->>'order')::INT, v_node->>'status',
      (v_node->>'priorityScore')::NUMERIC, v_node->>'reason', (v_node->>'estimatedMinutes')::INT, v_node->'action'
    );
  END LOOP;

  RETURN p_version_id;
END;
$$;

-- Validated status transitions only — mirrors Phase 41 (student agency) while
-- still enforcing that e.g. an action can't be "completed" without having
-- been started, and can't be mutated once already completed.
CREATE OR REPLACE FUNCTION fn_transition_action(
  p_student_id TEXT, p_action_id TEXT, p_new_status TEXT
) RETURNS learning_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row learning_actions;
BEGIN
  PERFORM fn_require_session_student(p_student_id);

  SELECT * INTO v_row FROM learning_actions WHERE id = p_action_id AND student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'action % not found for this student', p_action_id USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'action % is already completed', p_action_id USING ERRCODE = '22023';
  END IF;

  IF p_new_status = 'IN_PROGRESS' AND v_row.status NOT IN ('PENDING', 'POSTPONED') THEN
    RAISE EXCEPTION 'cannot start action from status %', v_row.status USING ERRCODE = '22023';
  END IF;
  IF p_new_status = 'COMPLETED' AND v_row.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'cannot complete action from status % (must be IN_PROGRESS)', v_row.status USING ERRCODE = '22023';
  END IF;

  UPDATE learning_actions SET
    status = p_new_status,
    started_at = CASE WHEN p_new_status = 'IN_PROGRESS' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'COMPLETED' THEN now() ELSE completed_at END
  WHERE id = p_action_id AND student_id = p_student_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION fn_create_action(
  p_student_id TEXT, p_id TEXT, p_skill_id TEXT, p_action_type TEXT, p_reason TEXT,
  p_priority NUMERIC, p_estimated_duration INT, p_target_capability TEXT, p_difficulty TEXT,
  p_evidence_basis JSONB, p_intervention_type TEXT
) RETURNS learning_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row learning_actions;
BEGIN
  PERFORM fn_require_session_student(p_student_id);
  INSERT INTO learning_actions (id, student_id, skill_id, action_type, reason, priority, estimated_duration, target_capability, difficulty, evidence_basis, intervention_type)
  VALUES (p_id, p_student_id, p_skill_id, p_action_type, p_reason, p_priority, p_estimated_duration, p_target_capability, p_difficulty, p_evidence_basis, p_intervention_type)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION fn_record_intervention(
  p_student_id TEXT, p_id TEXT, p_skill_id TEXT, p_type TEXT, p_reason TEXT, p_sequence_index INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM fn_require_session_student(p_student_id);
  INSERT INTO interventions (id, student_id, skill_id, type, reason, sequence_index)
  VALUES (p_id, p_student_id, p_skill_id, p_type, p_reason, p_sequence_index);
END;
$$;

-- ============================================================================
-- Grants — aceapt_app gets SELECT everywhere, INSERT only on the two
-- append-only tables, and EXECUTE on the functions above. No UPDATE/DELETE
-- grant exists anywhere for this role.
-- ============================================================================
GRANT SELECT ON ALL TABLES IN SCHEMA public TO aceapt_app;
GRANT INSERT ON learning_events, learning_attempts TO aceapt_app;
GRANT EXECUTE ON FUNCTION
  fn_upsert_skill_evidence, fn_save_path_version, fn_transition_action,
  fn_create_action, fn_record_intervention
  TO aceapt_app;
