-- ACEAPT Feature 42 — Migration 005
--
-- Fixes a real design smell caught during review, not by a test: the TS
-- session manager needed duration/difficulty/confidence per evidence point
-- to build speed/accuracy/difficulty profiles, but diag_get_all_session_evidence
-- (003) only returned skill_node_id/is_correct/evidence_weight/created_at.
-- The first draft tried to re-associate the missing fields by matching
-- evidence_weight or created_at against a separately-fetched evidence
-- trail — a coincidence-based join that could silently mismatch rows.
-- Correct fix: the underlying query already joins diagnostic_responses,
-- so just select the columns that were already one join away.

begin;

create or replace function diag_get_all_session_evidence(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_node_id', ev.skill_node_id, 'is_correct', r.is_correct,
    'evidence_weight', ev.evidence_weight, 'created_at', r.created_at,
    'duration_ms', r.duration_ms, 'expected_duration_ms', r.expected_duration_ms,
    'question_difficulty', r.question_difficulty, 'confidence', r.confidence
  ) order by r.created_at), '[]'::jsonb) into v_result
  from diagnostic_evidence ev
  join diagnostic_responses r on r.id = ev.response_id
  where ev.session_id = p_session_id and ev.student_id = p_student_id and ev.tenant_id = p_tenant_id;

  return v_result;
end;
$$;

-- signature unchanged, so the existing grant from migration 003 still applies.

commit;
