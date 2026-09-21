-- SECURITY DEFINER functions — the only way proof_app touches PROOF tables.
-- Each takes the caller's student_id as an explicit parameter that the API
-- layer must populate from its own verified auth context, never from
-- request-body data, then sets the RLS session variable itself before doing
-- any table access. Tables use FORCE ROW LEVEL SECURITY (001_init.sql) so
-- this applies even though these functions run as the owning role.

begin;

create or replace function fn_get_evidence(p_student_id uuid, p_capability text default null)
returns setof verification_evidence
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  return query
    select * from verification_evidence
    where student_id = p_student_id
      and (p_capability is null or capability = p_capability)
    order by created_at desc;
end;
$$;

create or replace function fn_save_evidence(p_student_id uuid, p_rows jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into verification_evidence (
      id, student_id, session_id, source_attempt_id, evidence_type, capability,
      difficulty, novelty, performance, time_taken_ms, expected_time_ms, is_valid, quality, created_at
    ) values (
      r->>'id', p_student_id, nullif(r->>'sessionId','')::uuid, r->>'sourceAttemptId',
      r->>'evidenceType', r->>'capability', r->>'difficulty', r->>'novelty',
      (r->>'performance')::numeric, nullif(r->>'timeTakenMs','')::int, nullif(r->>'expectedTimeMs','')::int,
      coalesce((r->>'isValid')::boolean, true), r->'quality', coalesce((r->>'createdAt')::timestamptz, now())
    )
    on conflict (id) do update set
      performance = excluded.performance, quality = excluded.quality, is_valid = excluded.is_valid;
  end loop;
end;
$$;

create or replace function fn_create_session(
  p_student_id uuid, p_target_id uuid, p_simulation_profile_id uuid, p_mode text, p_plan_reason text
) returns verification_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_session verification_sessions;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  insert into verification_sessions (student_id, target_id, simulation_profile_id, mode, status, plan_reason)
  values (p_student_id, p_target_id, p_simulation_profile_id, p_mode, 'IN_PROGRESS', p_plan_reason)
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function fn_get_session(p_student_id uuid, p_session_id uuid)
returns setof verification_sessions
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  return query select * from verification_sessions where id = p_session_id and student_id = p_student_id;
end;
$$;

create or replace function fn_record_response(
  p_student_id uuid, p_session_id uuid, p_question_index int, p_capability text, p_difficulty text,
  p_novelty text, p_is_correct boolean, p_time_taken_ms int, p_expected_time_ms int,
  p_skipped boolean, p_changed_answer boolean, p_stalled boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  if not exists (select 1 from verification_sessions where id = p_session_id and student_id = p_student_id) then
    raise exception 'SESSION_NOT_FOUND_OR_NOT_OWNED';
  end if;
  insert into session_responses (
    session_id, student_id, question_index, capability, difficulty, novelty, is_correct,
    time_taken_ms, expected_time_ms, skipped, changed_answer, stalled
  ) values (
    p_session_id, p_student_id, p_question_index, p_capability, p_difficulty, p_novelty, p_is_correct,
    p_time_taken_ms, p_expected_time_ms, p_skipped, p_changed_answer, p_stalled
  )
  on conflict (session_id, question_index) do update set
    is_correct = excluded.is_correct, time_taken_ms = excluded.time_taken_ms, stalled = excluded.stalled;
end;
$$;

create or replace function fn_get_responses(p_student_id uuid, p_session_id uuid)
returns setof session_responses
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  return query select * from session_responses where session_id = p_session_id and student_id = p_student_id order by question_index;
end;
$$;

-- Idempotent completion: SELECT ... FOR UPDATE serializes concurrent
-- completion attempts for the same session on the same row. The second of
-- two racing calls sees the row already COMPLETED after acquiring the lock
-- and returns already_completed = true without reprocessing (Section 49 —
-- a duplicate submission must never double-count evidence).
-- Idempotent completion: SELECT ... FOR UPDATE serializes concurrent
-- completion attempts for the same session on the same row. The second of
-- two racing calls sees the row already COMPLETED after acquiring the lock
-- and returns already_completed = true without reprocessing (Section 49 —
-- a duplicate submission must never double-count evidence). Columns are
-- returned flat rather than as a nested `verification_sessions` composite:
-- a composite column nested inside RETURNS TABLE(...) is not auto-expanded
-- by `SELECT *` the way a bare `RETURNS verification_sessions` is, so the
-- node-postgres driver would otherwise hand back an unparsed composite
-- literal string instead of named fields. The flattened OUT-parameter names
-- deliberately match the underlying table's column names for a 1:1 mapping
-- on the TS side — which means every bare column reference inside this
-- function body must be table-qualified, since PL/pgSQL puts RETURNS
-- TABLE(...) columns in scope as variables for the whole function body and
-- an unqualified `id` or `student_id` would otherwise be ambiguous between
-- the OUT parameter and the `verification_sessions` column of the same
-- name (the same bug class already hit once before on this project, as a
-- column-name collision inside a different SECURITY DEFINER function).
drop function if exists fn_complete_session(uuid, uuid);
create function fn_complete_session(p_student_id uuid, p_session_id uuid)
returns table (
  id uuid, student_id uuid, target_id uuid, simulation_profile_id uuid, mode text, status text,
  plan_reason text, started_at timestamptz, completed_at timestamptz, created_at timestamptz,
  already_completed boolean
)
language plpgsql security definer set search_path = public as $$
declare
  v_session verification_sessions;
  v_already boolean := false;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  select * into v_session from verification_sessions
    where verification_sessions.id = p_session_id and verification_sessions.student_id = p_student_id
    for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND_OR_NOT_OWNED';
  end if;
  if v_session.status = 'COMPLETED' then
    v_already := true;
  else
    update verification_sessions
      set status = 'COMPLETED', completed_at = now()
      where verification_sessions.id = p_session_id
      returning * into v_session;
  end if;
  return query select
    v_session.id, v_session.student_id, v_session.target_id, v_session.simulation_profile_id, v_session.mode,
    v_session.status, v_session.plan_reason, v_session.started_at, v_session.completed_at, v_session.created_at,
    v_already;
end;
$$;

create or replace function fn_save_result(
  p_student_id uuid, p_session_id uuid, p_target_id uuid, p_status text, p_confidence text,
  p_factors jsonb, p_evidence_summary jsonb, p_failure_signatures jsonb, p_explanation text
) returns verification_results
language plpgsql security definer set search_path = public as $$
declare
  v_result verification_results;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  insert into verification_results (
    student_id, session_id, target_id, status, confidence, factors, evidence_summary, failure_signatures, explanation
  ) values (
    p_student_id, p_session_id, p_target_id, p_status, p_confidence, p_factors, p_evidence_summary, p_failure_signatures, p_explanation
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function fn_get_latest_result(p_student_id uuid, p_target_id uuid)
returns setof verification_results
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  return query
    select * from verification_results
    where student_id = p_student_id and target_id = p_target_id
    order by created_at desc limit 1;
end;
$$;

create or replace function fn_save_snapshot(
  p_student_id uuid, p_target_id uuid, p_result_id uuid, p_status text, p_confidence text,
  p_verified_at timestamptz, p_aging_state text
) returns proof_snapshots
language plpgsql security definer set search_path = public as $$
declare
  v_snap proof_snapshots;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  insert into proof_snapshots (student_id, target_id, result_id, status, confidence, verified_at, aging_state)
  values (p_student_id, p_target_id, p_result_id, p_status, p_confidence, p_verified_at, p_aging_state)
  returning * into v_snap;
  return v_snap;
end;
$$;

create or replace function fn_get_history(p_student_id uuid, p_target_id uuid)
returns setof proof_snapshots
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  return query
    select * from proof_snapshots
    where student_id = p_student_id and target_id = p_target_id
    order by created_at asc;
end;
$$;

create or replace function fn_count_recent_sessions(p_student_id uuid, p_since_hours int)
returns bigint
language plpgsql security definer set search_path = public as $$
declare v_count bigint;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  select count(*) into v_count from verification_sessions
    where student_id = p_student_id and created_at >= now() - make_interval(hours => p_since_hours);
  return v_count;
end;
$$;

create or replace function fn_minutes_since_last_session(p_student_id uuid)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  select max(created_at) into v_last from verification_sessions where student_id = p_student_id;
  if v_last is null then return null; end if;
  return extract(epoch from (now() - v_last)) / 60.0;
end;
$$;

-- Not per-student — reads target-level configuration, so no RLS context is
-- needed here.
create or replace function fn_get_active_requirement(p_target_id uuid, p_capability text)
returns setof verification_requirements
language sql security definer set search_path = public as $$
  select * from verification_requirements
  where target_id = p_target_id and capability = p_capability and is_active
  limit 1;
$$;

create or replace function fn_create_simulation_profile(
  p_mode text, p_question_count int, p_difficulty_distribution jsonb, p_topic_distribution jsonb,
  p_time_limit_ms int, p_novelty_target text, p_target_capability text, p_navigation_behavior text, p_scoring_rules jsonb
) returns simulation_profiles
language plpgsql security definer set search_path = public as $$
declare v_profile simulation_profiles;
begin
  insert into simulation_profiles (
    mode, question_count, difficulty_distribution, topic_distribution, time_limit_ms,
    novelty_target, target_capability, navigation_behavior, scoring_rules
  ) values (
    p_mode, p_question_count, p_difficulty_distribution, p_topic_distribution, p_time_limit_ms,
    p_novelty_target, p_target_capability, p_navigation_behavior, p_scoring_rules
  ) returning * into v_profile;
  return v_profile;
end;
$$;

-- Ownership: every function above must be owned by proof_owner, NOT by
-- whatever superuser ran this migration. SECURITY DEFINER functions run
-- with their owner's privileges, and FORCE ROW LEVEL SECURITY (001_init.sql)
-- only constrains non-superuser owners — a function owned by a superuser
-- bypasses RLS regardless of FORCE, silently turning every policy above
-- into a no-op. See db.rls.test.ts, which fails loudly if this is ever
-- wrong.
alter function fn_get_evidence(uuid, text) owner to proof_owner;
alter function fn_save_evidence(uuid, jsonb) owner to proof_owner;
alter function fn_create_session(uuid, uuid, uuid, text, text) owner to proof_owner;
alter function fn_get_session(uuid, uuid) owner to proof_owner;
alter function fn_record_response(uuid, uuid, int, text, text, text, boolean, int, int, boolean, boolean, boolean) owner to proof_owner;
alter function fn_get_responses(uuid, uuid) owner to proof_owner;
alter function fn_complete_session(uuid, uuid) owner to proof_owner;
alter function fn_save_result(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, text) owner to proof_owner;
alter function fn_get_latest_result(uuid, uuid) owner to proof_owner;
alter function fn_save_snapshot(uuid, uuid, uuid, text, text, timestamptz, text) owner to proof_owner;
alter function fn_get_history(uuid, uuid) owner to proof_owner;
alter function fn_count_recent_sessions(uuid, int) owner to proof_owner;
alter function fn_minutes_since_last_session(uuid) owner to proof_owner;
alter function fn_get_active_requirement(uuid, text) owner to proof_owner;
alter function fn_create_simulation_profile(text, int, jsonb, jsonb, int, text, text, text, jsonb) owner to proof_owner;

grant execute on function
  fn_get_evidence(uuid, text),
  fn_save_evidence(uuid, jsonb),
  fn_create_session(uuid, uuid, uuid, text, text),
  fn_get_session(uuid, uuid),
  fn_record_response(uuid, uuid, int, text, text, text, boolean, int, int, boolean, boolean, boolean),
  fn_get_responses(uuid, uuid),
  fn_complete_session(uuid, uuid),
  fn_save_result(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, text),
  fn_get_latest_result(uuid, uuid),
  fn_save_snapshot(uuid, uuid, uuid, text, text, timestamptz, text),
  fn_get_history(uuid, uuid),
  fn_count_recent_sessions(uuid, int),
  fn_minutes_since_last_session(uuid),
  fn_get_active_requirement(uuid, text),
  fn_create_simulation_profile(text, int, jsonb, jsonb, int, text, text, text, jsonb)
to proof_app;

commit;
