-- 003: fix a real concurrency bug caught by the integration test suite
-- (tests/integration/httpSmoke.test.ts — "regenerate is idempotent-safe
-- under real concurrency"). Two simultaneous POST /api/path/regenerate
-- calls for the same student both read the same "latest version" before
-- either committed, both computed nextVersionNumber = N+1 in application
-- code, and the second INSERT into learning_path_versions threw a unique
-- violation on (path_id, version_number) — surfaced as a real 500.
--
-- Fix: the version number is no longer passed in by the caller. The
-- function takes a row lock on the parent learning_paths row (serializing
-- concurrent callers for the same student) and computes
-- MAX(version_number)+1 from inside that locked section, so two concurrent
-- callers are forced to run this part one after another rather than both
-- reading the same stale count.

DROP FUNCTION IF EXISTS fn_save_path_version(TEXT, TEXT, TEXT, INT, TEXT, JSONB, TEXT, JSONB);

CREATE OR REPLACE FUNCTION fn_save_path_version(
  p_student_id TEXT, p_path_id TEXT, p_version_id TEXT,
  p_reason TEXT, p_triggering_evidence JSONB, p_tradeoff_message TEXT, p_nodes JSONB
) RETURNS TABLE(out_version_id TEXT, out_version_number INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_node JSONB;
  v_next_version INT;
BEGIN
  PERFORM fn_require_session_student(p_student_id);

  INSERT INTO learning_paths (id, student_id)
  VALUES (p_path_id, p_student_id)
  ON CONFLICT (id) DO NOTHING;

  -- Serializes concurrent regenerations for this student's path: the second
  -- concurrent caller blocks here until the first commits, then sees the
  -- first's version in its MAX() below instead of racing against it.
  PERFORM 1 FROM learning_paths WHERE id = p_path_id FOR UPDATE;

  SELECT COALESCE(MAX(lpv.version_number), 0) + 1 INTO v_next_version
  FROM learning_path_versions lpv WHERE lpv.path_id = p_path_id;

  INSERT INTO learning_path_versions (id, path_id, student_id, version_number, reason, triggering_evidence, tradeoff_message)
  VALUES (p_version_id, p_path_id, p_student_id, v_next_version, p_reason, p_triggering_evidence, p_tradeoff_message);

  FOR v_node IN SELECT * FROM jsonb_array_elements(p_nodes)
  LOOP
    INSERT INTO learning_path_nodes (version_id, student_id, skill_id, node_order, status, priority_score, reason, estimated_minutes, action)
    VALUES (
      p_version_id, p_student_id, v_node->>'skillId', (v_node->>'order')::INT, v_node->>'status',
      (v_node->>'priorityScore')::NUMERIC, v_node->>'reason', (v_node->>'estimatedMinutes')::INT, v_node->'action'
    );
  END LOOP;

  RETURN QUERY SELECT p_version_id, v_next_version;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_save_path_version TO aceapt_app;
