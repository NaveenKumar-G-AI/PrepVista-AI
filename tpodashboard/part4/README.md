# Autonomous Engineer — Part 1 + Part 2 + Part 3 + Part 4

> **Status: Part 1 (Foundation) + Part 2 (Configuration) + Part 3 (Database
> & Domain Data Layer) + Part 4 (AI Model Provider System) complete.** This
> repository contains the backend foundation (API, logging, error
> handling, Docker dev environment, tests), a centralized secret-aware
> configuration system, the full persistent data layer (users,
> organizations, projects, tasks, agent runs, and the rest of the
> execution-history schema), and a provider-independent AI connectivity
> layer (Gemini, Groq, Cerebras, OpenRouter, plus a deterministic mock for
> tests). **The autonomous AI engineer itself — planner, coding agent,
> sandbox executor, evaluator, orchestration — does not exist yet.** Those
> are later parts; nothing yet calls the AI provider layer or reads/writes
> the schema described in `docs/database.md`.

## 1. Product description

The long-term goal of this project: a user gives a software-development
goal, and an autonomous AI engineering system continuously plans, writes,
executes, tests, evaluates, repairs, reviews, checkpoints, and eventually
deploys software with minimal human intervention.

Part 1 builds the clean, testable, production-oriented foundation that the
rest of the system will be built on.

## 2. Current project status

| Area | Status |
|---|---|
| API foundation (FastAPI, versioning, health checks) | ✅ Implemented |
| Centralized, sectioned, secret-aware configuration | ✅ Implemented |
| Logging, centralized error handling | ✅ Implemented |
| Database domain schema (14 tables — see `docs/database.md`) | ✅ Implemented |
| AI provider layer (Gemini/Groq/Cerebras/OpenRouter/Mock — see `docs/ai-providers.md`) | ✅ Implemented |
| Docker development environment | ✅ Implemented |
| Tests (unit + integration) | ✅ Implemented, all passing |
| Model router (provider/cost-aware selection) | ❌ Not implemented (future part) |
| Planner / coding agent / sandbox / orchestration | ❌ Not implemented (future parts) |
| Projects/tasks service layer + API (CRUD) | ❌ Not implemented (future part) |
| Web dashboard | ❌ Not implemented (future part) |
| Authentication | ❌ Not implemented (future part) |

## 3. Architecture overview

The backend is a modular monolith exposing a versioned HTTP API. Routes
stay thin and delegate to a (currently empty, reserved) service layer.
See [`docs/architecture.md`](docs/architecture.md) for the full breakdown,
[`docs/database.md`](docs/database.md) for the domain data layer
(entity-relationship diagram, ID/timestamp/state conventions, cascade
behavior, JSONB discipline, migration and concurrency strategy), and
[`docs/ai-providers.md`](docs/ai-providers.md) for the AI provider
abstraction (interface, normalization, error handling, streaming, the
mock provider, and how to add a new provider).

## 4. Technology stack

- **Backend:** Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.x,
  PostgreSQL, Alembic
- **AI providers:** `google-genai` (Gemini), `groq`, `cerebras-cloud-sdk`,
  `openai` (used for OpenRouter per their own integration guidance) — see
  `docs/ai-providers.md`
