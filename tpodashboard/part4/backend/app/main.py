"""Application entrypoint.

Builds the FastAPI application via an explicit factory function so tests
and future ASGI servers/workers can construct isolated app instances
instead of importing a single module-level singleton.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    logger.info("Application startup", extra={"environment": app.state.settings.app.environment})
    yield
    logger.info("Application shutdown")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory.

    Accepts an optional `Settings` override so tests can construct an app
    bound to isolated configuration (e.g. a test database) without mutating
    process-wide environment variables.
    """
    settings = settings or get_settings()
    configure_logging(settings)

    app = FastAPI(
        title=settings.app.name,
        version=settings.app.version,
        description=(
            "Foundation API for the autonomous software engineering platform. "
            "This is Part 1 (Foundation) + Part 2 (Configuration): no AI agent, "
            "planner, or execution sandbox is implemented yet."
        ),
        debug=settings.app.debug,
        lifespan=lifespan,
    )
    app.state.settings = settings

    if settings.cors.origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors.origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api.prefix)

    @app.get("/health", tags=["health"], summary="Liveness check")
    async def health() -> dict[str, str]:
        """Lightweight liveness probe with no external dependencies."""
        return {"status": "ok", "service": settings.app.name}

    return app


app = create_app()
