"""
PrepVista - Razorpay Billing Service
Handles order creation, payment verification, webhook processing, and plan activation.
Implements a strict payment state machine: created -> pending -> verified/failed/expired.
"""

import hashlib
import hmac
import json
from datetime import datetime, timezone

import razorpay
import structlog
from fastapi import HTTPException

from app.config import PLAN_CONFIG, get_settings
from app.database.connection import DatabaseConnection
from app.services.plan_access import set_entitlement_status, sync_profile_plan_state

logger = structlog.get_logger("prepvista.razorpay")

_client: razorpay.Client | None = None


def _get_client() -> razorpay.Client:
    """Lazy-init Razorpay client."""
    global _client
    if not _client:
        settings = get_settings()
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
            raise RuntimeError("Razorpay credentials not configured.")
        _client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    return _client


def _coerce_webhook_time(value) -> datetime | None:
    try:
        if value is None:
            return None
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except Exception:
        return None


async def create_order(user_id: str, user_email: str, plan: str) -> dict:
    """
    Create a Razorpay order for a subscription plan.
    Returns order details for the frontend checkout.
    """
    plan_cfg = PLAN_CONFIG.get(plan)
    if not plan_cfg or plan_cfg["price_paise"] == 0:
        raise HTTPException(status_code=400, detail="Cannot create order for free plan.")

    amount_paise = plan_cfg["price_paise"]
    client = _get_client()
    settings = get_settings()

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow("SELECT plan FROM profiles WHERE id = $1", user_id)
        plan_state = await sync_profile_plan_state(conn, user_id, profile["plan"] if profile else "free")
        if plan in plan_state["owned_plans"]:
            raise HTTPException(
                status_code=400,
                detail=f"You already own the {plan.title()} plan. Switch to it from your dashboard instead of purchasing again.",
            )

    try:
        order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"pv_{user_id[:8]}_{plan}",
            "notes": {
                "user_id": user_id,
                "user_email": user_email,
                "plan": plan,
                "product": "PrepVista",
            },
        })
    except Exception as exc:
        logger.error("razorpay_order_creation_failed", error=str(exc), user_id=user_id)
        raise HTTPException(status_code=502, detail="Payment service is temporarily unavailable. Please try again.") from exc

    order_id = order["id"]

    async with DatabaseConnection() as conn:
        await conn.execute(
            """INSERT INTO payments
               (user_id, provider, plan, amount_paise, currency, status,
                razorpay_order_id, created_at)
               VALUES ($1, 'razorpay', $2, $3, 'INR', 'created', $4, NOW())""",
            user_id,
            plan,
            amount_paise,
            order_id,
        )

    logger.info("razorpay_order_created", order_id=order_id, user_id=user_id, plan=plan, amount=amount_paise)

    return {
        "order_id": order_id,
        "amount": amount_paise,
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
        "plan": plan,
        "prefill": {"email": user_email},
        "notes": {"plan": plan},
    }


