"""
PrepVista — AI Provider Health Router (Part 4 Integration)
============================================================
Exposes provider health checks so TPO admins can see which AI providers
are available/misconfigured from the dashboard.

GET /org/my/ai/health          — full health of all registered providers
GET /org/my/ai/health/{name}   — single provider health
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from app.ai.registry import get_registry
from app.ai.errors import ProviderNotRegisteredError
from app.dependencies import OrgAdminProfile, require_org_admin

router = APIRouter(prefix="/ai", tags=["AI Providers"])


@router.get("/health")
async def all_provider_health(
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Return health status of all registered AI providers.
    Runs health() concurrently with asyncio.gather and returns a safe dict.
    Never raises — errors are captured per-provider.
    """
    import asyncio
    registry = get_registry()
    providers = registry.available_providers()

    async def _check(name: str) -> dict:
        try:
            h = await registry.get(name).health()
            return {"provider": name, "status": h.status.value, "detail": h.detail}
        except Exception as exc:
            return {"provider": name, "status": "unknown", "detail": str(exc)}

    results = await asyncio.gather(*[_check(p) for p in providers])
    return {
        "providers":         list(results),
        "available_count":   sum(1 for r in results if r["status"] == "available"),
        "misconfigured_count": sum(1 for r in results if r["status"] == "misconfigured"),
    }


@router.get("/health/{provider_name}")
async def single_provider_health(
    provider_name: str,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Return health of a single named provider."""
    try:
        provider = get_registry().get(provider_name)
    except ProviderNotRegisteredError as exc:
        raise HTTPException(404, str(exc))
    try:
        h = await provider.health()
        return {"provider": provider_name, "status": h.status.value, "detail": h.detail}
    except Exception as exc:
        return {"provider": provider_name, "status": "unknown", "detail": str(exc)}