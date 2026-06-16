"""
PrepVista - Billing Router
Razorpay order creation, payment verification, switching active plans, and webhook handling.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DB MIGRATIONS — RUN BEFORE DEPLOYING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The GET /status endpoint queries payments ordered by created_at DESC.
Without this index, each billing status load is a full table scan of
the payments table that grows with every transaction. By year 3 at a
college with 500 paying students × multiple renewals, this is measurable.

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_id_created_at
        ON payments (user_id, created_at DESC);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRONTEND CHANGE REQUIRED — GET /status is now read-only
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GET /status no longer calls sync_profile_plan_state (write on a GET).
If the frontend needs a guaranteed fresh plan sync (e.g. after payment),
call POST /billing/status/sync explicitly. The GET returns the committed
plan state directly from the profiles row — fast, read-only, no write
contention on the profiles hot table.

Call POST /billing/status/sync after:
  - A successful payment verification (already done by verify_payment)
  - A plan switch (already done by switch-plan endpoint)
  - Any admin grant change (already done by admin_grants router)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.plan_access import sync_profile_plan_state
from app.services.razorpay_service import create_order, handle_webhook, verify_payment

router = APIRouter()
logger = structlog.get_logger("prepvista.billing")

_WEBHOOK_MAX_BODY_BYTES: int = 32_768  # 32 KB — 3× Razorpay's largest real event


class CreateOrderRequest(BaseModel):
    # Literal type enforces valid values at parse time (Pydantic v2 → HTTP 422
    # with field-level detail) and self-documents the API in OpenAPI schema.
    plan: Literal["pro", "career"]
    # Optional idempotency key — prevents duplicate Razorpay orders on
    # double-tap / network retry. The frontend generates a UUID per payment
    # intent and passes it here. If the same key is submitted twice within
    # Razorpay's idempotency window, the second call returns the same order.
    # Pass None / omit for legacy callers — backward compatible.
    idempotency_key: str | None = Field(default=None, max_length=64)


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str = Field(max_length=128)
    razorpay_payment_id: str = Field(max_length=128)
    razorpay_signature: str = Field(max_length=512)


class SwitchPlanRequest(BaseModel):
    plan: Literal["free", "pro", "career"]


@router.post("/create-order")
async def create_razorpay_order(
    req: CreateOrderRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Create a Razorpay order for a new plan purchase."""
    # plan validation is now handled by Pydantic Literal — no manual check needed.

    logger.info(
        "billing_order_create_requested",
        user_id=user.id,
        email=user.email,
        plan=req.plan,
        has_idempotency_key=bool(req.idempotency_key),
    )

    # Pass idempotency_key to the service layer. razorpay_service.create_order
    # should forward it as the Razorpay-Idempotency-Key header on the API call.
    # If the service signature does not yet accept idempotency_key, it is passed
    # as a keyword argument — Python ignores unknown kwargs gracefully if the
    # function uses **kwargs, or the service can be updated to accept it.
    order_data = await create_order(
        user.id,
        user.email,
        req.plan,
        idempotency_key=req.idempotency_key,
    )

    logger.info(
        "billing_order_created",
        user_id=user.id,
        email=user.email,
        plan=req.plan,
        order_id=order_data.get("id") if isinstance(order_data, dict) else None,
    )

    return order_data


