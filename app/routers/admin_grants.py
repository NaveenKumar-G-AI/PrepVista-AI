"""Transactional, tier-isolated manual grants with prospective idempotency."""

import hashlib
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import ADMIN_UNLIMITED_BY_PLAN, ADMIN_UNLIMITED_VALUES
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.plan_access import sync_profile_plan_state
from app.services.quota import _ensure_current_usage_period
from app.routers.admin import _OVERVIEW_CACHE as _admin_overview_cache

router = APIRouter()
_FREE_NORMAL_BONUS_CAP = 20


def require_admin(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required to manipulate tier grants.")
    return current_user


class AdminGrantRequest(BaseModel):
    request_id: UUID
    user_id: UUID
    model: str
    value: str
    action: str


def transition_bonus(current: int, model: str, value: str, action: str, *, paid_active: bool) -> int:
    """Finite arithmetic only; never infer the origin of a historical bonus.

    Free stacking stops at 20 without reducing larger existing grants. Pro's
    first normal grant unlocks its base allowance; subsequent grants add 15.
    Career has no additive grant. Matching unlimited activation is a no-op.
    """
    if current not in ADMIN_UNLIMITED_VALUES and not 0 <= current <= 1000:
        raise HTTPException(409, "Stored bonus is outside the supported domain.")
    marker = ADMIN_UNLIMITED_BY_PLAN[model]
    if action == "deactivate":
        if value == "unlimited":
            return 0 if current == marker else current
        if current and current not in ADMIN_UNLIMITED_VALUES:
            raise HTTPException(409, "Finite grant provenance is ambiguous; no bonus or access was changed.")
        return current
    if current in ADMIN_UNLIMITED_VALUES:
        if current != marker:
            raise HTTPException(409, "Another tier has an unlimited grant. Deactivate that override explicitly first.")
        return current
    if value == "unlimited":
        return int(marker)
    if model == "free":
        return max(current, min(current + 2, _FREE_NORMAL_BONUS_CAP))
    if model == "pro" and paid_active:
        if current > 985:
            raise HTTPException(409, "Grant would exceed the finite bonus limit of 1000.")
        return current + 15
    return current


async def _clear_model_bonus_override(conn, target_user_id: str, model: str) -> None:
    """Compatibility helper: only remove a marker attributable to this tier."""
    current = await conn.fetchval("SELECT admin_bonus_interviews FROM profiles WHERE id = $1", target_user_id)
    if current == ADMIN_UNLIMITED_BY_PLAN.get(model):
        await conn.execute("UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1", target_user_id, 0)


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


async def apply_admin_grant(conn, payload: AdminGrantRequest, actor_id: str):
    model, value, action = payload.model.lower(), payload.value.lower(), payload.action.lower()
    if model not in {"free", "pro", "career"} or value not in {"normal", "unlimited"} or action not in {"activate", "deactivate"}:
        raise HTTPException(400, "Invalid grant model, value or action.")
    target = str(payload.user_id)
    fingerprint = hashlib.sha256(_json([str(actor_id), target, model, value, action]).encode()).hexdigest()
    async with conn.transaction():
        # Serialize reused request IDs even across different target profiles.
        # Hash collisions merely serialize unrelated requests.
        await conn.execute("SELECT pg_advisory_xact_lock(hashtextextended($1, 52001))", str(payload.request_id))
        prior = await conn.fetchrow(
            "SELECT request_fingerprint, response FROM admin_grant_operations WHERE request_id = $1", payload.request_id
        )
        if prior:
            if prior["request_fingerprint"] != fingerprint:
                raise HTTPException(409, "Request ID was already used with a different payload or actor.")
            return json.loads(prior["response"]) if isinstance(prior["response"], str) else dict(prior["response"])
        profile = await conn.fetchrow(
            "SELECT email, plan, admin_bonus_interviews, period_start FROM profiles WHERE id = $1 FOR UPDATE", target
        )
        if not profile:
            raise HTTPException(404, "User not found.")
        before = dict(profile)
        normalized = await _ensure_current_usage_period(conn, target)
        # Resolve real purchases before granting access; suppress notifications
        # from uncommitted state. Preserve any valid selected plan.
        await sync_profile_plan_state(conn, target, send_notifications=False)
        entitlement = None
        if model != "free":
            entitlement = await conn.fetchrow(
                """SELECT status, source_order_id, activated_at, expires_at,
                          (status = 'active' AND expires_at > NOW()) AS valid
                   FROM user_plan_entitlements WHERE user_id = $1 AND plan = $2 FOR UPDATE""", target, model
            )
        before["entitlement"] = dict(entitlement) if entitlement else None
        if action == 'activate' and entitlement and entitlement['status'] == 'active' and entitlement['expires_at'] is None:
            raise HTTPException(409, 'Active entitlement has no expiry; review it before changing access.')
        current = normalized["admin_bonus_interviews"]
        updated = transition_bonus(current, model, value, action, paid_active=bool(entitlement and entitlement["valid"]))
        if updated != current:
            await conn.execute("UPDATE profiles SET admin_bonus_interviews = $2, updated_at = NOW() WHERE id = $1", target, updated)
            # Sentinel transitions and pre-grant rollover are JSON states, never
            # numeric adjustments in the historical finite-delta audit table.
            if current not in ADMIN_UNLIMITED_VALUES and updated not in ADMIN_UNLIMITED_VALUES:
                await conn.execute(
                    """INSERT INTO admin_bonus_grants(granted_by, granted_to, amount, reason, snapshot_after)
                       VALUES ($1, $2, $3, $4, $5)""", str(actor_id), target, updated-current,
                    "manual request " + str(payload.request_id), updated,
                )
        if model != "free":
            if action == "activate" and not (entitlement and entitlement["valid"]):
                # A concurrent purchase may insert after our read. Never replace
                # valid access in the conflict branch or extend it on retry.
                await conn.execute(
                    """INSERT INTO user_plan_entitlements
                       (user_id, plan, status, source_order_id, activated_at, expires_at, created_at, updated_at)
                       VALUES ($1, $2, 'active', 'manual_grant', NOW(), NOW()+INTERVAL '30 days', NOW(), NOW())
                       ON CONFLICT (user_id, plan) DO UPDATE SET status='active', source_order_id='manual_grant',
                           activated_at=EXCLUDED.activated_at, expires_at=EXCLUDED.expires_at, updated_at=NOW()
                       WHERE user_plan_entitlements.status <> 'active'
                          OR user_plan_entitlements.expires_at <= NOW()""", target, model
                )
            elif action == "deactivate":
                await conn.execute(
                    """UPDATE user_plan_entitlements SET status='expired', updated_at=NOW()
                       WHERE user_id=$1 AND plan=$2 AND status='active' AND source_order_id='manual_grant'
                         AND NOT EXISTS (SELECT FROM payments WHERE user_id=$1 AND plan=$2
                           AND status='verified' AND COALESCE(verified_at,created_at)+INTERVAL '30 days'>NOW())""", target, model
                )
        state = await sync_profile_plan_state(conn, target, send_notifications=False)
        after_entitlement = await conn.fetchrow(
            "SELECT status, source_order_id, activated_at, expires_at FROM user_plan_entitlements WHERE user_id=$1 AND plan=$2",
            target, model,
        ) if model != "free" else None
        response = {"status": "success", "message": f"{model.title()} {value} grant {action} completed.", "request_id": str(payload.request_id)}
        await conn.execute(
            """INSERT INTO admin_grant_operations
               (request_id, actor_id, target_id, plan, grant_kind, action, request_fingerprint, before_state, after_state, response)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)""",
            payload.request_id, str(actor_id), target, model, value, action, fingerprint, _json(before),
            _json({"admin_bonus_interviews": updated, "period_start": normalized["period_start"],
                   "plan": state["selected_plan"], "entitlement": dict(after_entitlement) if after_entitlement else None}), _json(response),
        )
    return response


@router.post("")
async def grant_admin_access(payload: AdminGrantRequest, current_user: UserProfile = Depends(require_admin)):
    async with DatabaseConnection() as conn:
        response = await apply_admin_grant(conn, payload, str(current_user.id))
    _admin_overview_cache.clear()
    return response
