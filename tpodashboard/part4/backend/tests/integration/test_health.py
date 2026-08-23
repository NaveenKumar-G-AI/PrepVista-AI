"""End-to-end tests for health/readiness endpoints against a real database."""

from __future__ import annotations


async def test_root_health_is_a_pure_liveness_check(client) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "Autonomous Engineer"}


async def test_v1_health_reports_database_connectivity(client, settings) -> None:
    response = await client.get(f"{settings.api.prefix}/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["environment"] == settings.app.environment
