#!/bin/bash
set -e

echo "Starting PrepVista Deployment Launcher..."

# 1. Validate environment
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL missing"
    exit 1
fi

# 2. Exec Gunicorn
echo "Starting FastAPI via Gunicorn..."
exec gunicorn app.main:app --worker-class uvicorn.workers.UvicornWorker --workers ${WEB_CONCURRENCY:-2} --bind 0.0.0.0:${PORT:-8000} --timeout 120 --keep-alive 65 --graceful-timeout 30 --preload --access-logfile - --error-logfile -
