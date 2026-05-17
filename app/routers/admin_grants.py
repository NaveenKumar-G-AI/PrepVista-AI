"""
PrepVista - Admin Grants
Endpoints for manipulating fine-grained user subscription limits and tiers manually.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import structlog

from app.config import AdminUnlimitedGrant, ADMIN_UNLIMITED_BY_PLAN, ADMIN_UNLIMITED_VALUES
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.launch_offer import expire_launch_offer_grant
from app.services.plan_access import activate_plan_entitlement

router = APIRouter()
logger = structlog.get_logger("prepvista.admin.grants")


class AdminGrantRequest(BaseModel):
    user_id: str
    model: str  # 'free', 'pro', 'career'
    value: str  # 'normal', 'unlimited'
    action: str # 'activate', 'deactivate'


async def _clear_model_bonus_override(conn, target_user_id: str, model: str) -> None:
    """Remove the stored bonus marker that belongs to the selected model."""
    current_bonus = await conn.fetchval(
        "SELECT admin_bonus_interviews FROM profiles WHERE id = $1",
        target_user_id,
    )
    current_bonus = int(current_bonus or 0)

    model_sentinel = ADMIN_UNLIMITED_BY_PLAN.get(model)
    if current_bonus == model_sentinel:
        updated_bonus = 0
    elif model == "free":
        updated_bonus = 0
    elif model == "pro" and current_bonus >= 15 and current_bonus not in ADMIN_UNLIMITED_VALUES:
        updated_bonus = max(0, current_bonus - 15)
    else:
        updated_bonus = current_bonus

    if updated_bonus != current_bonus:
        await conn.execute(
            "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
            target_user_id,
            updated_bonus,
        )


@router.post("")
async def grant_admin_access(payload: AdminGrantRequest, current_user: UserProfile = Depends(get_current_user)):
    """Apply targeted overrides or unlocks to a user's subscription natively."""
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required to manipulate tier grants.")

    target_user_id = payload.user_id
    model = payload.model.lower()
    value = payload.value.lower()
    action = payload.action.lower()

    if model not in {"free", "pro", "career"}:
        raise HTTPException(status_code=400, detail="Invalid model identifier.")
    if value not in {"normal", "unlimited"}:
        raise HTTPException(status_code=400, detail="Invalid value tier.")
    if action not in {"activate", "deactivate"}:
        raise HTTPException(status_code=400, detail="Action must be activate or deactivate.")

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow("SELECT email FROM profiles WHERE id = $1", target_user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="User not found.")

        target_email = profile["email"]

        if action == "deactivate":
            await _clear_model_bonus_override(conn, target_user_id, model)

            if model != "free":
                launch_offer_row = await expire_launch_offer_grant(
                    conn,
                    target_user_id,
                    model,
                    current_user.email,
                )
                await conn.execute(
                    """UPDATE user_plan_entitlements 
                       SET status = 'expired' 
                       WHERE user_id = $1 AND plan = $2 AND status = 'active'""",
                    target_user_id, model
                )
                from app.services.plan_access import sync_profile_plan_state
                await sync_profile_plan_state(conn, target_user_id, "free")
                logger.info(
                    "admin_entitlement_revoked",
                    admin=current_user.email,
                    target=target_user_id,
                    model=model,
                    launch_offer_revoked=bool(launch_offer_row),
                )
            else:
                logger.info("admin_grant_revoked", admin=current_user.email, target=target_user_id, model=model)

            return {"status": "success", "message": f"{model.title()} tier grants successfully deactivated for {target_email}."}

        # Action = ACTIVATE
        bonus_value = 9999 if value == "unlimited" else 0

        if model == "free":
            if value == "unlimited":
                await conn.execute(
                    "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                    target_user_id, int(AdminUnlimitedGrant.FREE_UNLIMITED),
                )
            elif value == "normal":
                await conn.execute(
                    "UPDATE profiles SET admin_bonus_interviews = admin_bonus_interviews + 2 WHERE id = $1",
                    target_user_id
                )
        elif model == "pro":
            # Check if they already have Pro
            entitlement = await conn.fetchrow(
                """SELECT id FROM user_plan_entitlements 
                   WHERE user_id = $1 AND plan = 'pro' AND status = 'active'""",
                target_user_id
            )
            
            if entitlement:
                if value == "unlimited":
                    await conn.execute(
                        "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                        target_user_id, int(AdminUnlimitedGrant.PRO_UNLIMITED),
                    )
                else:
                    await conn.execute(
                        "UPDATE profiles SET admin_bonus_interviews = admin_bonus_interviews + 15 WHERE id = $1",
                        target_user_id
                    )
            else:
                if value == "unlimited":
                    await conn.execute(
                        "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                        target_user_id, int(AdminUnlimitedGrant.PRO_UNLIMITED),
                    )
                await activate_plan_entitlement(conn, target_user_id, "pro", source_order_id="manual_grant")

        elif model == "career":
            if value == "unlimited":
                await conn.execute(
                    "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                    target_user_id, int(AdminUnlimitedGrant.CAREER_UNLIMITED),
                )
            await activate_plan_entitlement(conn, target_user_id, "career", source_order_id="manual_grant")

        logger.info("admin_grant_applied", admin=current_user.email, target=target_user_id, model=model, value=value)
        
        # Resync to ensure new plans manifest immediately
        from app.services.plan_access import sync_profile_plan_state
        await sync_profile_plan_state(conn, target_user_id, "free")

    return {
        "status": "success", 
        "message": f"Successfully activated {value.title()} {model.title()} tier override for {target_email}."
    }