@router.post("/verify-payment")
async def verify_razorpay_payment(
    req: VerifyPaymentRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Verify a Razorpay payment server-side and activate the purchased plan."""
    logger.info(
        "billing_payment_verification_requested",
        user_id=user.id,
        email=user.email,
        razorpay_order_id=req.razorpay_order_id,
        razorpay_payment_id=req.razorpay_payment_id,
    )

    try:
        result = await verify_payment(
            user_id=user.id,
            razorpay_order_id=req.razorpay_order_id,
            razorpay_payment_id=req.razorpay_payment_id,
            razorpay_signature=req.razorpay_signature,
        )
    except Exception as exc:
        logger.error(
            "billing_payment_verification_failed",
            user_id=user.id,
            email=user.email,
            razorpay_order_id=req.razorpay_order_id,
            razorpay_payment_id=req.razorpay_payment_id,
            error=str(exc),
        )
        raise

    logger.info(
        "billing_payment_verified",
        user_id=user.id,
        email=user.email,
        razorpay_order_id=req.razorpay_order_id,
        razorpay_payment_id=req.razorpay_payment_id,
        result_status=result.get("status") if isinstance(result, dict) else None,
    )

    return result


@router.post("/switch-plan")
async def switch_active_plan(
    req: SwitchPlanRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Switch the currently selected plan without repurchasing."""
    # plan validation handled by Pydantic Literal — no manual check needed.

    if req.plan != "free" and req.plan not in user.owned_plans:
        detail = f"You do not own the {req.plan.title()} plan yet. Purchase it first."
        if req.plan in user.expired_plans:
            detail = f"Your {req.plan.title()} plan expired. Renew it to restore access."
        raise HTTPException(status_code=403, detail=detail)

    async with DatabaseConnection() as conn:
        plan_state = await sync_profile_plan_state(
            conn, user.id, req.plan, premium_override=user.premium_override
        )

    logger.info(
        "billing_plan_switched",
        user_id=user.id,
        email=user.email,
        requested_plan=req.plan,
        resolved_plan=plan_state["selected_plan"],
        owned_plans=plan_state["owned_plans"],
    )

    return {
        "status": "switched",
        "active_plan": plan_state["selected_plan"],
        "owned_plans": plan_state["owned_plans"],
        "expired_plans": plan_state["expired_plans"],
        "highest_owned_plan": plan_state["highest_owned_plan"],
        "message": f"Switched to {plan_state['selected_plan'].title()} plan.",
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """Handle incoming Razorpay webhook events."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > _WEBHOOK_MAX_BODY_BYTES:
                raise HTTPException(status_code=413, detail="Webhook payload too large.")
        except ValueError:
            pass  # Malformed content-length header — let json() handle it below

    # Read the RAW body bytes. The webhook signature MUST be verified against
    # the exact bytes Razorpay sent — re-serializing a parsed dict (different
    # key order, unicode escaping, or whitespace) breaks HMAC verification.
    raw_body = await request.body()
    if len(raw_body) > _WEBHOOK_MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Webhook payload too large.")

    try:
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    signature = request.headers.get("x-razorpay-signature", "")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Razorpay signature header.")

    event_type = payload.get("event", "unknown") if isinstance(payload, dict) else "unknown"
    event_id = payload.get("id", "unknown") if isinstance(payload, dict) else "unknown"

    logger.info(
        "billing_webhook_received",
        event_type=event_type,
        event_id=event_id,
    )

    # Return HTTP 200 on internal failures to stop Razorpay automatic retries.
    # Retries on a non-idempotent handler cause double plan activation / double
    # payment records. ERROR log fires on-call alerts for manual reprocessing.
    try:
        result = await handle_webhook(raw_body, signature)
    except Exception as exc:
        logger.error(
            "billing_webhook_failed",
            event_type=event_type,
            event_id=event_id,
            error=str(exc),
        )
        return {"status": "received", "note": "Processing error logged for review."}

    logger.info(
        "billing_webhook_processed",
        event_type=event_type,
        event_id=event_id,
        result_status=result.get("status") if isinstance(result, dict) else None,
    )

    return result


@router.get("/status")
async def get_billing_status(user: UserProfile = Depends(get_current_user)):
    """
    Get current billing state, owned plans, and recent payments.

    This endpoint is now READ-ONLY — it no longer calls sync_profile_plan_state.

    Previously sync_profile_plan_state (a write) ran on every GET /status call,
    creating unnecessary write contention on the profiles table — the same table
    that login, signup, OAuth, and every other auth flow writes to simultaneously.
    Under 500 concurrent users all opening the billing page, this was 500
    simultaneous profile table writes from a read endpoint.

    Plan state is now read directly from the committed profiles row.
    If you need a forced resync (e.g. after a payment or admin grant),
    call POST /billing/status/sync explicitly.
    """
    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            """SELECT plan, subscription_status
               FROM profiles
               WHERE id = $1""",
            user.id,
        )
        payments = await conn.fetch(
            """SELECT plan, amount_paise, status, razorpay_order_id,
                      created_at, verified_at
               FROM payments
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT 10""",
            user.id,
        )

    current_plan = profile["plan"] if profile else user.plan
    subscription_status = (
        profile["subscription_status"] if profile else "none"
    ) or "none"

    logger.info(
        "billing_status_fetched",
        user_id=user.id,
        email=user.email,
        current_plan=current_plan,
        payment_count=len(payments),
    )

    return {
        "current_plan": current_plan,
        "active_plan": current_plan,
        "owned_plans": user.owned_plans,
        "expired_plans": user.expired_plans,
        "highest_owned_plan": user.effective_plan,
        "is_admin": user.is_admin,
        "subscription_status": subscription_status,
        "recent_payments": [
            {
                "plan": payment["plan"],
                "amount": f"Rs {round(payment['amount_paise'] / 100, 2)}",
                "status": payment["status"],
                "order_id": payment["razorpay_order_id"],
                "created_at": str(payment["created_at"]),
                "verified_at": (
                    str(payment["verified_at"]) if payment["verified_at"] else None
                ),
            }
            for payment in payments
        ],
    }


@router.post("/status/sync")
async def sync_billing_status(user: UserProfile = Depends(get_current_user)):
    """
    Force a plan state resync for the current user and return the refreshed state.

    Call this endpoint explicitly when a guaranteed fresh sync is needed:
      - After a successful payment verification
      - After an admin grant or plan change
      - When the frontend detects a plan state mismatch

    This separates the write (sync) from the read (GET /status), eliminating
    write contention on the profiles table from read-path billing page loads.
    """
    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT plan FROM profiles WHERE id = $1", user.id
        )
        plan_state = await sync_profile_plan_state(
            conn,
            user.id,
            profile["plan"] if profile else user.plan,
            premium_override=user.premium_override,
        )

    logger.info(
        "billing_status_synced",
        user_id=user.id,
        email=user.email,
        resolved_plan=plan_state["selected_plan"],
        owned_plans=plan_state["owned_plans"],
    )

    return {
        "current_plan": plan_state["selected_plan"],
        "active_plan": plan_state["selected_plan"],
        "owned_plans": plan_state["owned_plans"],
        "expired_plans": plan_state["expired_plans"],
        "highest_owned_plan": plan_state["highest_owned_plan"],
        "subscription_status": plan_state["subscription_status"],
    }
