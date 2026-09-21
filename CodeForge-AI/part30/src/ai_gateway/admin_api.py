"""
Admin control plane (Feature 62).

Every mutating endpoint here writes an audit record (Feature 62: "All
changes must be audited") via `record_audit`, which is in-memory in this
reference implementation (`_AUDIT_LOG`) and should be swapped for
`db.repository`-backed inserts into `ai_admin_audit_log` (see migration
0001) in production.

Auth: a single shared bearer token (`ADMIN_API_TOKEN`, blank by default —
see config.py). This refuses to serve ANY admin request, including reads,
if the token isn't configured, rather than silently defaulting to open
access. A real deployment should replace this with CodeForge's existing
staff/admin auth instead of a shared token — this exists so the control
plane is usable and demonstrably access-controlled out of the box.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from .config import settings
from .cost.budget_engine import BudgetConfig
from .deps import get_gateway
from .enums import BudgetScope
from .gateway import AIGateway

router = APIRouter(prefix="/v1/admin", tags=["admin"])


@dataclass(frozen=True)
class AuditRecord:
    actor: str
    action: str
    target: str
    before: Optional[dict]
    after: Optional[dict]
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_AUDIT_LOG: list[AuditRecord] = []


def record_audit(actor: str, action: str, target: str, *, before: Optional[dict] = None, after: Optional[dict] = None) -> None:
    _AUDIT_LOG.append(AuditRecord(actor=actor, action=action, target=target, before=before, after=after))


def require_admin(authorization: str = Header(default="")) -> str:
    try:
        token = settings.require_admin_api_token()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    if not authorization.startswith("Bearer ") or authorization.removeprefix("Bearer ") != token:
        raise HTTPException(status_code=401, detail="Missing or invalid admin bearer token")
    return "admin"  # actor identity — replace with the real staff user id once wired into CodeForge auth


# ---------------------------------------------------------------------------
# Models (Feature 62: "enable/disable" models)
# ---------------------------------------------------------------------------

class ModelOut(BaseModel):
    provider: str
    model_id: str
    quality_class: str
    latency_class: str
    output_price_per_1k: str
    context_limit: int
    enabled: bool
    available: bool


@router.get("/models", response_model=list[ModelOut])
async def list_models(actor: str = Depends(require_admin), gw: AIGateway = Depends(get_gateway)):
    return [
        ModelOut(
            provider=m.provider, model_id=m.model_id, quality_class=m.quality_class.value,
            latency_class=m.latency_class.value, output_price_per_1k=str(m.output_price_per_1k),
            context_limit=m.context_limit, enabled=m.enabled, available=m.available,
        )
        for m in gw._registry.all()  # internal access is fine within the same package's admin surface
    ]


@router.post("/models/{provider}/{model_id}/enabled")
async def set_model_enabled(
    provider: str, model_id: str, enabled: bool, actor: str = Depends(require_admin),
    gw: AIGateway = Depends(get_gateway),
):
    try:
        before = gw._registry.get(provider, model_id).enabled
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model {provider}:{model_id} not found")
    gw._registry.set_enabled(provider, model_id, enabled)
    record_audit(actor, "set_model_enabled", f"{provider}:{model_id}", before={"enabled": before}, after={"enabled": enabled})
    return {"provider": provider, "model_id": model_id, "enabled": enabled}


# ---------------------------------------------------------------------------
# Circuit breaker / provider health (Features 28, 45)
# ---------------------------------------------------------------------------

@router.get("/health/circuit-breakers")
async def circuit_breaker_snapshot(actor: str = Depends(require_admin), gw: AIGateway = Depends(get_gateway)):
    return gw._circuit_breakers.snapshot()


# ---------------------------------------------------------------------------
# Budgets (Features 20-22, 62)
# ---------------------------------------------------------------------------

class BudgetIn(BaseModel):
    scope: BudgetScope
    key: str
    period_limit_usd: str
    approaching_threshold_pct: str = "0.75"
    optimization_threshold_pct: str = "0.90"


@router.post("/budgets")
async def upsert_budget(body: BudgetIn, actor: str = Depends(require_admin), gw: AIGateway = Depends(get_gateway)):
    config = BudgetConfig(
        scope=body.scope, key=body.key, period_limit_usd=Decimal(body.period_limit_usd),
        approaching_threshold_pct=Decimal(body.approaching_threshold_pct),
        optimization_threshold_pct=Decimal(body.optimization_threshold_pct),
    )
    gw._budget_engine.register(config)
    record_audit(actor, "upsert_budget", f"{body.scope.value}:{body.key}", after=body.model_dump())
    return {"status": "ok"}


@router.get("/budgets/{scope}/{key}")
async def get_budget_status(scope: BudgetScope, key: str, actor: str = Depends(require_admin), gw: AIGateway = Depends(get_gateway)):
    try:
        state = gw._budget_engine.check(scope, key)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"No budget configured for {scope.value}:{key}")
    return {
        "scope": scope.value, "key": key, "limit_usd": str(state.config.period_limit_usd),
        "spent_usd": str(state.spent_usd), "status": state.status.value,
        "utilization": str(state.utilization),
    }


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

@router.get("/audit-log")
async def get_audit_log(actor: str = Depends(require_admin), limit: int = 100):
    return [
        {"actor": r.actor, "action": r.action, "target": r.target, "before": r.before, "after": r.after,
         "created_at": r.created_at.isoformat()}
        for r in _AUDIT_LOG[-limit:]
    ]
