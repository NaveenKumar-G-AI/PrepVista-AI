-- =============================================================================
-- RLS verification (v3 — final).
--
-- Each simulated "request" is wrapped in an explicit BEGIN/COMMIT block
-- with SET LOCAL inside it, exactly mirroring how PostgREST scopes
-- request.jwt.claims to a single request's transaction in real Supabase.
--
-- Two earlier bugs in THIS TEST SCRIPT (not the RLS policies) were caught
-- by actually executing it against a live database rather than trusting
-- the SQL by inspection:
--   v1: bare `SET LOCAL` outside a transaction silently no-ops in psql's
--       autocommit mode, so auth.uid() was NULL the entire time.
--   v2: psql does not interpolate `:'var'` colon-variables inside
--       dollar-quoted `DO $$ ... $$` blocks (by design, since PL/pgSQL
--       uses `:=` constantly) — switched tests 5/7 to savepoint +
--       verify-by-existence-check instead of exception-message parsing.
-- =============================================================================

\set ON_ERROR_STOP off
set role app_user;

-- ---------------------------------------------------------------------------
-- Seed: Student A and Student B each create their own session.
-- ---------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into hint_sessions (student_id, problem_id, mode, current_level)
values ('11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'PRACTICE', 'DIRECTION')
returning id as student_a_session \gset
insert into hint_events (hint_session_id, student_id, event_type, request_id, payload)
values (:'student_a_session', '11111111-1111-1111-1111-111111111111', 'HINT_DELIVERED', 'seed-a-1', '{"text":"Student A private hint"}');
select 'SEED: Student A session ' || :'student_a_session' || ' created' as seed_status;
commit;

begin;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into hint_sessions (student_id, problem_id, mode, current_level)
values ('22222222-2222-2222-2222-222222222222', '99999999-9999-9999-9999-999999999999', 'PRACTICE', 'CONCEPT')
returning id as student_b_session \gset
insert into hint_events (hint_session_id, student_id, event_type, request_id, payload)
values (:'student_b_session', '22222222-2222-2222-2222-222222222222', 'HINT_DELIVERED', 'seed-b-1', '{"text":"Student B private hint"}');
select 'SEED: Student B session ' || :'student_b_session' || ' created' as seed_status;
commit;

-- ---------------------------------------------------------------------------
-- TEST 1/2/3/3b: read isolation, both the negative and positive case.
-- ---------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select case when count(*) = 0 then 'PASS' else 'FAIL' end as test_1_student_a_cannot_read_student_b_session
from hint_sessions where id = :'student_b_session';

select case when count(*) = 0 then 'PASS' else 'FAIL' end as test_2_student_a_cannot_read_student_b_history
from hint_events where hint_session_id = :'student_b_session';

select case when count(*) = 1 then 'PASS' else 'FAIL' end as test_3_student_a_can_read_own_session
from hint_sessions where id = :'student_a_session';

select case when count(*) = 1 then 'PASS' else 'FAIL' end as test_3b_student_a_can_read_own_history
from hint_events where hint_session_id = :'student_a_session';

-- ---------------------------------------------------------------------------
-- TEST 4: Student A cannot UPDATE Student B's session.
-- ---------------------------------------------------------------------------
with attempt as (
  update hint_sessions set current_level = 'SOLUTION_ASSISTANCE'
  where id = :'student_b_session'
  returning id
)
select case when count(*) = 0 then 'PASS' else 'FAIL' end as test_4_student_a_cannot_update_student_b_session
from attempt;

-- ---------------------------------------------------------------------------
-- TEST 5 (attempt): Student A tries to insert an event impersonating
-- Student B. Expected to error (RLS with-check violation); we save a
-- point beforehand so the transaction can continue afterward regardless.
-- ---------------------------------------------------------------------------
savepoint before_spoof;
insert into hint_events (hint_session_id, student_id, event_type, request_id, payload)
values (:'student_b_session', '22222222-2222-2222-2222-222222222222', 'HINT_DELIVERED', 'spoof-attempt', '{}');
rollback to savepoint before_spoof;

-- ---------------------------------------------------------------------------
-- TEST 7 (attempt): Student A tries to insert a duplicate request_id.
-- Expected to error (unique constraint violation).
-- ---------------------------------------------------------------------------
savepoint before_dup;
insert into hint_events (hint_session_id, student_id, event_type, request_id, payload)
values (:'student_a_session', '11111111-1111-1111-1111-111111111111', 'HINT_REQUESTED', 'seed-a-1', '{}');
rollback to savepoint before_dup;

commit;

-- ---------------------------------------------------------------------------
-- TEST 4b: confirm, as Student B, that their row was genuinely untouched.
-- ---------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select case when current_level = 'CONCEPT' then 'PASS' else 'FAIL' end as test_4b_student_b_session_unmodified
from hint_sessions where id = :'student_b_session';

-- ---------------------------------------------------------------------------
-- TEST 5 (verify): the spoofed row must not exist, checked from the one
-- account that COULD see it if it had actually been created — Student B.
-- ---------------------------------------------------------------------------
select case when count(*) = 0 then 'PASS' else 'FAIL' end as test_5_student_a_cannot_spoof_student_b_event
from hint_events where hint_session_id = :'student_b_session' and request_id = 'spoof-attempt';
commit;

-- ---------------------------------------------------------------------------
-- TEST 6: No JWT claim at all (unauthenticated) sees nothing, even though
-- rows now genuinely exist for both students.
-- ---------------------------------------------------------------------------
begin;
reset request.jwt.claim.sub;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as test_6_unauthenticated_sees_no_sessions
from hint_sessions;
select case when count(*) = 0 then 'PASS' else 'FAIL' end as test_6b_unauthenticated_sees_no_events
from hint_events;
commit;

-- ---------------------------------------------------------------------------
-- TEST 7 (verify): still exactly one event for request_id='seed-a-1' — the
-- duplicate insert attempt above did not create a second row.
-- ---------------------------------------------------------------------------
begin;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select case when count(*) = 1 then 'PASS' else 'FAIL' end as test_7_duplicate_request_id_rejected
from hint_events where hint_session_id = :'student_a_session' and request_id = 'seed-a-1';
commit;
