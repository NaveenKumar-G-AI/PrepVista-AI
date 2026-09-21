#!/usr/bin/env bash
# Local/dev convenience: provisions the aceapt51 roles + database as the
# Postgres superuser, then runs the migration. In a real ACEAPT deployment,
# role/database provisioning is normally a one-time DBA/infra step — this
# script exists so the module is runnable standalone.
set -euo pipefail

PGSUPERUSER="${PGSUPERUSER:-postgres}"
PGDATABASE_NAME="${PGDATABASE:-aceapt51}"

echo "→ Creating database '${PGDATABASE_NAME}' (if missing)..."
psql -U "$PGSUPERUSER" -tc "SELECT 1 FROM pg_database WHERE datname = '${PGDATABASE_NAME}'" | grep -q 1 \
  || psql -U "$PGSUPERUSER" -c "CREATE DATABASE ${PGDATABASE_NAME} OWNER aceapt51_owner"

echo "→ Applying db/00-roles.sql..."
psql -U "$PGSUPERUSER" -d "$PGDATABASE_NAME" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../db/00-roles.sql"

echo "→ Granting connect to app/service roles..."
psql -U "$PGSUPERUSER" -d "$PGDATABASE_NAME" -c \
  "GRANT CONNECT ON DATABASE ${PGDATABASE_NAME} TO aceapt51_app, aceapt51_service;"

echo "→ Running migration (npm run db:migrate)..."
npm run db:migrate

echo "✔ Database ready."
