"""Aggregates all API v1 endpoint routers.

Future endpoint modules (projects, tasks, agent runs, etc.) should be added
in `app/api/v1/endpoints/` and registered here, keeping `app/main.py`
unaware of individual routes.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import health

api_router = APIRouter()
api_router.include_router(health.router)
