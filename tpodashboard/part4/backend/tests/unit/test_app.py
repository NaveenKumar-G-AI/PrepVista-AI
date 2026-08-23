"""FastAPI application factory and basic wiring."""

from __future__ import annotations

from fastapi import FastAPI

from app.core.config import Settings
from app.main import create_app


def test_create_app_returns_configured_fastapi_instance(settings: Settings) -> None:
    app = create_app(settings)

    assert isinstance(app, FastAPI)
    assert app.title == settings.app.name
    assert app.state.settings is settings


def test_api_v1_router_is_mounted_under_configured_prefix(settings: Settings) -> None:
    from fastapi.testclient import TestClient

    app = create_app(settings)
    with TestClient(app) as test_client:
        v1_health = test_client.get(f"{settings.api.prefix}/health")
        root_health = test_client.get("/health")

    assert v1_health.status_code == 200
    assert root_health.status_code == 200


async def test_root_health_endpoint_reports_running(client) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"


def test_openapi_docs_are_available(settings: Settings) -> None:
    from fastapi.testclient import TestClient

    app = create_app(settings)
    with TestClient(app) as test_client:
        docs_response = test_client.get("/docs")
        openapi_response = test_client.get("/openapi.json")

    assert docs_response.status_code == 200
    assert openapi_response.status_code == 200
    assert openapi_response.json()["info"]["title"] == settings.app.name
