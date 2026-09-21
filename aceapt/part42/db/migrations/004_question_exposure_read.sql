-- ACEAPT Feature 42 — Migration 004
-- Missing from 002: question selection needs per-question exposure counts,
-- and diagnostic_question_exposures is per-student (RLS-protected, zero
-- direct grants to diag_app) — so it needs its own SECURITY DEFINER reader,
-- same as everything else per-student.

begin;

create or replace function diag_get_question_exposure(
  p_tenant_id uuid, p_student_id uuid, p_question_id uuid
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_times_seen integer;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select times_seen into v_times_seen
    from diagnostic_question_exposures
   where student_id = p_student_id and tenant_id = p_tenant_id and question_id = p_question_id;

  return coalesce(v_times_seen, 0);
end;
$$;

grant execute on function diag_get_question_exposure(uuid, uuid, uuid) to diag_app;

commit;
