#!/usr/bin/env bash
# One-command local setup: installs dependencies, waits for PostgreSQL to be
# reachable, then applies migrations. Intended for a clean local checkout;
# CI/Docker environments should compose these steps explicitly instead.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo "==> Installing backend dependencies"
cd "$BACKEND_DIR"
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -e ".[dev]"

if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "==> Creating .env from .env.example"
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

echo "==> Waiting for PostgreSQL"
export $(grep -v '^#' "$REPO_ROOT/.env" | xargs -d '\n' 2>/dev/null || true)
ATTEMPTS=0
until .venv/bin/python -c "
import socket, os, sys
host = os.environ.get('POSTGRES_HOST', 'localhost')
port = int(os.environ.get('POSTGRES_PORT', 5432))
s = socket.socket()
s.settimeout(1)
try:
    s.connect((host, port))
except OSError:
    sys.exit(1)
"; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "PostgreSQL did not become reachable in time." >&2
    exit 1
  fi
  sleep 1
done

echo "==> Applying database migrations"
.venv/bin/python -m alembic upgrade head

echo "==> Done. Run 'make dev' to start the API."
