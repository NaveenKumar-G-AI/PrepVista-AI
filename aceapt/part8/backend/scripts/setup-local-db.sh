#!/usr/bin/env bash
# ============================================================
# ACEAPT FEATURE 8 - local Postgres bootstrap
#
# Creates:
#   - aceapt_service : owns the schema, BYPASSRLS. Used for migrations,
#                       seeding, and cross-student background jobs.
#   - aceapt_app      : RLS-bound. Used by the per-request API pool.
#   - aceapt_dev      : the database, owned by aceapt_service.
#
# Safe to re-run - drops and recreates cleanly. Requires a Postgres
# superuser to run against (adjust PSQL_SUPERUSER if not "postgres").
#
# Usage:
#   ./scripts/setup-local-db.sh
# Then update your .env's DATABASE_URL / SERVICE_DATABASE_URL passwords
# to match APP_PASSWORD / SERVICE_PASSWORD below (or edit those first).
# ============================================================
set -euo pipefail

PSQL_SUPERUSER="${PSQL_SUPERUSER:-postgres}"
APP_PASSWORD="${ACEAPT_APP_PASSWORD:-aceapt_app_local_pw}"
SERVICE_PASSWORD="${ACEAPT_SERVICE_PASSWORD:-aceapt_service_local_pw}"

run_psql() {
  # Uses `sudo -u postgres psql` when available (typical Linux install);
  # falls back to plain `psql -U postgres` (e.g. Homebrew/macOS, or when
  # already running as the postgres OS user).
  if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
    sudo -u "$PSQL_SUPERUSER" psql "$@"
  else
    psql -U "$PSQL_SUPERUSER" "$@"
  fi
}

echo "[setup-local-db] terminating any existing connections to aceapt_dev..."
run_psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='aceapt_dev' AND pid <> pg_backend_pid();" || true

echo "[setup-local-db] dropping any existing db/roles..."
run_psql -c "DROP DATABASE IF EXISTS aceapt_dev;"
run_psql -c "DROP OWNED BY aceapt_app;" || true
run_psql -c "DROP USER IF EXISTS aceapt_app;" || true
run_psql -c "DROP OWNED BY aceapt_service;" || true
run_psql -c "DROP USER IF EXISTS aceapt_service;" || true

echo "[setup-local-db] creating roles..."
run_psql -c "CREATE ROLE aceapt_service WITH LOGIN PASSWORD '${SERVICE_PASSWORD}' BYPASSRLS CREATEDB;"
run_psql -c "CREATE ROLE aceapt_app WITH LOGIN PASSWORD '${APP_PASSWORD}';"

echo "[setup-local-db] creating database..."
run_psql -c "CREATE DATABASE aceapt_dev OWNER aceapt_service;"
run_psql -d aceapt_dev -c "GRANT CONNECT ON DATABASE aceapt_dev TO aceapt_app;"
run_psql -d aceapt_dev -c "GRANT USAGE ON SCHEMA public TO aceapt_app;"

echo "[setup-local-db] done. Now run: npm run migrate && npm run seed"
echo ""
echo "Make sure backend/.env has:"
echo "  DATABASE_URL=postgresql://aceapt_app:${APP_PASSWORD}@localhost:5432/aceapt_dev"
echo "  SERVICE_DATABASE_URL=postgresql://aceapt_service:${SERVICE_PASSWORD}@localhost:5432/aceapt_dev"
