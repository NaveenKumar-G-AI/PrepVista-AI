#!/usr/bin/env bash
# LOCAL / SANDBOX ONLY. On Supabase, `auth` already exists — just run
# scripts/migrate.sh directly. This script additionally applies the local
# auth.uid()/auth.role() shim BEFORE the RLS migration, since a bare
# Postgres instance has no `auth` schema at all.
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-localtest}"
cd "$(dirname "$0")/.."

for f in db/migrations/000_integration_stubs.sql db/migrations/001_skill_graph.sql db/migrations/002_evidence_and_mastery.sql db/migrations/003_sessions_and_retention.sql db/migrations/004_recommendations.sql; do
  echo "=== Applying $f ==="
  psql -h localhost -U app_admin -d codeforge_mastery -v ON_ERROR_STOP=1 -f "$f"
done

echo "=== Applying db/local_dev_shim.sql (local only) ==="
psql -h localhost -U app_admin -d codeforge_mastery -v ON_ERROR_STOP=1 -f db/local_dev_shim.sql

echo "=== Applying db/migrations/005_rls_policies.sql ==="
psql -h localhost -U app_admin -d codeforge_mastery -v ON_ERROR_STOP=1 -f db/migrations/005_rls_policies.sql
