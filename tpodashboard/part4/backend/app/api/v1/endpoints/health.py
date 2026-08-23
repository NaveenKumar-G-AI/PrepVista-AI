"""Health and readiness endpoints for API v1.

Distinct from the root `/health` liveness probe: this endpoint additionally
verifies database connectivity, making it suitable for readiness checks in
orchestration environments.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_settings
from app.db.session import check_database_connection
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Readiness check",
    description="Reports service status including database connectivity.",
)
async def readiness() -> HealthResponse:
    settings = get_settings()
    database_ok = await check_database_connection(settings)
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        environment=settings.app.environment,
        version=settings.app.version,
        database="ok" if database_ok else "unreachable",
    )
