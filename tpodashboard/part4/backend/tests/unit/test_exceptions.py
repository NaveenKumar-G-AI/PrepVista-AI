"""Centralized exception handling behavior."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.exceptions import NotFoundError
from app.main import create_app


def test_app_error_serializes_to_predictable_payload() -> None:
    error = NotFoundError("Project not found.", details={"project_id": "abc"})

    payload = error.to_payload()

    assert payload == {
        "error": {
            "code": "not_found",
            "message": "Project not found.",
            "details": {"project_id": "abc"},
        }
    }


def test_app_error_is_translated_to_http_response(settings: Settings) -> None:
    app = create_app(settings)

    @app.get("/__test-not-found")
    async def _raise_not_found() -> None:
        raise NotFoundError("Widget not found.")

    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/__test-not-found")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "not_found", "message": "Widget not found.", "details": {}}
    }


def test_unexpected_exception_does_not_leak_stack_trace(settings: Settings) -> None:
    app = create_app(settings)

    @app.get("/__test-boom")
    async def _boom() -> None:
        raise RuntimeError("internal secret detail")

    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/__test-boom")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "internal secret detail" not in response.text


def test_validation_error_returns_structured_payload(settings: Settings) -> None:
    app = create_app(settings)

    @app.get("/__test-validated")
    async def _validated(required_param: int) -> dict[str, int]:
        return {"value": required_param}

    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/__test-validated")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