- **Testing:** pytest, pytest-asyncio, httpx
- **Quality:** Ruff (lint + format), MyPy (strict), pre-commit
- **Dependency management:** [uv](https://docs.astral.sh/uv/)
- **Containerization:** Docker, Docker Compose

## 5. Repository structure

```
autonomous-engineer/
├── backend/
│   ├── app/
│   │   ├── ai/                  # provider-independent AI connectivity layer
│   │   │   │                    #   (Gemini/Groq/Cerebras/OpenRouter/Mock — see docs/ai-providers.md)
│   │   │   └── providers/       # concrete adapters + shared OpenAI-compatible translation
│   │   ├── api/v1/            # versioned routes (thin, no business logic)
│   │   ├── core/               # config, logging, exceptions
│   │   ├── db/                 # engine, session, declarative base, models/
│   │   │                       #   (14 domain tables — see docs/database.md)
│   │   ├── schemas/             # Pydantic request/response contracts
│   │   ├── services/            # business logic (empty — reserved)
│   │   ├── workers/             # background entry points (empty — reserved)
│   │   └── main.py              # application factory
│   ├── migrations/              # Alembic environment + versions
│   ├── tests/{unit,integration}/
│   ├── alembic.ini
│   └── pyproject.toml
├── frontend/                    # placeholder — see frontend/README.md
├── worker/                      # placeholder — see worker/README.md
├── sandbox/                     # placeholder — see sandbox/README.md
├── scripts/bootstrap.sh         # one-command local setup
├── docs/
│   ├── architecture.md
│   ├── configuration.md
│   ├── database.md
│   └── ai-providers.md
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── .env.example
```

## 6. Local setup

Requirements: Python 3.12+, [uv](https://docs.astral.sh/uv/), a reachable
PostgreSQL instance (local install or Docker).

```bash
git clone <this-repo>
cd autonomous-engineer
cp .env.example .env          # adjust values as needed
make install                  # creates backend/.venv and installs deps
```

Or run the whole thing in one step: `./scripts/bootstrap.sh`

## 7. Environment configuration

Configuration is centralized in `backend/app/core/config.py` and organized
into typed sections (`app`, `api`, `database`, `cors`, `logging`, `worker`,
`ai`, `security`, `sandbox`, `git`, `browser`, `observability`) — no
subsystem should ever call `os.getenv(...)` directly. See
[`docs/configuration.md`](docs/configuration.md) for the full variable
reference, and `.env.example` for safe placeholder values. Never commit a
real `.env`. `APP_ENV=production` with `DEBUG=true` is rejected at startup
by design, and `APP_ENV=production` without `SECRET_KEY` set is rejected
too.

## 8. Database setup

```bash
make migrate                  # applies all Alembic migrations
```

Part 1 ships one intentionally empty baseline migration — there is no
domain schema yet, only the proven infrastructure (connection, session,
migration workflow) that later parts will build real tables on top of.

To create a new migration once models exist:

```bash
make migration name="add projects table"
```

## 9. Docker setup

```bash
make docker-build
make docker-up                # starts backend + PostgreSQL
make docker-down
```

The backend container waits for PostgreSQL's healthcheck before starting
and exposes its own `/health` healthcheck. The development Docker
environment here is distinct from the future agent execution sandbox — see
`sandbox/README.md`.

> **Note on this environment:** the sandbox this project was built in has
> no Docker daemon available, so the Dockerfile/Compose setup was written
> and reviewed carefully but **could not be executed here**. Please run
> `make docker-build && make docker-up` in an environment with Docker
> installed as part of your own verification. Every other acceptance
> criterion (tests, lint, typecheck, real Postgres connectivity, real
> Alembic migrations, live app + endpoints) was actually executed and
> verified locally.

## 10. Running tests

```bash
make test               # full suite (240 tests)
make test-unit           # unit tests only, no DB required
make test-integration    # integration tests, requires reachable PostgreSQL
```

Integration tests run real queries, real constraint violations, and the
real Alembic migration workflow against a dedicated `autoeng_test_db`
database — none of this is mocked. One test
(`test_full_migration_cycle_against_a_fresh_database`) creates and drops
its own throwaway database to prove the migration workflow from a
genuinely empty database rather than relying on `autoeng_test_db` already
existing; this requires the `POSTGRES_USER` role to have `CREATEDB`
(`ALTER ROLE <user> CREATEDB;`), which is a reasonable dev/CI-only
privilege — it is not required to run the application itself.

## 11. Linting

```bash
make lint      # ruff check
make format    # ruff format
```

## 12. Type checking

```bash
make typecheck   # mypy --strict over app/
```

## 13. Development workflow

```bash
make dev   # uvicorn with auto-reload on http://localhost:8000
```

- Interactive API docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Liveness: `GET /health`
- Readiness (includes DB check): `GET /api/v1/health`

Install `pre-commit` hooks with `pre-commit install` to run ruff/mypy
automatically before each commit.

## 14. Future architecture roadmap

✅ Domain schema (projects, tasks, agent runs, execution history — see
`docs/database.md`) is done as of Part 3. ✅ AI provider connectivity
(Gemini/Groq/Cerebras/OpenRouter + mock, see `docs/ai-providers.md`) is
done as of Part 4. Not implemented yet, in rough build order:

1. Project Manager + Orchestrator services (service layer over the
   existing `app/db/models/`)
2. Planner
3. Task queue + worker runtime
4. Model router (cost/latency-aware provider selection over the Part 4
   provider layer) and coding agent
5. Tool system + execution sandbox
6. Test engine + evaluator + debugger/repair loop
7. Review + Git checkpointing automation
8. Web dashboard (`frontend/`)
9. Authentication, deployment automation, monitoring

Each of these has an explicit, currently-empty extension point already
reserved in the codebase (see `docs/architecture.md` §"Future
extensibility") so none of them should require restructuring what Parts
1–3 established.
