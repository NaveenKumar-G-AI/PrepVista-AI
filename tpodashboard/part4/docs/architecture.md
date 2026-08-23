# Architecture — Part 1: Foundation

> Configuration architecture specifically (all settings sections, env
> variables, and secret-handling rules) is documented separately in
> [`configuration.md`](configuration.md). This document covers the
> broader system boundaries.

This document describes the architecture of the current codebase (Part 1
only) and the boundaries later parts will build against. It intentionally
does not describe how the planner, coding agent, sandbox, or evaluator will
work internally — those are out of scope until their own parts land.

## System boundaries

```
                         ┌─────────────────────┐
                         │        User          │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
   Part 1 stops here --> │    Web Dashboard      │  (not built yet — frontend/)
                         └──────────┬───────────┘
                                    │ HTTP
                         ┌──────────▼───────────┐
                         │   FastAPI Backend     │  <-- THIS REPOSITORY
                         │  (backend/app)        │
                         │                        │
                         │  api/  -> versioned    │
                         │          HTTP routes   │
                         │  core/ -> config,      │
                         │          logging,      │
                         │          exceptions    │
                         │  db/   -> engine,       │
                         │          sessions,      │
                         │          models         │
                         │  schemas/ -> Pydantic   │
                         │          I/O contracts  │
                         │  services/ -> business  │
                         │          logic (empty)  │
                         │  workers/ -> background │
                         │          entry points   │
                         │          (empty)        │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │     PostgreSQL         │
                         └────────────────────────┘

  Everything below this line is future scope, not implemented in Part 1:

  Project Manager -> Orchestrator -> Planner -> Task Queue -> Coding Agent
  -> Tool System -> Sandbox -> Test Engine -> Evaluator -> Debugger/Repair
  -> Review -> Git Checkpoint -> Deployment / Monitoring
```

## Backend responsibilities (Part 1)

The backend is a modular monolith. Its job today is limited to:

- Exposing a versioned, documented HTTP API (`/api/v1/...`) and a root
  liveness probe (`/health`).
- Owning configuration, structured logging, and a centralized error model
  that every future subsystem will reuse.
- Owning the database connection lifecycle (async engine, session
  dependency, Alembic migrations) without yet defining a domain schema.
- Being independently runnable and testable without any frontend, worker,
  or AI component present.

Route handlers (`app/api/v1/endpoints/`) contain no business logic; they
call into `app/services/` (currently empty — reserved). This separation is
what lets later parts add real services without restructuring routes.

## AI provider layer

Implemented as of Part 4 at `app/ai/{provider.py,types.py,errors.py,
registry.py,providers/}` — a provider-independent interface
(`ModelProvider`) with adapters for Gemini, Groq, Cerebras, OpenRouter,
and a deterministic `MockModelProvider` for tests. The model backing the
system is swappable via configuration (`settings.ai.default_provider` /
`settings.ai.default_model`, and the `GEMINI_API_KEY` / `GROQ_API_KEY` /
`CEREBRAS_API_KEY` / `OPENROUTER_API_KEY` credentials in `Settings.ai`),
never hardcoded. See `docs/ai-providers.md` for the full architecture.

This is connectivity only — nothing in `app/api/` or `app/services/`
calls into it yet. `app/ai/{agents,prompts,routing}/` remain reserved,
unpopulated extension points for the future agent framework and model
router.

## Future agent layer

Reserved at `app/agents/` (planner, coding agent, debugger, reviewer). Each
will be built as a service consumed by the orchestrator, communicating
through explicit interfaces/schemas rather than ad hoc dict-passing.

## Future sandbox

Reserved at `app/sandbox/` and the top-level `sandbox/` directory. This is
architecturally **separate** from the development Docker Compose setup:
`docker-compose.yml` runs this platform's own API and database; the future
sandbox will run and isolate *other people's* code with different security
and lifecycle requirements. See `sandbox/README.md`.

## Database boundary

- `app/db/base.py` — shared `DeclarativeBase`. All ORM models inherit from
  it, and it centralizes timezone-aware `datetime` handling for every
  model via `type_annotation_map` (see `docs/database.md` §Timestamps).
- `app/db/session.py` — a single cached async engine per process, a session
  factory, and the `get_db()` FastAPI dependency used for per-request
  sessions.
- `app/db/models/` — the domain data layer added in Part 3: `User`,
  `Organization`, `Project`, `Repository`, `Task` (+ hierarchy and
  dependency graph), `AgentRun`, `ToolExecution`, `TestRun`, `Evaluation`,
  `RepairAttempt`, `GitCheckpoint`, `ProjectEvent`. See `docs/database.md`
  for the full entity-relationship diagram, ID/timestamp/state
  conventions, cascade-behavior rationale, and JSONB discipline. No AI
  provider, agent, planner, sandbox, or orchestration logic reads or
  writes this schema yet — Part 3 is the data layer only.
- Alembic (`backend/alembic.ini`, `backend/migrations/`) reads its database
  URL from the same `Settings` object the application uses, so migrations
  can never drift from runtime configuration.

## Worker boundary

`app/workers/` (backend-internal) and the top-level `worker/` directory
reserve the process boundary between the API and future background task
execution. No task queue or worker runtime exists yet — see
`worker/README.md`.

## Frontend/backend boundary

The backend is fully self-sufficient behind its HTTP API and OpenAPI docs
(`/docs`, `/redoc`). The frontend is a placeholder (`frontend/README.md`)
and will be added in a later part as a separate consumer of this API — the
backend does not assume a particular frontend framework or deployment
model.

## Security boundaries

- Secrets are only ever sourced from environment variables /
  `.env` (never hardcoded); `.env` is git-ignored and dockerignore'd.
- `Settings` refuses `DEBUG=true` when `APP_ENV=production` (and requires
  `SECRET_KEY` to be set in production) and fails
  fast with a clear error rather than starting in an unsafe state.
- CORS is disabled by default (`CORS_ORIGINS=`) and must be explicitly
  configured.
- Unhandled exceptions never leak stack traces to API consumers; the
  centralized handler in `app/core/exceptions.py` always returns the
  `{"error": {"code", "message", "details"}}` shape and logs full context
  server-side only.
- No authentication is implemented in Part 1 by design — see Part 1's
  scope notes in the README.

## Future extensibility

The structure below is reserved and unpopulated today. Adding these
should not require restructuring anything above:

```
app/
  ai/{agents,prompts,routing}/   (providers/ implemented as of Part 4 -- see docs/ai-providers.md)
  tools/
  projects/    (service layer -- domain models already exist: app/db/models/project.py)
  tasks/       (service layer -- domain models already exist: app/db/models/task.py)
  evaluation/  (service layer -- domain model already exists: app/db/models/evaluation.py)
  sandbox/
  git/         (service layer -- domain model already exists: app/db/models/git_checkpoint.py)
```

Part 3 added the domain *data* layer (`app/db/models/`) for projects,
tasks, agent runs, and the rest of the execution history — see
`docs/database.md`. The *service* layer directories above (business logic,
orchestration, and the routes that will call them) remain future work;
nothing in `app/api/`, `app/services/`, or `app/workers/` reads or writes
the new tables yet.

Each of these plugs into the existing `api -> services -> db` layering:
new routes call new services, new services use the existing `get_db`
dependency and `Base` metadata, and new errors subclass the existing
`AppError` hierarchy — no changes to `core/`, `db/session.py`, or the
exception-handling wiring should be required.
