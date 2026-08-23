# Configuration — Part 2

## 1. Configuration architecture

All configuration lives behind a single entry point:
`app.core.config.get_settings()`. No other module reads `os.environ` or
`os.getenv(...)` directly — this is a hard rule for every future subsystem
(worker, AI providers, agents, sandbox, Git, browser, observability), not
just what exists today.

```
Environment (.env / real process env vars)
        │
        ▼
 12 typed section classes (AppSettings, ApiSettings, DatabaseSettings, ...)
        │  each is its own pydantic-settings BaseSettings,
        │  independently parsed + validated
        ▼
      Settings                     <- composition root (backend/app/core/config.py)
        │  cross-section validation (e.g. "production requires SECRET_KEY")
        ▼
   get_settings()                  <- process-wide cached accessor (lru_cache)
        │
        ▼
  Database │ API │ Workers │ AI Providers │ Agents │ Sandbox │ Git │ Browser │ Monitoring
  (implemented)  (implemented)  (config only, future parts implement the rest)
```

Each section is a small, focused class:

| Section | Class | Purpose |
|---|---|---|
| `settings.app` | `AppSettings` | App identity, environment, debug flag |
| `settings.api` | `ApiSettings` | HTTP host/port/prefix |
| `settings.database` | `DatabaseSettings` | Postgres connection (see §7) |
| `settings.cors` | `CorsSettings` | Allowed CORS origins |
| `settings.logging` | `LoggingSettings` | Log level + format |
| `settings.worker` | `WorkerSettings` | Future task worker tuning |
| `settings.ai` | `AISettings` | Future AI provider config + credentials |
| `settings.security` | `SecuritySettings` | Secret key, allowed hosts, session timeout |
| `settings.sandbox` | `SandboxSettings` | Future agent execution sandbox limits |
| `settings.git` | `GitSettings` | Future autonomous Git checkpointing identity |
| `settings.browser` | `BrowserSettings` | Future Playwright browser testing config |
| `settings.observability` | `ObservabilitySettings` | Future metrics/tracing toggles |

Usage anywhere in the app:

```python
from app.core.config import get_settings

settings = get_settings()
settings.database.async_url
settings.app.is_production
settings.ai.default_provider
```

## 2. Environment variables

Required in every environment: none — every variable has a safe
development default. **Required only in production:** `SECRET_KEY` (see
§8). Everything else is optional.

### Application

| Variable | Section field | Default | Purpose |
|---|---|---|---|
| `APP_NAME` | `app.name` | `Autonomous Engineer` | Display name, used as API title |
| `APP_VERSION` | `app.version` | `0.1.0` | Reported version, used as API version |
| `APP_ENV` | `app.environment` | `development` | One of `development`, `testing`, `staging`, `production` — invalid values are rejected |
| `DEBUG` | `app.debug` | `false` | Must be `false` when `APP_ENV=production` |

### API

| Variable | Section field | Default |
|---|---|---|
| `API_HOST` | `api.host` | `0.0.0.0` |
| `API_PORT` | `api.port` | `8000` (validated 1–65535) |
| `API_PREFIX` | `api.prefix` | `/api/v1` |

### CORS

| Variable | Section field | Default |
|---|---|---|
| `CORS_ORIGINS` | `cors.origins` | `[]` (disabled) — comma-separated list, e.g. `https://a.com,https://b.com` |

No wildcard `*` default is provided. Production must set this explicitly.

### Logging

| Variable | Section field | Default |
|---|---|---|
| `LOG_LEVEL` | `logging.level` | `INFO` (`DEBUG`\|`INFO`\|`WARNING`\|`ERROR`\|`CRITICAL`) |
| `LOG_FORMAT` | `logging.format` | `console` (`console`\|`json`) — use `json` in staging/production |

Correlation identifiers (`request_id`, `project_id`, `task_id`,
`agent_run_id`) are not settings — they're attached per-request/per-task
via `app.core.logging.bind_log_context(...)`, which any future subsystem
can call without touching this configuration system.

### Database

| Variable | Section field | Default | Required |
|---|---|---|---|
| `DATABASE_URL` | `database.database_url` | empty | No — if set, takes precedence over the `POSTGRES_*` fields below |
| `POSTGRES_USER` | `database.user` | `autoeng` | No |
| `POSTGRES_PASSWORD` | `database.password` (`SecretStr`) | `autoeng_dev_password` | No |
| `POSTGRES_HOST` | `database.host` | `localhost` | No |
| `POSTGRES_PORT` | `database.port` | `5432` | No |
| `POSTGRES_DB` | `database.name` | `autoeng_db` | No |

The connection string is assembled in exactly one place:
`DatabaseSettings.async_url` (asyncpg, used by the app) and
`DatabaseSettings.sync_url` (psycopg2, used by Alembic). Nothing else in
the codebase reconstructs it.

### Worker (config only — no worker runtime yet)

| Variable | Section field | Default |
|---|---|---|
| `WORKER_ENABLED` | `worker.enabled` | `true` |
| `WORKER_CONCURRENCY` | `worker.concurrency` | `1` (must be ≥ 1) |
| `TASK_TIMEOUT_SECONDS` | `worker.task_timeout_seconds` | `300` (must be > 0) |
| `MAX_TASK_RETRIES` | `worker.max_task_retries` | `3` (must be ≥ 0) |

### AI (config only — no provider adapters yet, see Part 4)