async def verify_payment(
    user_id: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> dict:
    """
    Verify a Razorpay payment server-side.
    Only VERIFIED payments unlock premium access.
    Returns the updated plan info.
    """
    settings = get_settings()

    try:
        message = f"{razorpay_order_id}|{razorpay_payment_id}"
        expected_signature = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, razorpay_signature):
            logger.warning("razorpay_signature_mismatch", order_id=razorpay_order_id)
            raise HTTPException(status_code=400, detail="Payment verification failed. Invalid signature.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("razorpay_signature_verification_error", error=str(exc))
        raise HTTPException(status_code=400, detail="Payment verification failed.") from exc

    newly_verified = False
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                """SELECT id, status, plan, razorpay_payment_id, verified_at
                   FROM payments
                   WHERE razorpay_order_id = $1 AND user_id = $2
                   FOR UPDATE""",
                razorpay_order_id,
                user_id,
            )

            if not existing:
                raise HTTPException(status_code=404, detail="Payment record not found.")

            if existing["status"] == "verified":
                stored_payment_id = existing["razorpay_payment_id"]
                if stored_payment_id and stored_payment_id != razorpay_payment_id:
                    raise HTTPException(status_code=409, detail="Payment ID conflicts with the verified payment.")
                verified_at = existing["verified_at"] or datetime.now(timezone.utc)
            elif existing["status"] in ("created", "pending"):
                newly_verified = True
                verified_at = datetime.now(timezone.utc)
                await conn.execute(
                    """UPDATE payments
                       SET status = 'verified',
                           razorpay_payment_id = $1,
                           razorpay_signature = $2,
                           verified_at = $5
                       WHERE razorpay_order_id = $3 AND user_id = $4""",
                    razorpay_payment_id,
                    razorpay_signature,
                    razorpay_order_id,
                    user_id,
                    verified_at,
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Payment cannot be verified. Current status: {existing['status']}",
                )

            plan = existing["plan"]
            await set_entitlement_status(
                conn,
                user_id,
                plan,
                "active",
                source_order_id=razorpay_order_id,
                activated_at=verified_at,
            )
            await sync_profile_plan_state(conn, user_id, plan)

            if newly_verified:
                await conn.execute(
                    """UPDATE profiles
                       SET interviews_used_this_period = 0,
                           period_start = $2,
                           updated_at = NOW()
                       WHERE id = $1""",
                    user_id,
                    verified_at,
                )
                await conn.execute(
                    """INSERT INTO usage_events (user_id, event_type, metadata)
                       VALUES ($1, 'payment_verified', $2)""",
                    user_id,
                    json.dumps({
                        "plan": plan,
                        "order_id": razorpay_order_id,
                        "payment_id": razorpay_payment_id,
                    }),
                )

            profile = await conn.fetchrow(
                "SELECT full_name, email FROM profiles WHERE id = $1",
                user_id,
            )
            if not profile:
                raise RuntimeError("Payment owner profile no longer exists")

            # Recompute exact LTV values so retries never double-count revenue.
            await conn.execute(
                """INSERT INTO user_revenue_analytics (
                       user_id, email, full_name, pro_purchase_count, career_purchase_count,
                       pro_revenue_paise, career_revenue_paise, total_revenue_paise, last_payment_date
                   )
                   SELECT
                       p.id, p.email, p.full_name,
                       COUNT(pay.id) FILTER (WHERE pay.plan = 'pro' AND pay.status = 'verified'),
                       COUNT(pay.id) FILTER (WHERE pay.plan = 'career' AND pay.status = 'verified'),
                       COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.plan = 'pro' AND pay.status = 'verified'), 0),
                       COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.plan = 'career' AND pay.status = 'verified'), 0),
                       COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.status = 'verified'), 0),
                       MAX(pay.created_at) FILTER (WHERE pay.status = 'verified')
                   FROM profiles p
                   JOIN payments pay ON pay.user_id = p.id
                   WHERE p.id = $1
                   GROUP BY p.id, p.email, p.full_name
                   ON CONFLICT (user_id) DO UPDATE SET
                       email = EXCLUDED.email,
                       full_name = EXCLUDED.full_name,
                       pro_purchase_count = EXCLUDED.pro_purchase_count,
                       career_purchase_count = EXCLUDED.career_purchase_count,
                       pro_revenue_paise = EXCLUDED.pro_revenue_paise,
                       career_revenue_paise = EXCLUDED.career_revenue_paise,
                       total_revenue_paise = EXCLUDED.total_revenue_paise,
                       last_payment_date = EXCLUDED.last_payment_date,
                       updated_at = NOW()""",
                user_id,
            )

    result_status = "verified" if newly_verified else "already_verified"
    logger.info("razorpay_payment_verified", order_id=razorpay_order_id, user_id=user_id, plan=plan)

    if newly_verified:
        try:
            from app.services.email_service import send_admin_payment_notification

            plan_cfg = PLAN_CONFIG.get(plan, {})
            await send_admin_payment_notification(
                user_name=profile["full_name"] or "Unknown",
                user_email=profile["email"],
                plan=plan,
                amount_display=plan_cfg.get("price_display", f"Rs {plan_cfg.get('price_paise', 0) // 100}"),
                payment_status="verified",
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
            )
        except Exception as exc:
            logger.error("admin_notification_email_failed", error=str(exc))

    return {
        "status": result_status,
        "plan": plan,
        "active_plan": plan,
        "message": f"Payment verified. Your {plan.title()} plan is active for one month.",
    }


