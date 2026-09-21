#!/usr/bin/env bash
# =============================================================================
# Runs the Hint Ladder RLS verification against a local Postgres instance.
#
# This is exactly the procedure used to verify supabase/migrations/0001_*.sql
# in the sandbox this project was built in (see README.md "RLS verification"
# for the actual PASS/FAIL output that run produced). Re-run it any time the
# migration changes.
#
# Requires: a Postgres server you can connect to as a superuser (local dev
# Postgres, or `supabase start`'s local stack). Does NOT run against your
# production database — point DB_NAME at a throwaway/local one.
# =============================================================================
set -euo pipefail

DB_NAME="${1:-hint_ladder_rls_test}"
PSQL="psql -v ON_ERROR_STOP=1"

echo "==> Creating database ${DB_NAME} (if it doesn't already exist)"
createdb "${DB_NAME}" 2>/dev/null || true

echo "==> Installing a minimal auth.uid() stand-in matching Supabase's real implementation"
$PSQL -d "${DB_NAME}" <<SQL
create schema if not exists auth;
create or replace function auth.uid() returns uuid as \$\$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
\$\$ language sql stable;
SQL

echo "==> Applying the Hint Ladder migration"
$PSQL -d "${DB_NAME}" -f "$(dirname "$0")/../migrations/0001_hint_ladder_schema.sql"

echo "==> Creating a non-superuser application role (RLS does not apply to superusers/owners)"
$PSQL -d "${DB_NAME}" <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end \$\$;
grant usage on schema public to app_user;
grant select, insert, update on hint_sessions to app_user;
grant select, insert on hint_events to app_user;
SQL

echo "==> Resetting any leftover test data from a previous run"
$PSQL -d "${DB_NAME}" -c "TRUNCATE hint_events, hint_sessions;"

echo "==> Running RLS verification (expect 10x PASS, 0x FAIL)"
$PSQL -d "${DB_NAME}" -f "$(dirname "$0")/rls_test.sql" 2>&1 | grep -E "PASS|FAIL|SEED:|ERROR"

echo ""
echo "==> Done. Every 'ERROR' line above is EXPECTED — it's Postgres rejecting"
echo "    a malicious/cross-student write attempt, which the corresponding"
echo "    PASS line right after it confirms actually held."
