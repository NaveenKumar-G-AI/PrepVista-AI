-- ACEAPT Feature 42 — Migration 002: RLS + SECURITY DEFINER access layer
--
-- Pattern (carried over from Feature 4 / Feature 28): diag_app has ZERO
-- grants on the base tables. Every read or write goes through a function
-- owned by diag_owner. Each function sets app.current_student_id /
-- app.current_tenant_id from its OWN validated parameters (never trusts a
-- session variable set by someone else) and RLS then double-checks that
-- every row touched actually matches — so a forgotten WHERE clause inside
-- one of these functions still can't leak or corrupt another student's
-- row, because RLS is FORCE'd even for the owner.
--
-- All jsonb in/out (never RETURNS TABLE with nested composites) — avoids
-- the "nested composite type returned unparsed over the wire" bug class
-- hit on Feature 28.

begin;

-- ============================================================
-- RLS — enable + FORCE on every per-student table
-- ============================================================

alter table diagnostic_sessions enable row level security;
alter table diagnostic_sessions force row level security;
create policy diag_sessions_isolation on diagnostic_sessions
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table diagnostic_question_exposures enable row level security;
alter table diagnostic_question_exposures force row level security;
create policy diag_exposures_isolation on diagnostic_question_exposures
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table diagnostic_responses enable row level security;
alter table diagnostic_responses force row level security;
create policy diag_responses_isolation on diagnostic_responses
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table diagnostic_evidence enable row level security;
alter table diagnostic_evidence force row level security;
create policy diag_evidence_isolation on diagnostic_evidence
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table diagnostic_skill_estimates enable row level security;
alter table diagnostic_skill_estimates force row level security;
create policy diag_skill_estimates_isolation on diagnostic_skill_estimates
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table diagnostic_snapshots enable row level security;
alter table diagnostic_snapshots force row level security;
create policy diag_snapshots_isolation on diagnostic_snapshots
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table diagnostic_recommendations enable row level security;
alter table diagnostic_recommendations force row level security;
create policy diag_recommendations_isolation on diagnostic_recommendations
  using (student_id = current_setting('app.current_student_id', true)::uuid
         and tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  with check (student_id = current_setting('app.current_student_id', true)::uuid
              and tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Blueprint tables are shared configuration, not per-student — no RLS needed.
-- Fixture tables stand in for existing ACEAPT tables with their own,
-- already-established access control — out of scope for Feature 42.

-- ============================================================
-- FUNCTIONS
-- ============================================================

create or replace function diag_start_or_resume_session(
  p_tenant_id uuid, p_student_id uuid, p_blueprint_id uuid, p_mode text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session diagnostic_sessions%rowtype;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select * into v_session from diagnostic_sessions
   where student_id = p_student_id and tenant_id = p_tenant_id
     and blueprint_id = p_blueprint_id and mode = p_mode
     and status in ('in_progress', 'paused') and expires_at > now()
   order by started_at desc limit 1;

  if found then
    return jsonb_build_object('ok', true, 'resumed', true, 'session_id', v_session.id,
      'status', v_session.status, 'working_state', v_session.working_state);
  end if;

  insert into diagnostic_sessions (tenant_id, student_id, blueprint_id, mode)
  values (p_tenant_id, p_student_id, p_blueprint_id, p_mode)
  returning * into v_session;

  return jsonb_build_object('ok', true, 'resumed', false, 'session_id', v_session.id,
    'status', v_session.status, 'working_state', v_session.working_state);
end;
$$;

create or replace function diag_get_session_state(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session diagnostic_sessions%rowtype;
  v_response_count integer;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select * into v_session from diagnostic_sessions
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'DIAG_SESSION_NOT_FOUND');
  end if;

  select count(*) into v_response_count from diagnostic_responses where session_id = p_session_id;

  return jsonb_build_object('ok', true, 'session_id', v_session.id, 'status', v_session.status,
    'blueprint_id', v_session.blueprint_id, 'mode', v_session.mode,
    'working_state', v_session.working_state, 'response_count', v_response_count,
    'started_at', v_session.started_at, 'baseline_session_id', v_session.baseline_session_id);
end;
$$;

create or replace function diag_save_working_state(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid, p_working_state jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  update diagnostic_sessions set working_state = p_working_state, last_activity_at = now(), updated_at = now()
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id and status = 'in_progress'
  returning id into v_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_TRANSITION');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function diag_submit_response(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid,
  p_response jsonb, p_evidence jsonb, p_skill_estimates jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_response_id uuid;
  v_existing_id uuid;
  v_session_status diagnostic_session_status;
  v_question_id uuid := (p_response->>'question_id')::uuid;
  v_skill_node_id uuid := (p_response->>'skill_node_id')::uuid;
  v_client_response_id text := p_response->>'client_response_id';
  v_est jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select status into v_session_status from diagnostic_sessions
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id
   for update;

  if not found then
    raise exception 'DIAG_SESSION_NOT_FOUND';
  end if;

  if v_session_status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'reason', 'SESSION_NOT_ACTIVE', 'status', v_session_status);
  end if;

  select id into v_existing_id from diagnostic_responses
   where session_id = p_session_id and client_response_id = v_client_response_id;

  if found then
    update diagnostic_sessions set last_activity_at = now() where id = p_session_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'response_id', v_existing_id);
  end if;

  begin
    insert into diagnostic_responses (
      tenant_id, session_id, student_id, question_id, skill_node_id, client_response_id,
      answer, is_correct, question_difficulty, expected_duration_ms,
      started_at, completed_at, duration_ms, confidence, hint_used, attempt_number,
      was_previously_exposed
    ) values (
      p_tenant_id, p_session_id, p_student_id, v_question_id, v_skill_node_id, v_client_response_id,
      p_response->'answer', (p_response->>'is_correct')::boolean,
      (p_response->>'question_difficulty')::question_difficulty,
      (p_response->>'expected_duration_ms')::integer,
      (p_response->>'started_at')::timestamptz, (p_response->>'completed_at')::timestamptz,
      (p_response->>'duration_ms')::integer,
      nullif(p_response->>'confidence', '')::smallint,
      coalesce((p_response->>'hint_used')::boolean, false),
      coalesce((p_response->>'attempt_number')::integer, 1),
      coalesce((p_response->>'was_previously_exposed')::boolean, false)
    )
    returning id into v_response_id;
  exception when unique_violation then
    select id into v_existing_id from diagnostic_responses
     where session_id = p_session_id and client_response_id = v_client_response_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'response_id', v_existing_id);
  end;

  insert into diagnostic_evidence (
    tenant_id, response_id, session_id, student_id, skill_node_id,
    evidence_weight, timing_classification, quality_flags
  ) values (
    p_tenant_id, v_response_id, p_session_id, p_student_id, v_skill_node_id,
    (p_evidence->>'evidence_weight')::numeric,
    (p_evidence->>'timing_classification')::timing_classification,
    array(select jsonb_array_elements_text(coalesce(p_evidence->'quality_flags', '[]'::jsonb)))
  );

  insert into diagnostic_question_exposures (tenant_id, student_id, question_id, times_seen)
  values (p_tenant_id, p_student_id, v_question_id, 1)
  on conflict (student_id, question_id)
  do update set times_seen = diagnostic_question_exposures.times_seen + 1, last_seen_at = now();

  for v_est in select * from jsonb_array_elements(p_skill_estimates) loop
    insert into diagnostic_skill_estimates (
      tenant_id, session_id, student_id, skill_node_id, point_estimate, status,
      confidence_state, evidence_count, weighted_evidence, consistency_flag, updated_at
    ) values (
      p_tenant_id, p_session_id, p_student_id, (v_est->>'skill_node_id')::uuid,
      (v_est->>'point_estimate')::numeric, (v_est->>'status')::capability_status,
      (v_est->>'confidence_state')::diagnostic_confidence_state,
      (v_est->>'evidence_count')::integer, (v_est->>'weighted_evidence')::numeric,
      coalesce((v_est->>'consistency_flag')::boolean, false), now()
    )
    on conflict (session_id, skill_node_id) do update set
      point_estimate = excluded.point_estimate, status = excluded.status,
      confidence_state = excluded.confidence_state, evidence_count = excluded.evidence_count,
      weighted_evidence = excluded.weighted_evidence, consistency_flag = excluded.consistency_flag,
      updated_at = now();
  end loop;

  update diagnostic_sessions set last_activity_at = now(), updated_at = now() where id = p_session_id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'response_id', v_response_id);
