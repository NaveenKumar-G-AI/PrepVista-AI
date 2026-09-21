#!/usr/bin/env bash
# Exercises the RLS policies against real Postgres with two simulated
# students and a simulated service-role backend. This is PHASE 76's
# "cross-student access" security test, actually executed, not eyeballed.
#
# IMPORTANT: this must run as a non-superuser role that does NOT own the
# tables. Postgres superusers and table owners bypass RLS entirely,
# regardless of policy — running this as the migration/admin role would
# silently "pass" even with broken policies. app_user below mirrors the
# `authenticated` / `service_role` Postgres roles Supabase actually uses,
# neither of which is a superuser.
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-localtest}"
ADMIN_PSQL="psql -h localhost -U app_admin -d codeforge_mastery -t -A"

echo "--- one-time setup: create a non-superuser, non-owner role to test as ---"
$ADMIN_PSQL -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login password 'localtest' nosuperuser;
  end if;
end $$;
grant usage on schema public, auth to app_user;
grant select, insert, update on all tables in schema public to app_user;
grant execute on all functions in schema auth to app_user;
grant execute on function is_tpo_for_student(uuid) to app_user;
SQL

export PGPASSWORD=localtest
PSQL="psql -h localhost -U app_user -d codeforge_mastery -t -A"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }
# Robust against however many SET/INSERT-completion tag lines surround the
# actual value — greps for the value's shape instead of counting lines.
extract_uuid() { printf '%s\n' "$1" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1; }
extract_count() { printf '%s\n' "$1" | grep -E '^[0-9]+$' | tail -1; }

echo "--- seeding (as app_user, simulating the service_role backend path) ---"
RAW_A=$($PSQL -c "insert into students (email) values ('a@test.dev') returning id;")
RAW_B=$($PSQL -c "insert into students (email) values ('b@test.dev') returning id;")
STUDENT_A=$(extract_uuid "$RAW_A")
STUDENT_B=$(extract_uuid "$RAW_B")

RAW_SKILL=$($PSQL -c "
  set local request.jwt.claim.role = 'service_role';
  insert into skill_nodes (key, name, category) values ('arrays', 'Arrays', 'DATA_STRUCTURES') returning id;
")
SKILL=$(extract_uuid "$RAW_SKILL")

$PSQL -c "
  set local request.jwt.claim.role = 'service_role';
  insert into student_skill_evidence (student_id, skill_id, source, difficulty, passed)
  values ('$STUDENT_A', '$SKILL', 'PRACTICE', 'easy', true);
" > /dev/null

echo "--- test 1: student A can read their own evidence ---"
RAW_COUNT_A=$($PSQL -c "
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '$STUDENT_A';
  select count(*) from student_skill_evidence where student_id = '$STUDENT_A';
")
COUNT_A=$(extract_count "$RAW_COUNT_A")
[ "$COUNT_A" -eq 1 ] && pass "student A sees their own evidence (count=$COUNT_A)" || fail "student A could not see their own evidence (got '$COUNT_A')"

echo "--- test 2: student B CANNOT read student A's evidence (cross-student isolation) ---"
RAW_COUNT_B=$($PSQL -c "
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '$STUDENT_B';
  select count(*) from student_skill_evidence where student_id = '$STUDENT_A';
")
COUNT_B=$(extract_count "$RAW_COUNT_B")
[ "$COUNT_B" -eq 0 ] && pass "student B sees zero rows of student A's evidence (count=$COUNT_B)" || fail "SECURITY FAILURE: student B could read student A's evidence (got '$COUNT_B')"

echo "--- test 2b: student B querying without a student_id filter also sees nothing of A's ---"
RAW_COUNT_ALL_B=$($PSQL -c "
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '$STUDENT_B';
  select count(*) from student_skill_evidence;
")
COUNT_ALL_B=$(extract_count "$RAW_COUNT_ALL_B")
[ "$COUNT_ALL_B" -eq 0 ] && pass "student B's unfiltered query still returns 0 rows (RLS filters, not the WHERE clause)" || fail "SECURITY FAILURE: unfiltered query leaked $COUNT_ALL_B row(s) to student B"

echo "--- test 3: an authenticated student CANNOT insert evidence directly (no client mastery manipulation) ---"
set +e
$PSQL -c "
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '$STUDENT_A';
  insert into student_skill_evidence (student_id, skill_id, source, difficulty, passed)
  values ('$STUDENT_A', '$SKILL', 'PRACTICE', 'hard', true);
" > /tmp/insert_attempt.log 2>&1
INSERT_RESULT=$?
set -e
if [ $INSERT_RESULT -ne 0 ] && grep -qi "row-level security" /tmp/insert_attempt.log; then
  pass "client-side evidence insert was rejected by RLS"
else
  cat /tmp/insert_attempt.log
  fail "SECURITY FAILURE: an authenticated client was able to insert evidence directly"
fi

echo "--- test 4: service_role CAN insert evidence (trusted backend path still works) ---"
$PSQL -c "
  set local request.jwt.claim.role = 'service_role';
  insert into student_skill_evidence (student_id, skill_id, source, difficulty, passed)
  values ('$STUDENT_B', '$SKILL', 'PRACTICE', 'medium', true);
" > /dev/null
pass "service_role insert succeeded"

echo "--- test 5: a TPO with explicit access CAN read their assigned student; without it, CANNOT ---"
$ADMIN_PSQL -c "insert into tpo_student_access (tpo_user_id, student_id) values ('00000000-0000-0000-0000-000000000099', '$STUDENT_A');" > /dev/null
RAW_TPO_YES=$($PSQL -c "
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
  select count(*) from student_skill_evidence where student_id = '$STUDENT_A';
")
RAW_TPO_NO=$($PSQL -c "
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
  select count(*) from student_skill_evidence where student_id = '$STUDENT_B';
")
TPO_YES=$(extract_count "$RAW_TPO_YES")
TPO_NO=$(extract_count "$RAW_TPO_NO")
[ "$TPO_YES" -eq 1 ] && pass "authorized TPO sees their assigned student's evidence" || fail "TPO with explicit access could not see assigned student (got '$TPO_YES')"
[ "$TPO_NO" -eq 0 ] && pass "same TPO sees 0 rows for a student they are NOT assigned to" || fail "SECURITY FAILURE: TPO saw an unassigned student's evidence (got '$TPO_NO')"

echo ""
echo "ALL RLS ISOLATION TESTS PASSED"