| Variable | Section field | Default |
|---|---|---|
| `AI_ENABLED` | `ai.enabled` | `false` |
| `DEFAULT_PROVIDER` | `ai.default_provider` | empty |
| `DEFAULT_MODEL` | `ai.default_model` | empty |
| `AI_REQUEST_TIMEOUT` | `ai.request_timeout_seconds` | `60` |
| `AI_MAX_RETRIES` | `ai.max_retries` | `3` |
| `AI_MAX_OUTPUT_TOKENS` | `ai.max_output_tokens` | `4096` |
| `GEMINI_API_KEY` | `ai.gemini_api_key` (`SecretStr`) | empty |
| `GROQ_API_KEY` | `ai.groq_api_key` (`SecretStr`) | empty |
| `CEREBRAS_API_KEY` | `ai.cerebras_api_key` (`SecretStr`) | empty |
| `OPENROUTER_API_KEY` | `ai.openrouter_api_key` (`SecretStr`) | empty |

### Security (config only — no authentication yet)

| Variable | Section field | Default | Required |
|---|---|---|---|
| `SECRET_KEY` | `security.secret_key` (`SecretStr`) | empty | **Yes, when `APP_ENV=production`** |
| `ALLOWED_HOSTS` | `security.allowed_hosts` | `[]` | No — comma-separated |
| `SESSION_TIMEOUT` | `security.session_timeout_seconds` | `3600` | No |

### Sandbox (config only — see Part 7)

| Variable | Section field | Default |
|---|---|---|
| `SANDBOX_ENABLED` | `sandbox.enabled` | `false` |
| `SANDBOX_CPU_LIMIT` | `sandbox.cpu_limit` | `1.0` |
| `SANDBOX_MEMORY_LIMIT_MB` | `sandbox.memory_limit_mb` | `512` |
| `SANDBOX_TIMEOUT_SECONDS` | `sandbox.timeout_seconds` | `30` |
| `SANDBOX_NETWORK_ENABLED` | `sandbox.network_enabled` | `false` |

### Git (config only — see Part 13)

| Variable | Section field | Default |
|---|---|---|
| `GIT_ENABLED` | `git.enabled` | `false` |
| `GIT_AUTHOR_NAME` | `git.author_name` | `Autonomous Engineer Bot` |
| `GIT_AUTHOR_EMAIL` | `git.author_email` | `bot@autonomous-engineer.local` |

### Browser (config only)

| Variable | Section field | Default |
|---|---|---|
| `BROWSER_ENABLED` | `browser.enabled` | `false` |
| `BROWSER_HEADLESS` | `browser.headless` | `true` |
| `BROWSER_TIMEOUT_SECONDS` | `browser.timeout_seconds` | `30` |

### Observability (config only)

| Variable | Section field | Default |
|---|---|---|
| `METRICS_ENABLED` | `observability.metrics_enabled` | `false` |
| `TRACING_ENABLED` | `observability.tracing_enabled` | `false` |

## 3. Development setup

```bash
cp .env.example .env
# edit values as needed — safe defaults work out of the box for local dev
make install
make dev
```

## 4. Testing setup

Tests never read your real `.env`. `tests/conftest.py` sets
`SETTINGS_ENV_FILE=""` before any application module is imported, which
disables dotenv loading for every settings section — only explicit
`os.environ` values (set by `conftest.py`, or by an individual test via
`monkeypatch.setenv`) are used. This guarantees test runs are deterministic
and don't depend on what happens to be in a developer's local `.env`.

```bash
make test              # full suite
make test-unit          # no DB required
make test-integration   # requires reachable PostgreSQL
```

## 5. Production considerations

- Set `APP_ENV=production` and `DEBUG=false` — the reverse combination is
  rejected at startup with a clear error.
- Set `SECRET_KEY` — startup fails clearly if it's missing in production.
- Set `CORS_ORIGINS` explicitly — there is no default allow-list.
- Prefer `LOG_FORMAT=json` so structured logs are easy to ingest.
- Prefer a single `DATABASE_URL` from your managed Postgres provider over
  the individual `POSTGRES_*` fields, if available.
- Every credential (`SECRET_KEY`, `POSTGRES_PASSWORD`, all `*_API_KEY`
  fields) should come from your deployment platform's secret store, not a
  file on disk.

## 6. Secret-handling rules

- Secrets are typed as `pydantic.SecretStr`. `repr()`, `str()`, and default
  serialization of a settings object never reveal the underlying value —
  they render as `**********`. Call `.get_secret_value()` explicitly (only
  where the raw value is actually needed, e.g. building a connection
  string) to read it.
- Nothing in this repository hardcodes a credential. `.env` is git-ignored;
  `.env.example` contains only empty values or clearly-fake placeholders,
  never anything that could be mistaken for a real key.
- `.dockerignore` excludes `.env` from build contexts so secrets never end
  up baked into an image layer.
- No endpoint returns a `Settings` object or any of its sections directly
  in a response body — API responses use explicit Pydantic schemas
  (`app/schemas/`), so there's no path for a secret field to leak through
  serialization even by accident.

## 7. How future modules consume settings

Every future subsystem should depend on `get_settings()` and read its own
section, exactly like the database layer does today:

```python
# app/db/session.py (existing, Part 1)
from app.core.config import get_settings

settings = get_settings()
engine = create_async_engine(settings.database.async_url, ...)
```

```python
# a future provider module (Part 4, illustrative only — not implemented)
from app.core.config import get_settings

settings = get_settings()
if settings.ai.enabled and settings.ai.gemini_api_key:
    ...
```

No subsystem should call `os.getenv(...)`, read `.env` itself, or
reconstruct a connection string / credential from raw environment access.
If a future part needs a new configuration value, it should be added as a
field on the relevant existing section (or a new section, if it's a
genuinely new subsystem) — never as a scattered ad hoc environment read.
