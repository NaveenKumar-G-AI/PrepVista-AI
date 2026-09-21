-- 002: broaden fn_transition_action's legal transitions.
--
-- 001 only allowed PENDING/POSTPONED -> IN_PROGRESS -> COMPLETED. Writing
-- the service layer surfaced that this doesn't cover Phase 41 (student
-- agency: "allow start, pause, skip, postpone, revisit"): a student must be
-- able to skip or postpone an action they haven't started yet, and pause
-- one that's in progress. Terminal states are now COMPLETED and SKIPPED
-- (postponing is not terminal — it can resume).

CREATE OR REPLACE FUNCTION fn_transition_action(
  p_student_id TEXT, p_action_id TEXT, p_new_status TEXT
) RETURNS learning_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row learning_actions;
  v_allowed BOOLEAN := false;
BEGIN
  PERFORM fn_require_session_student(p_student_id);

  SELECT * INTO v_row FROM learning_actions WHERE id = p_action_id AND student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'action % not found for this student', p_action_id USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IN ('COMPLETED', 'SKIPPED') THEN
    RAISE EXCEPTION 'action % is in a terminal status (%) and cannot be transitioned', p_action_id, v_row.status USING ERRCODE = '22023';
  END IF;

  v_allowed := (
    (p_new_status = 'IN_PROGRESS' AND v_row.status IN ('PENDING', 'POSTPONED')) OR
    (p_new_status = 'COMPLETED'   AND v_row.status = 'IN_PROGRESS') OR
    (p_new_status = 'POSTPONED'   AND v_row.status IN ('PENDING', 'IN_PROGRESS')) OR
    (p_new_status = 'SKIPPED'     AND v_row.status IN ('PENDING', 'POSTPONED', 'IN_PROGRESS'))
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'cannot transition action from % to %', v_row.status, p_new_status USING ERRCODE = '22023';
  END IF;

  UPDATE learning_actions SET
    status = p_new_status,
    started_at = CASE WHEN p_new_status = 'IN_PROGRESS' AND started_at IS NULL THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'COMPLETED' THEN now() ELSE completed_at END
  WHERE id = p_action_id AND student_id = p_student_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_transition_action TO aceapt_app;
