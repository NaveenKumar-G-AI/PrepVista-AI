"""
PrepVista - Account Router
Own-account management that does not change the auth flow structure.
"""

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.auth_identity import list_auth_user_ids_for_profile
from app.services.public_growth import refresh_public_growth_metrics

router = APIRouter()
logger = structlog.get_logger("prepvista.account")

# Persistent httpx client for Supabase API calls
_supabase_client: httpx.AsyncClient | None = None


def _get_supabase_client() -> httpx.AsyncClient:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = httpx.AsyncClient(timeout=15.0)
    return _supabase_client


async def _delete_supabase_auth_user(user_id: str) -> None:
    """Delete the matching Supabase auth user with the service role key."""
    settings = get_settings()
    client = _get_supabase_client()
    resp = await client.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        },
    )

    if resp.status_code == 404:
        return

    if resp.status_code >= 400:
        try:
            data = resp.json()
        except Exception:
            data = {}
        detail = (
            data.get("msg")
            or data.get("error")
            or data.get("error_description")
            or resp.text
            or "Supabase auth user cleanup failed."
        )
        raise RuntimeError(detail)


@router.delete("/me")
async def delete_account(user: UserProfile = Depends(get_current_user)):
    """Delete the current user's live account data and archive minimal identity."""
    if user.premium_override:
        raise HTTPException(status_code=403, detail="Admin accounts cannot be deleted from the product UI.")

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            """SELECT full_name, email
               FROM profiles
               WHERE id = $1""",
            user.id,
        )
        linked_auth_user_ids = await list_auth_user_ids_for_profile(conn, user.id)

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    auth_user_ids = linked_auth_user_ids or [user.id]
    for auth_user_id in auth_user_ids:
        try:
            await _delete_supabase_auth_user(auth_user_id)
        except Exception as exc:
            logger.error("account_delete_auth_cleanup_failed", user_id=user.id, auth_user_id=auth_user_id, error=str(exc))
            raise HTTPException(
                status_code=503,
                detail="Account deletion is temporarily unavailable. Please try again.",
            ) from exc

    async with DatabaseConnection() as conn:
        async with conn.transaction():
            await conn.execute(
                """DELETE FROM launch_offer_grants
                   WHERE user_id = $1
                     AND status = ANY($2::text[])""",
                user.id,
                ["pending", "rejected"],
            )
            await conn.execute(
                """INSERT INTO old_user (full_name, email)
                   VALUES ($1, $2)""",
                profile["full_name"],
                profile["email"],
            )
            await conn.execute(
                "DELETE FROM profiles WHERE id = $1",
                user.id,
            )
            await refresh_public_growth_metrics(conn)

    logger.info("account_deleted", user_id=user.id, email=profile["email"])
    return {"status": "deleted", "message": "Your account and interview data were deleted successfully."}
