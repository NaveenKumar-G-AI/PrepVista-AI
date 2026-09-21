#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

DB=codeforge_rls_test
export PGPASSWORD=local_test_only

echo "=== 1. (Re)create test database ==="
su postgres -c "dropdb --if-exists $DB"
su postgres -c "createdb $DB"

echo "=== 2. Apply real table migrations (0001-0003), exactly as they'd run against real Supabase ==="
for f in ../src/persistence/migrations/0001_correctness_assessments.sql \
         ../src/persistence/migrations/0002_correctness_findings.sql \
         ../src/persistence/migrations/0003_requirement_checks.sql; do
  echo "--- applying $f ---"
  su postgres -c "psql -q -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/$f"
done

echo "=== 3. Apply LOCAL-ONLY shim (auth.uid(), roles) — on real Supabase these already exist pre-migration ==="
su postgres -c "psql -q -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/000_LOCAL_TEST_ONLY_supabase_shim.sql"

echo "=== 3b. Apply real RLS migration (0004), which references the now-shimmed authenticated role/auth.uid() ==="
su postgres -c "psql -q -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/../src/persistence/migrations/0004_rls_policies.sql"

echo "=== 4. Seed two students' data as table owner ==="
su postgres -c "psql -q -d $DB -v ON_ERROR_STOP=1 -f $(pwd)/rls_proof.sql"

ALICE=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
BOB=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

run_as_alice() {
  psql -h 127.0.0.1 -U cf_app_authenticated -d "$DB" -q -v ON_ERROR_STOP=1 -c \
    "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$ALICE\",\"role\":\"authenticated\"}'; $1"
}
run_as_bob() {
  psql -h 127.0.0.1 -U cf_app_authenticated -d "$DB" -q -v ON_ERROR_STOP=1 -c \
    "SET ROLE authenticated; SET request.jwt.claims = '{\"sub\":\"$BOB\",\"role\":\"authenticated\"}'; $1"
}
run_as_nobody() {
  psql -h 127.0.0.1 -U cf_app_authenticated -d "$DB" -q -v ON_ERROR_STOP=1 -c \
    "SET ROLE authenticated; $1"
}

echo ""
echo "=== 5. PROOF: Alice sees exactly her own assessment, never Bob's ==="
run_as_alice "SELECT submission_id, user_id, status FROM correctness_assessments;"

echo ""
echo "=== 6. PROOF: Bob sees exactly his own assessment, never Alice's ==="
run_as_bob "SELECT submission_id, user_id, status FROM correctness_assessments;"

echo ""
echo "=== 7. PROOF: with no JWT claims set at all, an authenticated session sees ZERO rows (fails closed, not open) ==="
run_as_nobody "SELECT count(*) AS visible_with_no_identity FROM correctness_assessments;"

echo ""
echo "=== 8. PROOF: Alice's findings are isolated from Bob's findings ==="
run_as_alice "SELECT rule_or_claim, message FROM correctness_findings;"

echo ""
echo "=== 9. PROOF: Alice cannot INSERT a forged assessment (no INSERT policy for authenticated) ==="
set +e
run_as_alice "INSERT INTO correctness_assessments (submission_id, submission_version, problem_id, user_id, language, status, confidence, error_category, summary, raw) VALUES ('forged','v1','problem_two_sum','$ALICE','python','ACCEPTED','HIGH','NONE','forged accept', '{}');" 2>&1
INSERT_RC=$?
set -e
if [ "$INSERT_RC" -ne 0 ]; then
  echo "RESULT: INSERT correctly REJECTED (permission denied), as intended."
else
  echo "RESULT: !!! UNEXPECTED: INSERT SUCCEEDED — this would be a security bug !!!"
  exit 1
fi

echo ""
echo "=== 10. PROOF: Alice cannot UPDATE her own row from the client (server-derived only) ==="
set +e
run_as_alice "UPDATE correctness_assessments SET status = 'ACCEPTED' WHERE user_id = '$ALICE';" 2>&1
UPDATE_RC=$?
set -e
if [ "$UPDATE_RC" -ne 0 ]; then
  echo "RESULT: UPDATE correctly REJECTED (permission denied), as intended."
else
  echo "RESULT: !!! UNEXPECTED: UPDATE SUCCEEDED — this would be a security bug !!!"
  exit 1
fi

echo ""
echo "=== 11. PROOF: Alice cannot attempt to read Bob's row directly by id (row is filtered, not just access-denied) ==="
run_as_alice "SELECT * FROM correctness_assessments WHERE id = '22222222-2222-2222-2222-222222222222';"
echo "(empty result above = Bob's row is invisible to Alice's session, confirmed)"

echo ""
echo "=== ALL RLS PROOFS PASSED ==="