async def handle_webhook(raw_body: bytes | str, signature: str, event_id: str | None = None):
    """
    Handle Razorpay webhook events. Idempotent - safe to process multiple times.
    Used for reconciliation, NOT as the primary payment verification path.

    `raw_body` MUST be the exact request body bytes received from Razorpay.
    The signature is an HMAC over those raw bytes, so verifying a re-serialized
    dict (different key order / unicode escaping / whitespace) would fail.
    """
    settings = get_settings()

    body_str = raw_body.decode("utf-8") if isinstance(raw_body, (bytes, bytearray)) else str(raw_body)

    try:
        _get_client().utility.verify_webhook_signature(
            body_str,
            signature,
            # Webhooks are signed with the dashboard webhook secret, which may
            # differ from the API key secret. config populates this (falling
            # back to the key secret only when no separate webhook secret is set).
            settings.RAZORPAY_WEBHOOK_SECRET,
        )
    except Exception:
        logger.warning("razorpay_webhook_signature_failed")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    try:
        payload = json.loads(body_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON payload.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = payload.get("event", "")
    event_data = payload.get("payload", {})
    # Razorpay's unique delivery identifier is supplied in the
    # x-razorpay-event-id header by the router. Direct callers may provide the
    # signed payload field for compatibility, but production never relies on it.
    event_id = (event_id or payload.get("event_id") or "").strip()
    if not event_id or len(event_id) > 200:
        raise HTTPException(status_code=400, detail="Missing or invalid webhook event ID.")

    logger.info("razorpay_webhook_received", event_type=event_type, event_id=event_id)

    # ── Idempotency gate (dual-layer): webhook_events + billing_events ──
    async with DatabaseConnection() as conn:
        # Layer 1: Global webhook_events table (primary idempotency)
        already_in_webhook = await conn.fetchval(
            "SELECT processed FROM webhook_events WHERE event_id = $1",
            event_id,
        )
        if already_in_webhook is True:
            logger.info("webhook_event_already_processed", event_id=event_id)
            return {"status": "already_processed"}

        # Layer 2: Legacy billing_events check
        already_processed = await conn.fetchval(
            "SELECT processed FROM billing_events WHERE provider_event_id = $1",
            event_id,
        )
        if already_processed is True:
            await conn.execute(
                """UPDATE webhook_events
                   SET processed = TRUE, processed_at = COALESCE(processed_at, now())
                   WHERE event_id = $1""",
                event_id,
            )
            logger.info("webhook_event_already_processed_legacy", event_id=event_id)
            return {"status": "already_processed"}

        # Register in global webhook_events (claim this event_id)
        await conn.execute(
            """INSERT INTO webhook_events (event_id, event_type, source, payload)
               VALUES ($1, $2, 'razorpay', $3)
               ON CONFLICT (event_id) DO NOTHING""",
            event_id,
            event_type,
            json.dumps(payload),
        )

        # Log event in billing_events (idempotent insert)
        await conn.execute(
            """INSERT INTO billing_events (provider_event_id, event_type, payload, provider)
               VALUES ($1, $2, $3, 'razorpay')
               ON CONFLICT (provider_event_id) DO NOTHING""",
            event_id,
            event_type,
            json.dumps(payload),
        )

    if event_type == "payment.captured":
        payment_entity = event_data.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        payment_id = payment_entity.get("id")
        if not order_id or not payment_id:
            raise HTTPException(status_code=400, detail="Captured payment is missing required identifiers.")

        async with DatabaseConnection() as conn:
            async with conn.transaction():
                payment_row = await conn.fetchrow(
                    """SELECT user_id, plan, status, razorpay_payment_id, verified_at
                       FROM payments
                       WHERE razorpay_order_id = $1 FOR UPDATE""",
                    order_id,
                )
                if not payment_row:
                    logger.warning("webhook_payment_order_not_found", order_id=order_id, event_id=event_id)
                    raise RuntimeError("Webhook references an unknown payment order")
                if payment_row["status"] == "verified" and payment_row["razorpay_payment_id"] not in (None, payment_id):
                    raise RuntimeError("Webhook payment ID conflicts with the verified payment")
                if payment_row["status"] in ("failed", "expired", "refunded"):
                    raise RuntimeError(f"Captured payment cannot transition from {payment_row['status']}")

                newly_verified = payment_row["status"] != "verified"
                activated_at = (
                    payment_row["verified_at"]
                    or _coerce_webhook_time(payment_entity.get("created_at"))
                    or datetime.now(timezone.utc)
                )
                await conn.execute(
                    """UPDATE payments
                       SET status = 'verified',
                           razorpay_payment_id = $1,
                           verified_at = COALESCE(verified_at, $3)
                       WHERE razorpay_order_id = $2""",
                    payment_id,
                    order_id,
                    activated_at,
                )
                await set_entitlement_status(
                    conn,
                    payment_row["user_id"],
                    payment_row["plan"],
                    "active",
                    source_order_id=order_id,
                    activated_at=activated_at,
                )
                await sync_profile_plan_state(conn, payment_row["user_id"], payment_row["plan"])
                if newly_verified:
                    await conn.execute(
                        """UPDATE profiles
                           SET interviews_used_this_period = 0,
                               period_start = $2,
                               updated_at = NOW()
                           WHERE id = $1""",
                        payment_row["user_id"],
                        activated_at,
                    )
                    await conn.execute(
                        """INSERT INTO usage_events (user_id, event_type, metadata)
                           VALUES ($1, 'payment_verified', $2)""",
                        payment_row["user_id"],
                        json.dumps({"plan": payment_row["plan"], "order_id": order_id, "payment_id": payment_id}),
                    )

                await conn.execute(
                    """INSERT INTO user_revenue_analytics (
                           user_id, email, full_name, pro_purchase_count, career_purchase_count,
                           pro_revenue_paise, career_revenue_paise, total_revenue_paise, last_payment_date
                       )
                       SELECT
                           p.id, p.email, p.full_name,
                           COUNT(pay.id) FILTER (WHERE pay.plan = 'pro' AND pay.status = 'verified'),
                           COUNT(pay.id) FILTER (WHERE pay.plan = 'career' AND pay.status = 'verified'),
                           COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.plan = 'pro' AND pay.status = 'verified'), 0),
                           COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.plan = 'career' AND pay.status = 'verified'), 0),
                           COALESCE(SUM(pay.amount_paise) FILTER (WHERE pay.status = 'verified'), 0),
                           MAX(pay.created_at) FILTER (WHERE pay.status = 'verified')
                       FROM profiles p
                       JOIN payments pay ON pay.user_id = p.id
                       WHERE p.id = $1
                       GROUP BY p.id, p.email, p.full_name
                       ON CONFLICT (user_id) DO UPDATE SET
                           email = EXCLUDED.email,
                           full_name = EXCLUDED.full_name,
                           pro_purchase_count = EXCLUDED.pro_purchase_count,
                           career_purchase_count = EXCLUDED.career_purchase_count,
                           pro_revenue_paise = EXCLUDED.pro_revenue_paise,
                           career_revenue_paise = EXCLUDED.career_revenue_paise,
                           total_revenue_paise = EXCLUDED.total_revenue_paise,
                           last_payment_date = EXCLUDED.last_payment_date,
                           updated_at = NOW()""",
                    payment_row["user_id"],
                )
            logger.info("webhook_payment_reconciled", order_id=order_id)

    elif event_type == "payment.authorized":
        payment_entity = event_data.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        payment_id = payment_entity.get("id")
        if not order_id or not payment_id:
            raise HTTPException(status_code=400, detail="Authorized payment is missing required identifiers.")
        async with DatabaseConnection() as conn:
            result = await conn.execute(
                """UPDATE payments
                   SET status = 'pending', razorpay_payment_id = COALESCE($1, razorpay_payment_id)
                   WHERE razorpay_order_id = $2 AND status IN ('created','pending')""",
                payment_id, order_id,
            )
            if result == "UPDATE 0":
                known = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM payments WHERE razorpay_order_id = $1)", order_id
                )
                if not known:
                    raise RuntimeError("Authorized webhook references an unknown payment order")

    elif event_type == "payment.failed":
        payment_entity = event_data.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        if not order_id:
            raise HTTPException(status_code=400, detail="Failed payment is missing its order identifier.")
        async with DatabaseConnection() as conn:
            result = await conn.execute(
                """UPDATE payments SET status = 'failed'
                   WHERE razorpay_order_id = $1 AND status IN ('created', 'pending')""",
                order_id,
            )
            if result == "UPDATE 0":
                known = await conn.fetchval(
                    "SELECT EXISTS(SELECT 1 FROM payments WHERE razorpay_order_id = $1)", order_id
                )
                if not known:
                    raise RuntimeError("Failed webhook references an unknown payment order")

    elif event_type == "refund.processed":
        payment_entity = event_data.get("refund", {}).get("entity", {})
        payment_id = payment_entity.get("payment_id")
        if not payment_id:
            raise HTTPException(status_code=400, detail="Refund is missing its payment identifier.")
        async with DatabaseConnection() as conn:
            async with conn.transaction():
                payment_row = await conn.fetchrow(
                    """SELECT user_id, plan FROM payments
                       WHERE razorpay_payment_id = $1 FOR UPDATE""",
                    payment_id,
                )
                if not payment_row:
                    raise RuntimeError("Refund webhook references an unknown payment")
                await conn.execute(
                    """UPDATE payments
                       SET status = 'refunded', refunded_at = COALESCE(refunded_at, now())
                       WHERE razorpay_payment_id = $1""",
                    payment_id,
                )
                await set_entitlement_status(conn, payment_row["user_id"], payment_row["plan"], "refunded")
                await sync_profile_plan_state(conn, payment_row["user_id"])
            logger.info("refund_processed_plan_downgraded", payment_id=payment_id)

    # ── Mark the event as fully processed (idempotency completion) ──
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE billing_events SET processed = TRUE WHERE provider_event_id = $1",
                event_id,
            )
            await conn.execute(
                """UPDATE webhook_events
                   SET processed = TRUE, processed_at = now()
                   WHERE event_id = $1""",
                event_id,
            )

    return {"status": "processed"}
