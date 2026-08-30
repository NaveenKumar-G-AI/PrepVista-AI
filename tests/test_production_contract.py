"""Deployment-contract regression tests."""

from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app


def _production_settings(**overrides) -> Settings:
    values = {
        "ENVIRONMENT": "production",
        "DEBUG": False,
        "FRONTEND_URL": "https://prepvista-ai.vercel.app",
        "BACKEND_URL": "https://prepvistabeckend.onrender.com",
        "ALLOWED_HOSTS": "prepvistabeckend.onrender.com",
        "CORS_ALLOWED_ORIGINS": "https://prepvista-ai.vercel.app",
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_ANON_KEY": "anon",
        "SUPABASE_SERVICE_KEY": "service",
        "SUPABASE_JWT_SECRET": "x" * 32,
        "DATABASE_URL": "postgresql://user:password@example.invalid:5432/db",
        "GROQ_API_KEY": "test-provider-key",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_production_settings_accept_explicit_https_hosts_and_origins() -> None:
    settings = _production_settings()

    assert settings.ENVIRONMENT == "production"
    assert settings.DEBUG is False


def test_production_settings_reject_wildcard_host() -> None:
    try:
        _production_settings(ALLOWED_HOSTS="*")
    except ValueError as exc:
        assert "Wildcard" in str(exc)
    else:
        raise AssertionError("production wildcard host was accepted")


def test_namespaced_debug_setting_ignores_generic_shell_variable(monkeypatch) -> None:
    monkeypatch.setenv("DEBUG", "release")
    monkeypatch.setenv("PREPVISTA_DEBUG", "false")
    values = _production_settings().model_dump()
    values.pop("DEBUG")

    settings = Settings(_env_file=None, **values)

    assert settings.DEBUG is False


def test_request_size_middleware_preserves_normal_json_and_rejects_actual_bytes() -> None:
    settings = get_settings()
    original_limit = settings.MAX_REQUEST_SIZE_MB
    settings.MAX_REQUEST_SIZE_MB = 1
    try:
        application = create_app()

        @application.post("/__request_size_test")
        async def echo(payload: dict) -> dict:
            return payload

        client = TestClient(application)
        normal = client.post("/__request_size_test", json={"ok": True})
        oversized = client.post(
            "/__request_size_test",
            content=b"x" * (1024 * 1024 + 1),
            headers={"content-type": "application/octet-stream", "content-length": "1"},
        )
    finally:
        settings.MAX_REQUEST_SIZE_MB = original_limit

    assert normal.status_code == 200
    assert normal.json() == {"ok": True}
    assert oversized.status_code == 413