end;
$$;

create or replace function diag_pause_session(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid, p_working_state jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  update diagnostic_sessions
     set status = 'paused', paused_at = now(), updated_at = now(),
         working_state = coalesce(p_working_state, working_state)
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id and status = 'in_progress'
  returning id into v_id;

  if not found then return jsonb_build_object('ok', false, 'reason', 'INVALID_TRANSITION'); end if;
  return jsonb_build_object('ok', true, 'status', 'paused');
end;
$$;

create or replace function diag_resume_session(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_expired boolean;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  update diagnostic_sessions
     set status = 'in_progress', paused_at = null, updated_at = now(), last_activity_at = now()
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id
     and status = 'paused' and expires_at > now()
  returning id into v_id;

  if found then return jsonb_build_object('ok', true, 'status', 'in_progress'); end if;

  select expires_at <= now() into v_expired from diagnostic_sessions
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id and status = 'paused';

  if v_expired then return jsonb_build_object('ok', false, 'reason', 'SESSION_EXPIRED'); end if;
  return jsonb_build_object('ok', false, 'reason', 'INVALID_TRANSITION');
end;
$$;

create or replace function diag_abandon_or_expire_session(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid, p_new_status text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_new_status not in ('abandoned', 'expired') then
    raise exception 'DIAG_INVALID_STATUS: %', p_new_status;
  end if;

  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  execute format(
    'update diagnostic_sessions set status = %L, updated_at = now()
      where id = $1 and student_id = $2 and tenant_id = $3 and status in (''in_progress'', ''paused'')
     returning id', p_new_status
  ) into v_id using p_session_id, p_student_id, p_tenant_id;

  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'INVALID_TRANSITION'); end if;
  return jsonb_build_object('ok', true, 'status', p_new_status);
end;
$$;

create or replace function diag_complete_session(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid, p_final_profile jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_blueprint_id uuid;
  v_baseline_session_id uuid;
  v_has_baseline boolean;
  v_snapshot_type text;
  v_snapshot_id uuid;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  update diagnostic_sessions
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id
     and status in ('in_progress', 'paused')
  returning id, blueprint_id, baseline_session_id into v_id, v_blueprint_id, v_baseline_session_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_TRANSITION');
  end if;

  select exists (
    select 1 from diagnostic_snapshots sn
    join diagnostic_sessions se on se.id = sn.session_id
    where se.student_id = p_student_id and se.blueprint_id = v_blueprint_id
      and sn.snapshot_type = 'baseline'
  ) into v_has_baseline;

  v_snapshot_type := case
    when not v_has_baseline then 'baseline'
    when v_baseline_session_id is not null then 'reassessment'
    else 'current'
  end;

  insert into diagnostic_snapshots (tenant_id, session_id, student_id, snapshot_type, profile_json)
  values (p_tenant_id, p_session_id, p_student_id, v_snapshot_type, p_final_profile)
  returning id into v_snapshot_id;

  return jsonb_build_object('ok', true, 'status', 'completed', 'snapshot_id', v_snapshot_id,
    'snapshot_type', v_snapshot_type);
end;
$$;

create or replace function diag_start_reassessment(
  p_tenant_id uuid, p_student_id uuid, p_blueprint_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_baseline_id uuid;
  v_session diagnostic_sessions%rowtype;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select se.id into v_baseline_id
    from diagnostic_sessions se
    join diagnostic_snapshots sn on sn.session_id = se.id
   where se.student_id = p_student_id and se.blueprint_id = p_blueprint_id
     and se.tenant_id = p_tenant_id and se.status = 'completed'
   order by se.completed_at desc limit 1;

  if v_baseline_id is null then
    return jsonb_build_object('ok', false, 'reason', 'NO_PRIOR_DIAGNOSTIC_TO_COMPARE_AGAINST');
  end if;

  insert into diagnostic_sessions (tenant_id, student_id, blueprint_id, mode, baseline_session_id)
  values (p_tenant_id, p_student_id, p_blueprint_id, 'reassessment', v_baseline_id)
  returning * into v_session;

  return jsonb_build_object('ok', true, 'session_id', v_session.id, 'baseline_session_id', v_baseline_id);
end;
$$;

create or replace function diag_get_skill_estimates(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_node_id', e.skill_node_id, 'point_estimate', e.point_estimate, 'status', e.status,
    'confidence_state', e.confidence_state, 'evidence_count', e.evidence_count,
    'weighted_evidence', e.weighted_evidence, 'consistency_flag', e.consistency_flag,
    'node_level', n.level, 'node_code', n.code, 'node_label', n.label, 'parent_node_id', n.parent_node_id
  )), '[]'::jsonb) into v_result
  from diagnostic_skill_estimates e
  join diagnostic_blueprint_nodes n on n.id = e.skill_node_id
  where e.session_id = p_session_id and e.student_id = p_student_id and e.tenant_id = p_tenant_id;

  return v_result;
end;
$$;

create or replace function diag_get_latest_snapshot(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid, p_snapshot_type text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select jsonb_build_object('id', id, 'snapshot_type', snapshot_type,
           'profile_json', profile_json, 'created_at', created_at)
    into v_result
    from diagnostic_snapshots
   where session_id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id
     and (p_snapshot_type is null or snapshot_type = p_snapshot_type)
   order by created_at desc limit 1;

  return v_result; -- null if none found; caller (TS) treats as "not completed yet"
end;
$$;

create or replace function diag_get_baseline_vs_current(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_current jsonb;
  v_baseline_session_id uuid;
  v_baseline jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select sn.profile_json into v_current from diagnostic_snapshots sn
   where sn.session_id = p_session_id and sn.student_id = p_student_id order by sn.created_at desc limit 1;

  select s.baseline_session_id into v_baseline_session_id from diagnostic_sessions s
   where s.id = p_session_id and s.student_id = p_student_id and s.tenant_id = p_tenant_id;

  if v_baseline_session_id is not null then
    select sn.profile_json into v_baseline from diagnostic_snapshots sn
     where sn.session_id = v_baseline_session_id and sn.student_id = p_student_id
     order by sn.created_at desc limit 1;
  end if;

  return jsonb_build_object('current', v_current, 'baseline', v_baseline,
    'has_baseline', v_baseline is not null);
end;
$$;

create or replace function diag_get_evidence_trail(
  p_tenant_id uuid, p_student_id uuid, p_skill_node_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'response_id', r.id, 'is_correct', r.is_correct, 'duration_ms', r.duration_ms,
    'expected_duration_ms', r.expected_duration_ms, 'confidence', r.confidence,
    'hint_used', r.hint_used, 'question_difficulty', r.question_difficulty,
    'evidence_weight', ev.evidence_weight, 'timing_classification', ev.timing_classification,
    'quality_flags', ev.quality_flags, 'created_at', r.created_at
  ) order by r.created_at), '[]'::jsonb) into v_result
  from diagnostic_responses r
  join diagnostic_evidence ev on ev.response_id = r.id
  where r.session_id = p_session_id and r.student_id = p_student_id and r.tenant_id = p_tenant_id
    and r.skill_node_id = p_skill_node_id;

  return v_result;
end;
$$;

create or replace function diag_record_recommendations(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid, p_recommendations jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rec jsonb; v_count integer := 0;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  delete from diagnostic_recommendations where session_id = p_session_id and student_id = p_student_id;

  for v_rec in select * from jsonb_array_elements(p_recommendations) loop
    insert into diagnostic_recommendations (
      tenant_id, session_id, student_id, skill_node_id, priority,
      recommended_action, evidence_confidence, rationale
    ) values (
      p_tenant_id, p_session_id, p_student_id, (v_rec->>'skill_node_id')::uuid,
      v_rec->>'priority', v_rec->>'recommended_action',
      (v_rec->>'evidence_confidence')::diagnostic_confidence_state, v_rec->>'rationale'
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

create or replace function diag_get_recommendations(
  p_tenant_id uuid, p_student_id uuid, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  perform set_config('app.current_student_id', p_student_id::text, true);
  perform set_config('app.current_tenant_id', p_tenant_id::text, true);

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_node_id', skill_node_id, 'priority', priority, 'recommended_action', recommended_action,
    'evidence_confidence', evidence_confidence, 'rationale', rationale
  ) order by case priority when 'high' then 0 when 'medium' then 1 else 2 end), '[]'::jsonb)
  into v_result
  from diagnostic_recommendations
  where session_id = p_session_id and student_id = p_student_id and tenant_id = p_tenant_id;

  return v_result;
end;
$$;

-- ============================================================
-- GRANTS — diag_app gets EXECUTE only, nothing on the base tables
-- ============================================================

grant execute on function diag_start_or_resume_session(uuid, uuid, uuid, text) to diag_app;
grant execute on function diag_get_session_state(uuid, uuid, uuid) to diag_app;
grant execute on function diag_save_working_state(uuid, uuid, uuid, jsonb) to diag_app;
grant execute on function diag_submit_response(uuid, uuid, uuid, jsonb, jsonb, jsonb) to diag_app;
grant execute on function diag_pause_session(uuid, uuid, uuid, jsonb) to diag_app;
grant execute on function diag_resume_session(uuid, uuid, uuid) to diag_app;
grant execute on function diag_abandon_or_expire_session(uuid, uuid, uuid, text) to diag_app;
grant execute on function diag_complete_session(uuid, uuid, uuid, jsonb) to diag_app;
grant execute on function diag_start_reassessment(uuid, uuid, uuid) to diag_app;
grant execute on function diag_get_skill_estimates(uuid, uuid, uuid) to diag_app;
grant execute on function diag_get_latest_snapshot(uuid, uuid, uuid, text) to diag_app;
grant execute on function diag_get_baseline_vs_current(uuid, uuid, uuid) to diag_app;
grant execute on function diag_get_evidence_trail(uuid, uuid, uuid, uuid) to diag_app;
grant execute on function diag_record_recommendations(uuid, uuid, uuid, jsonb) to diag_app;
grant execute on function diag_get_recommendations(uuid, uuid, uuid) to diag_app;

-- Shared, non-per-student reference data: plain SELECT is fine.
grant select on diagnostic_blueprints, diagnostic_blueprint_nodes to diag_app;

-- Fixture stand-ins for existing ACEAPT tables (test-only, see 001 header).
grant select on _fixture_students, _fixture_questions to diag_app;

commit;
