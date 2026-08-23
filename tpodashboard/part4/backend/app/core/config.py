"""Centralized, environment-aware, sectioned application configuration.

Every subsystem obtains configuration through `get_settings()` rather than
reading `os.environ` directly. Configuration is organized into typed
sections (`app`, `api`, `database`, `cors`, `logging`, `worker`, `ai`,
`security`, `sandbox`, `git`, `browser`, `observability`) so it stays
discoverable as the number of settings grows across future parts.

Each section is its own `BaseSettings` subclass, so each independently
reads environment variables (optionally from a local `.env` file). The
top-level `Settings` object simply composes them and validates invariants
that span more than one section (e.g. "production requires a secret key").

Secrets (API keys, passwords, the app secret key) are typed as
`pydantic.SecretStr` so they are automatically masked in `repr()`, `str()`,
and default serialization -- never printed, logged, or returned in API
responses by accident. Nothing in this module should ever contain a real
secret; see `.env.example` for the full variable list and safe placeholder
values, and `docs/configuration.md` for the complete reference.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic import (
    BaseModel,
    Field,
    PostgresDsn,
    SecretStr,
    computed_field,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "testing", "staging", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
LogFormat = Literal["console", "json"]


def _resolve_env_file() -> str | None:
    """Determine which dotenv file (if any) sections should load.

    Defaults to `.env`. Tests set `SETTINGS_ENV_FILE=""` *before* this
    module is first imported (see `tests/conftest.py`) so test runs never
    depend on a developer's real local `.env` file -- only on the
    environment variables the test explicitly sets.
    """
    value = os.getenv("SETTINGS_ENV_FILE", ".env")
    return value or None


def _split_csv(value: object) -> object:
    """Allow list-valued env vars to be supplied as comma-separated strings."""
    if isinstance(value, str):
        if not value.strip():
            return []
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class _Section(BaseSettings):
    """Shared configuration for every settings section."""

    model_config = SettingsConfigDict(
        env_file=_resolve_env_file(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )


class AppSettings(_Section):
    """General application identity and runtime environment."""

    name: str = Field(default="Autonomous Engineer", alias="APP_NAME")
    version: str = Field(default="0.1.0", alias="APP_VERSION")
    environment: Environment = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=False, alias="DEBUG")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.environment == "production"


class ApiSettings(_Section):
    """HTTP server configuration."""

    host: str = Field(default="0.0.0.0", alias="API_HOST")
    port: int = Field(default=8000, alias="API_PORT", ge=1, le=65535)
    prefix: str = Field(default="/api/v1", alias="API_PREFIX")


class CorsSettings(_Section):
    """Cross-origin resource sharing configuration.

    Empty by default (no origins allowed). Production deployments must set
    `CORS_ORIGINS` explicitly -- there is no wildcard `*` default here,
    since this API is expected to eventually accept credentialed requests.
    """

    origins: list[str] = Field(default_factory=list, alias="CORS_ORIGINS")

    @field_validator("origins", mode="before")
    @classmethod
    def _parse_origins(cls, value: object) -> object:
        return _split_csv(value)


class LoggingSettings(_Section):
    """Structured logging configuration."""

    level: LogLevel = Field(default="INFO", alias="LOG_LEVEL")
    format: LogFormat = Field(default="console", alias="LOG_FORMAT")


class DatabaseSettings(_Section):
    """Database connectivity configuration.

    `DATABASE_URL` is the single source of truth if set (e.g. a managed
    Postgres connection string in production). Otherwise the connection
    string is assembled from the individual `POSTGRES_*` components, which
    remain supported for local development and Docker Compose. Either way,
    callers should only ever read `async_url` / `sync_url` -- the URL is
    never reconstructed anywhere else in the codebase.
    """

    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    user: str = Field(default="autoeng", alias="POSTGRES_USER")
    password: SecretStr = Field(
        default=SecretStr("autoeng_dev_password"), alias="POSTGRES_PASSWORD"
    )
    host: str = Field(default="localhost", alias="POSTGRES_HOST")
    port: int = Field(default=5432, alias="POSTGRES_PORT", ge=1, le=65535)
    name: str = Field(default="autoeng_db", alias="POSTGRES_DB")

    @staticmethod
    def _with_driver(url: str, scheme: str) -> str:
        """Swap whatever scheme `url` has for the given SQLAlchemy driver scheme."""
        _, _, rest = url.partition("://")
        return f"{scheme}://{rest}"

    @property
    def async_url(self) -> str:
        """Async SQLAlchemy connection string (asyncpg driver), used by the app.

        A plain property (not a `computed_field`) so it is never included in
        `model_dump()`, `model_dump_json()`, or the JSON schema -- only
        direct attribute access exposes it, and `repr()`/`str()` never do.
        """
        if self.database_url:
            return self._with_driver(self.database_url, "postgresql+asyncpg")
        dsn = PostgresDsn.build(
            scheme="postgresql+asyncpg",
            username=self.user,
            password=self.password.get_secret_value(),
            host=self.host,
            port=self.port,
            path=self.name,
        )
        return str(dsn)

    @property
    def sync_url(self) -> str:
        """Sync SQLAlchemy connection string (psycopg2 driver), used by Alembic.

        Also a plain property -- see `async_url` for why.
        """
        if self.database_url:
            return self._with_driver(self.database_url, "postgresql+psycopg2")
        dsn = PostgresDsn.build(
            scheme="postgresql+psycopg2",
            username=self.user,
            password=self.password.get_secret_value(),
            host=self.host,
            port=self.port,
            path=self.name,
        )
        return str(dsn)


class WorkerSettings(_Section):
    """Configuration for the future background task worker (not implemented yet)."""

    enabled: bool = Field(default=True, alias="WORKER_ENABLED")
    concurrency: int = Field(default=1, alias="WORKER_CONCURRENCY", ge=1)
    task_timeout_seconds: int = Field(default=300, alias="TASK_TIMEOUT_SECONDS", gt=0)
    max_task_retries: int = Field(default=3, alias="MAX_TASK_RETRIES", ge=0)


class AISettings(_Section):
    """Configuration foundation for the future multi-provider AI layer.

    No provider adapters exist yet (see Part 4). These fields only reserve
    where model routing configuration and provider credentials will live.
    """

    enabled: bool = Field(default=False, alias="AI_ENABLED")
    default_provider: str | None = Field(default=None, alias="DEFAULT_PROVIDER")
    default_model: str | None = Field(default=None, alias="DEFAULT_MODEL")
    request_timeout_seconds: int = Field(default=60, alias="AI_REQUEST_TIMEOUT", gt=0)
    max_retries: int = Field(default=3, alias="AI_MAX_RETRIES", ge=0)
    max_output_tokens: int = Field(default=4096, alias="AI_MAX_OUTPUT_TOKENS", gt=0)

    # Provider credentials -- unused until Part 4 implements the adapters.
    gemini_api_key: SecretStr | None = Field(default=None, alias="GEMINI_API_KEY")
    groq_api_key: SecretStr | None = Field(default=None, alias="GROQ_API_KEY")
    cerebras_api_key: SecretStr | None = Field(default=None, alias="CEREBRAS_API_KEY")
    openrouter_api_key: SecretStr | None = Field(default=None, alias="OPENROUTER_API_KEY")


class SecuritySettings(_Section):
    """Security configuration placeholders. No authentication is implemented yet."""

    secret_key: SecretStr | None = Field(default=None, alias="SECRET_KEY")
    allowed_hosts: list[str] = Field(default_factory=list, alias="ALLOWED_HOSTS")
    session_timeout_seconds: int = Field(default=3600, alias="SESSION_TIMEOUT", gt=0)

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def _parse_allowed_hosts(cls, value: object) -> object:
        return _split_csv(value)


class SandboxSettings(_Section):
    """Configuration foundation for the future isolated agent execution sandbox.

    Not implemented until Part 7. Distinct from the development
    Docker Compose environment -- see `sandbox/README.md`.
    """

    enabled: bool = Field(default=False, alias="SANDBOX_ENABLED")
    cpu_limit: float = Field(default=1.0, alias="SANDBOX_CPU_LIMIT", gt=0)
    memory_limit_mb: int = Field(default=512, alias="SANDBOX_MEMORY_LIMIT_MB", gt=0)
    timeout_seconds: int = Field(default=30, alias="SANDBOX_TIMEOUT_SECONDS", gt=0)
    network_enabled: bool = Field(default=False, alias="SANDBOX_NETWORK_ENABLED")


class GitSettings(_Section):
    """Configuration foundation for future autonomous Git checkpointing (Part 13)."""

    enabled: bool = Field(default=False, alias="GIT_ENABLED")
    author_name: str = Field(default="Autonomous Engineer Bot", alias="GIT_AUTHOR_NAME")
    author_email: str = Field(default="bot@autonomous-engineer.local", alias="GIT_AUTHOR_EMAIL")


class BrowserSettings(_Section):
    """Configuration foundation for future Playwright-based browser testing."""

    enabled: bool = Field(default=False, alias="BROWSER_ENABLED")
    headless: bool = Field(default=True, alias="BROWSER_HEADLESS")
    timeout_seconds: int = Field(default=30, alias="BROWSER_TIMEOUT_SECONDS", gt=0)


class ObservabilitySettings(_Section):
    """Configuration foundation for future metrics/tracing. Not implemented yet."""

    metrics_enabled: bool = Field(default=False, alias="METRICS_ENABLED")
    tracing_enabled: bool = Field(default=False, alias="TRACING_ENABLED")


class Settings(BaseModel):
    """Composition root for all application configuration sections.

    Instantiating this triggers each section's own environment-variable
    parsing and validation. Sections can be overridden individually (e.g.
    in tests) by passing them explicitly: `Settings(app=AppSettings(...))`.
    """

    app: AppSettings = Field(default_factory=AppSettings)
    api: ApiSettings = Field(default_factory=ApiSettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    cors: CorsSettings = Field(default_factory=CorsSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    worker: WorkerSettings = Field(default_factory=WorkerSettings)
    ai: AISettings = Field(default_factory=AISettings)
    security: SecuritySettings = Field(default_factory=SecuritySettings)
    sandbox: SandboxSettings = Field(default_factory=SandboxSettings)
    git: GitSettings = Field(default_factory=GitSettings)
    browser: BrowserSettings = Field(default_factory=BrowserSettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)

    @model_validator(mode="after")
    def _validate_cross_section_invariants(self) -> Settings:
        """Fail fast and clearly on configuration that spans multiple sections."""
        if self.app.is_production:
            if self.app.debug:
                raise ValueError(
                    "Invalid configuration: DEBUG must not be enabled when APP_ENV=production."
                )
            if self.security.secret_key is None:
                raise ValueError(
                    "Invalid configuration: SECRET_KEY is required when APP_ENV=production."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached, fully-validated Settings instance.

    Cached so configuration is parsed/validated once per process. Tests
    that need different configuration should call `get_settings.cache_clear()`
    after mutating the environment (see `tests/conftest.py`).
    """
    return Settings()
