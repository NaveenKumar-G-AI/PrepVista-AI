.PHONY: install dev test test-unit test-integration lint format typecheck \
        migrate migration docker-up docker-down docker-build

BACKEND_DIR := backend
VENV := $(BACKEND_DIR)/.venv
PYTHON := $(VENV)/bin/python

install: ## Create the virtualenv and install backend dependencies (dev extras included)
	cd $(BACKEND_DIR) && uv venv .venv --python 3.12
	cd $(BACKEND_DIR) && uv pip install --python .venv/bin/python -e ".[dev]"

dev: ## Run the API with auto-reload
	cd $(BACKEND_DIR) && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test: ## Run the full test suite
	cd $(BACKEND_DIR) && .venv/bin/python -m pytest

test-unit: ## Run unit tests only
	cd $(BACKEND_DIR) && .venv/bin/python -m pytest tests/unit

test-integration: ## Run integration tests only (requires a reachable PostgreSQL)
	cd $(BACKEND_DIR) && .venv/bin/python -m pytest tests/integration

lint: ## Run ruff lint checks
	cd $(BACKEND_DIR) && .venv/bin/ruff check .

format: ## Auto-format code with ruff
	cd $(BACKEND_DIR) && .venv/bin/ruff format .

typecheck: ## Run mypy strict type checking
	cd $(BACKEND_DIR) && .venv/bin/mypy app

migrate: ## Apply all pending Alembic migrations
	cd $(BACKEND_DIR) && .venv/bin/python -m alembic upgrade head

migration: ## Autogenerate a new Alembic migration; usage: make migration name="add projects table"
	cd $(BACKEND_DIR) && .venv/bin/python -m alembic revision --autogenerate -m "$(name)"

docker-build: ## Build the backend Docker image
	docker compose build

docker-up: ## Start backend + PostgreSQL via Docker Compose
	docker compose up -d

docker-down: ## Stop and remove Docker Compose services
	docker compose down
