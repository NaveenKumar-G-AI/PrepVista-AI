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
from app.services.plan_access import activate_plan_entitlement, sync_profile_plan_state
from app.routers.admin import _OVERVIEW_CACHE as _admin_overview_cache

router = APIRouter()
logger = structlog.get_logger("prepvista.admin.grants")

# Maximum admin_bonus_interviews accrued via repeated "free normal" activate calls.
# Without this cap, 50 accidental clicks grant +100 bonus interviews with no
# audit trail and no recovery path short of a manual DB update.
# Value chosen to allow ~10 legitimate stacking grants (2 each) before capping.
_FREE_NORMAL_BONUS_CAP: int = 20


def require_admin(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    if not current_user.is_admin and not current_user.premium_override:
        raise HTTPException(status_code=403, detail="Admin permissions required to manipulate tier grants.")
    return current_user


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
async def grant_admin_access(
    payload: AdminGrantRequest,
    current_user: UserProfile = Depends(require_admin),
):
    """Apply targeted overrides or unlocks to a user's subscription natively."""
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

    # ── Pre-action forensic audit log ─────────────────────────────────────────
    logger.info(
        "admin_grant_request_received",
        admin_email=current_user.email,
        target_user_id=target_user_id,
        model=model,
        value=value,
        action=action,
    )

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            "SELECT email FROM profiles WHERE id = $1", target_user_id
        )
        if not profile:
            raise HTTPException(status_code=404, detail="User not found.")

        target_email = profile["email"]

        # ── TRANSACTION: all mutations are atomic ─────────────────────────────
        # Previously none of the multi-step mutations in either branch were
        # wrapped in a transaction. Failure scenarios without this:
        #
        # DEACTIVATE crash scenario:
        #   _clear_model_bonus_override succeeds (bonus cleared) →
        #   expire_launch_offer_grant succeeds (offer marked expired) →
        #   UPDATE user_plan_entitlements throws (transient deadlock)
        #   Result: bonus cleared + offer expired, but entitlement still 'active'.
        #   Student retains plan access. Admin sees "success" but nothing was
        #   fully revoked. Detecting this requires reading three tables manually.
        #
        # ACTIVATE crash scenario:
        #   bonus UPDATE succeeds →
        #   activate_plan_entitlement throws
        #   Result: bonus applied, entitlement never created. Student has bonus
        #   interviews but cannot access the plan features gated by entitlement.
        #
        # asyncpg handles nested conn.transaction() calls inside service
        # functions as SAVEPOINTs — correct nesting behavior, no conflicts.
        async with conn.transaction():
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
                        target_user_id, model,
                    )
                    await sync_profile_plan_state(conn, target_user_id, "free")
                    logger.info(
                        "admin_entitlement_revoked",
                        admin_email=current_user.email,
                        target_user_id=target_user_id,
                        target_email=target_email,
                        model=model,
                        launch_offer_revoked=bool(launch_offer_row),
                    )
                else:
                    logger.info(
                        "admin_grant_revoked",
                        admin_email=current_user.email,
                        target_user_id=target_user_id,
                        target_email=target_email,
                        model=model,
                    )

            else:
                # ── Action = ACTIVATE ─────────────────────────────────────────

                if model == "free":
                    if value == "unlimited":
                        await conn.execute(
                            "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                            target_user_id, int(AdminUnlimitedGrant.FREE_UNLIMITED),
                        )
                    elif value == "normal":
                        # ── Stacking cap ──────────────────────────────────────
                        # Previously used admin_bonus_interviews + 2 with no upper
                        # bound. 50 accidental clicks → +100 bonus interviews with
                        # no audit trail. LEAST() enforces _FREE_NORMAL_BONUS_CAP
                        # at the DB level — atomically, without a read-modify-write
                        # race — while still allowing up to 10 legitimate stacking
                        # grants before the cap is reached.
                        await conn.execute(
                            """UPDATE profiles
                               SET admin_bonus_interviews = LEAST(admin_bonus_interviews + 2, $2)
                               WHERE id = $1""",
                            target_user_id,
                            _FREE_NORMAL_BONUS_CAP,
                        )

                elif model == "pro":
                    entitlement = await conn.fetchrow(
                        """SELECT id FROM user_plan_entitlements
                           WHERE user_id = $1 AND plan = 'pro' AND status = 'active'""",
                        target_user_id,
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
                                target_user_id,
                            )
                    else:
                        if value == "unlimited":
                            await conn.execute(
                                "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                                target_user_id, int(AdminUnlimitedGrant.PRO_UNLIMITED),
                            )
                        await activate_plan_entitlement(
                            conn, target_user_id, "pro", source_order_id="manual_grant"
                        )

                elif model == "career":
                    # ── Idempotency guard — mirrors pro branch ─────────────────
                    # Previously career always called activate_plan_entitlement
                    # unconditionally. A double-submit (or accidental repeat) for
                    # a user already holding an active career plan created a second
                    # entitlement row — potential duplicate-slot bugs downstream.
                    # Now matches the identical guard pattern used for pro.
                    career_entitlement = await conn.fetchrow(
                        """SELECT id FROM user_plan_entitlements
                           WHERE user_id = $1 AND plan = 'career' AND status = 'active'""",
                        target_user_id,
                    )
                    if career_entitlement:
                        # Plan already active — only update the bonus if requested.
                        if value == "unlimited":
                            await conn.execute(
                                "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                                target_user_id, int(AdminUnlimitedGrant.CAREER_UNLIMITED),
                            )
                        # 'normal' on an already-active career plan: no-op bonus
                        # (career has no additive stacking equivalent to pro's +15).
                    else:
                        if value == "unlimited":
                            await conn.execute(
                                "UPDATE profiles SET admin_bonus_interviews = $2 WHERE id = $1",
                                target_user_id, int(AdminUnlimitedGrant.CAREER_UNLIMITED),
                            )
                        await activate_plan_entitlement(
                            conn, target_user_id, "career", source_order_id="manual_grant"
                        )

                logger.info(
                    "admin_grant_applied",
                    admin_email=current_user.email,
                    target_user_id=target_user_id,
                    target_email=target_email,
                    model=model,
                    value=value,
                )

                # Resync to ensure new plans manifest immediately on the student's
                # next request. Runs inside the transaction so the updated plan
                # state commits atomically with all entitlement changes above.
                await sync_profile_plan_state(conn, target_user_id, "free")

    # ── Invalidate admin overview cache ───────────────────────────────────────
    # Placed outside the DatabaseConnection context — cache invalidation cannot
    # affect the already-committed DB state and must not block on a DB error.
    _admin_overview_cache.clear()

    if action == "deactivate":
        return {
            "status": "success",
            "message": f"{model.title()} tier grants successfully deactivated for {target_email}.",
        }
    return {
        "status": "success",
        "message": f"Successfully activated {value.title()} {model.title()} tier override for {target_email}.",
    }
