#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-localtest}"
cd "$(dirname "$0")/.."

for f in db/migrations/*.sql; do
  echo "=== Applying $f ==="
  psql -h localhost -U app_admin -d codeforge_mastery -v ON_ERROR_STOP=1 -f "$f"
done
