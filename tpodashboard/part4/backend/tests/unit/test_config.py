"""Configuration loading and validation behavior.

Covers: valid configuration, missing required values, invalid values,
environment-variable overrides, secret masking, and section composition.
"""

from __future__ import annotations

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import (
    AppSettings,
    DatabaseSettings,
    SecuritySettings,
    Settings,
)

# --- Valid configuration -------------------------------------------------


def test_valid_configuration_loads_with_expected_defaults() -> None:
    settings = Settings(app=AppSettings(APP_ENV="development", DEBUG=True))

    assert settings.app.environment == "development"
    assert settings.app.debug is True
    assert settings.api.port == 8000
    assert settings.app.is_production is False


def test_all_sections_are_present_and_typed() -> None:
    settings = Settings()

    for section in (
        settings.app,
        settings.api,
        settings.database,
        settings.cors,
        settings.logging,
        settings.worker,
        settings.ai,
        settings.security,
        settings.sandbox,
        settings.git,
        settings.browser,
        settings.observability,
    ):
        assert section is not None


# --- Database URL centralization -----------------------------------------


def test_database_url_is_built_from_components_when_not_overridden() -> None:
    db = DatabaseSettings(
        POSTGRES_USER="user1",
        POSTGRES_PASSWORD="pw1",
        POSTGRES_HOST="db-host",
        POSTGRES_PORT=5433,
        POSTGRES_DB="mydb",
    )

    assert db.async_url.startswith("postgresql+asyncpg://user1:pw1@db-host:5433/mydb")
    assert db.sync_url.startswith("postgresql+psycopg2://user1:pw1@db-host:5433/mydb")


def test_explicit_database_url_takes_precedence_over_components() -> None:
    db = DatabaseSettings(DATABASE_URL="postgresql://u:p@managed-host:5432/proddb")

    assert db.async_url == "postgresql+asyncpg://u:p@managed-host:5432/proddb"
    assert db.sync_url == "postgresql+psycopg2://u:p@managed-host:5432/proddb"


# --- CORS / list parsing ---------------------------------------------------


def test_cors_origins_accepts_comma_separated_string() -> None:
    from app.core.config import CorsSettings

    cors = CorsSettings(CORS_ORIGINS="https://a.example.com, https://b.example.com")

    assert cors.origins == ["https://a.example.com", "https://b.example.com"]


def test_allowed_hosts_accepts_comma_separated_string() -> None:
    security = SecuritySettings(ALLOWED_HOSTS="a.com, b.com")

    assert security.allowed_hosts == ["a.com", "b.com"]


# --- Invalid values --------------------------------------------------------


def test_invalid_environment_is_rejected() -> None:
    with pytest.raises(ValidationError):
        AppSettings(APP_ENV="not-a-real-environment")


def test_invalid_port_fails_validation() -> None:
    from app.core.config import ApiSettings

    with pytest.raises(ValidationError):
        ApiSettings(API_PORT=99999)


def test_invalid_worker_concurrency_fails_validation() -> None:
    from app.core.config import WorkerSettings

    with pytest.raises(ValidationError):
        WorkerSettings(WORKER_CONCURRENCY=0)


def test_invalid_task_timeout_fails_validation() -> None:
    from app.core.config import WorkerSettings

    with pytest.raises(ValidationError):
        WorkerSettings(TASK_TIMEOUT_SECONDS=0)


# --- Cross-section invariants / missing required values --------------------


def test_production_with_debug_enabled_fails_clearly() -> None:
    with pytest.raises(ValidationError, match="DEBUG must not be enabled"):
        Settings(
            app=AppSettings(APP_ENV="production", DEBUG=True),
            security=SecuritySettings(SECRET_KEY="a-real-secret"),
        )


def test_production_without_secret_key_fails_clearly() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY is required"):
        Settings(app=AppSettings(APP_ENV="production", DEBUG=False))


def test_production_with_secret_key_and_no_debug_succeeds() -> None:
    settings = Settings(
        app=AppSettings(APP_ENV="production", DEBUG=False),
        security=SecuritySettings(SECRET_KEY="a-real-secret"),
    )

    assert settings.app.is_production is True


# --- Environment variable overrides -----------------------------------------


def test_environment_variables_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_PORT", "9999")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    from app.core.config import ApiSettings, LoggingSettings

    assert ApiSettings().port == 9999
    assert LoggingSettings().level == "DEBUG"


# --- Secrets never leak -----------------------------------------------------


def test_secret_fields_are_masked_in_repr_and_str() -> None:
    db = DatabaseSettings(POSTGRES_PASSWORD="super-secret-value")

    assert "super-secret-value" not in repr(db)
    assert "super-secret-value" not in str(db)
    assert "super-secret-value" not in str(db.password)


def test_database_url_properties_are_excluded_from_serialization() -> None:
    """async_url/sync_url interpolate the raw password -- they must never be
    included in model_dump()/model_dump_json(), only reachable via direct
    attribute access, so a routine "log the settings" call can't leak it."""
    db = DatabaseSettings(POSTGRES_PASSWORD="super-secret-value")

    dumped = db.model_dump()
    assert "async_url" not in dumped
    assert "sync_url" not in dumped
    assert "super-secret-value" not in db.model_dump_json()
    # still reachable directly, which is how application code is meant to use it
    assert "super-secret-value" in db.async_url


def test_secret_key_masked_but_retrievable_when_needed() -> None:
    security = SecuritySettings(SECRET_KEY="another-secret-value")

    assert isinstance(security.secret_key, SecretStr)
    assert "another-secret-value" not in repr(security)
    assert security.secret_key.get_secret_value() == "another-secret-value"


def test_ai_provider_keys_are_masked() -> None:
    from app.core.config import AISettings

    ai = AISettings(GEMINI_API_KEY="fake-test-key-value")

    assert "fake-test-key-value" not in repr(ai)
    assert isinstance(ai.gemini_api_key, SecretStr)
