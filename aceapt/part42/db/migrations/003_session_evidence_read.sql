-- ACEAPT Feature 42 — Migration 003
--
-- Why this exists: a topic/domain-level estimate pools evidence across ALL
-- of its descendant skills (capabilityEstimator.ts), so recomputing a
-- topic's estimate after one response needs every sibling skill's evidence,
-- not just the skill that was just answered. Rather than N calls to
-- diag_get_evidence_trail (one per sibling skill) on every submission,
-- this returns the whole session's evidence in one round trip.

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
    'evidence_weight', ev.evidence_weight, 'created_at', r.created_at
  ) order by r.created_at), '[]'::jsonb) into v_result
  from diagnostic_evidence ev
  join diagnostic_responses r on r.id = ev.response_id
  where ev.session_id = p_session_id and ev.student_id = p_student_id and ev.tenant_id = p_tenant_id;

  return v_result;
end;
$$;

grant execute on function diag_get_all_session_evidence(uuid, uuid, uuid) to diag_app;

commit;
