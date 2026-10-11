#!/bin/bash
set -e

echo "Starting PrepVista Deployment Launcher..."

# 1. Validate environment
if [ -z "$MIGRATION_DATABASE_URL" ]; then
    echo "ERROR: MIGRATION_DATABASE_URL missing"
    exit 1
fi
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL missing"
    exit 1
fi

# 2. Run Python Bootstrap/Migration Module
echo "Running Bootstrap Module..."
python -m app.database.bootstrap

# 3. Unset MIGRATION_DATABASE_URL to protect runtime
echo "Unsetting MIGRATION_DATABASE_URL..."
unset MIGRATION_DATABASE_URL

# 4. Exec Gunicorn
echo "Starting FastAPI via Gunicorn..."
exec gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers ${WEB_CONCURRENCY:-2} --bind 0.0.0.0:${PORT:-8000} --timeout 120 --keep-alive 65 --graceful-timeout 30 --preload --access-logfile - --error-logfile -
