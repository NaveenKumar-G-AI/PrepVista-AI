"""
PrepVista - Billing Router
Razorpay order creation, payment verification, switching active plans, and webhook handling.
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.plan_access import sync_profile_plan_state
from app.services.razorpay_service import create_order, handle_webhook, verify_payment

router = APIRouter()
logger = structlog.get_logger("prepvista.billing")


class CreateOrderRequest(BaseModel):
    plan: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class SwitchPlanRequest(BaseModel):
    plan: str


@router.post("/create-order")
async def create_razorpay_order(
    req: CreateOrderRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Create a Razorpay order for a new plan purchase."""
    if req.plan not in ("pro", "career"):
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'pro' or 'career'.")

    order_data = await create_order(user.id, user.email, req.plan)
    return order_data


@router.post("/verify-payment")
async def verify_razorpay_payment(
    req: VerifyPaymentRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Verify a Razorpay payment server-side and activate the purchased plan."""
    result = await verify_payment(
        user_id=user.id,
        razorpay_order_id=req.razorpay_order_id,
        razorpay_payment_id=req.razorpay_payment_id,
        razorpay_signature=req.razorpay_signature,
    )
    return result


@router.post("/switch-plan")
async def switch_active_plan(
    req: SwitchPlanRequest,
    user: UserProfile = Depends(get_current_user),
):
    """Switch the currently selected plan without repurchasing."""
    if req.plan not in ("free", "pro", "career"):
        raise HTTPException(status_code=400, detail="Invalid plan selection.")

    if req.plan != "free" and req.plan not in user.owned_plans:
        detail = f"You do not own the {req.plan.title()} plan yet. Purchase it first."
        if req.plan in user.expired_plans:
            detail = f"Your {req.plan.title()} plan expired. Renew it to restore access."
        raise HTTPException(
            status_code=403,
            detail=detail,
        )

    async with DatabaseConnection() as conn:
        plan_state = await sync_profile_plan_state(
            conn,
            user.id,
            req.plan,
            premium_override=user.premium_override,
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
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    signature = request.headers.get("x-razorpay-signature", "")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Razorpay signature header.")

    result = await handle_webhook(payload, signature)
    return result


@router.get("/status")
async def get_billing_status(user: UserProfile = Depends(get_current_user)):
    """Get current billing state, owned plans, and recent payments."""
    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT plan, subscription_status FROM profiles WHERE id = $1",
            user.id,
        )
        plan_state = await sync_profile_plan_state(
            conn,
            user.id,
            profile["plan"] if profile else user.plan,
            premium_override=user.premium_override,
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

    return {
        "current_plan": plan_state["selected_plan"],
        "active_plan": plan_state["selected_plan"],
        "owned_plans": plan_state["owned_plans"],
        "expired_plans": plan_state["expired_plans"],
        "highest_owned_plan": plan_state["highest_owned_plan"],
        "is_admin": user.is_admin,
        "subscription_status": plan_state["subscription_status"],
        "recent_payments": [
            {
                "plan": payment["plan"],
                "amount": f"Rs {payment['amount_paise'] // 100}",
                "status": payment["status"],
                "order_id": payment["razorpay_order_id"],
                "created_at": str(payment["created_at"]),
                "verified_at": str(payment["verified_at"]) if payment["verified_at"] else None,
            }
            for payment in payments
        ],
    }
