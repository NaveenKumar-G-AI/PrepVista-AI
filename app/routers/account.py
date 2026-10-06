"""
PrepVista - Account Router
Own-account management that does not change the auth flow structure.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MIGRATION REQUIRED BEFORE DEPLOYING THIS FILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run these two statements against your database BEFORE deploying:

    -- 1. Add user_id column for post-deletion DSAR / audit correlation
    ALTER TABLE old_user
        ADD COLUMN IF NOT EXISTS user_id uuid;

    -- 2. Add unique constraint on email to enable ON CONFLICT guard
    --    (skip if already present)
    ALTER TABLE old_user
        ADD CONSTRAINT IF NOT EXISTS old_user_email_unique UNIQUE (email);

Without migration step 1  → INSERT fails with "column does not exist."
Without migration step 2  → ON CONFLICT fails with "constraint not found."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.auth_identity import list_auth_user_ids_for_profile
from app.services.public_growth import refresh_public_growth_metrics

router = APIRouter()
logger = structlog.get_logger("prepvista.account")

# ── Persistent httpx client with bounded connection pool ─────────────────────
# Initialized at module load time — httpx.AsyncClient is safe to construct
# without a running event loop, which eliminates the TOCTOU race that the old
# lazy-singleton pattern had under concurrent coroutine scheduling.
#
# Granular timeout breakdown:
#   connect=5.0  — TLS + TCP handshake; fast failure on unreachable host
#   read=15.0    — response body read; matches original 15 s intent
#   write=10.0   — request body send
#   pool=5.0     — max wait for a free connection slot from the pool
#
# Connection pool limits prevent OS file-descriptor exhaustion at 500 users:
#   max_keepalive_connections=20  — warm idle connections reused by next caller
#   max_connections=50            — hard cap on simultaneous open sockets
#   keepalive_expiry=30.0         — idle connections closed after 30 s
_supabase_client: httpx.AsyncClient = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0),
    limits=httpx.Limits(
        max_keepalive_connections=20,
        max_connections=50,
        keepalive_expiry=30.0,
    ),
)

_MAX_AUTH_DELETE_RETRIES: int = 2
_AUTH_DELETE_RETRY_BASE_DELAY: float = 0.4  # seconds; doubles each attempt → 0.4 s, 0.8 s


async def close_supabase_client() -> None:
    """
    Gracefully drain and close the shared Supabase httpx client.

    Without this call on shutdown the underlying TCP connection pool leaks open
    sockets — observable as "unclosed socket" ResourceWarnings in logs and
    eventual FD exhaustion on frequent hot-reloads or Kubernetes pod cycling.

    Register this in your FastAPI app lifespan (main.py or app factory):

        from contextlib import asynccontextmanager
        from app.routers.account import close_supabase_client

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            yield                          # startup (add any warm-up here)
            await close_supabase_client()  # shutdown

        app = FastAPI(lifespan=lifespan)
    """
    await _supabase_client.aclose()
    logger.info("supabase_client_closed")


async def _delete_supabase_auth_user(user_id: str) -> None:
    """Delete the matching Supabase auth user with the service role key."""
    settings = get_settings()
    resp = await _supabase_client.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        },
    )

    if resp.status_code == 404:
        # Auth user already absent — treat as success (idempotent deletion).
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


async def _delete_supabase_auth_user_with_retry(auth_user_id: str) -> None:
    """
    Attempt Supabase auth deletion with exponential backoff on transient failure.

    Retries up to _MAX_AUTH_DELETE_RETRIES times (delays: 0.4 s, 0.8 s) before
    re-raising. Each retry is emitted as a structured WARNING so on-call engineers
    can distinguish repeated upstream instability from a hard failure without
    triggering a full error alarm on the first transient hiccup.
    """
    last_exc: Exception | None = None
    for attempt in range(_MAX_AUTH_DELETE_RETRIES + 1):
        try:
            await _delete_supabase_auth_user(auth_user_id)
            return
        except RuntimeError as exc:
            last_exc = exc
            if attempt < _MAX_AUTH_DELETE_RETRIES:
                delay = _AUTH_DELETE_RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    "account_delete_auth_retry",
                    auth_user_id=auth_user_id,
                    attempt=attempt + 1,
                    max_retries=_MAX_AUTH_DELETE_RETRIES,
                    retry_delay_s=delay,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

    # All attempts exhausted — re-raise the last recorded exception.
    raise last_exc  # type: ignore[misc]


async def _safe_delete_auth_user(
    auth_user_id: str,
) -> tuple[str, Exception | None]:
    """
    Non-raising wrapper for asyncio.gather fan-out.

    Returns (auth_user_id, None) on success or (auth_user_id, exc) on failure.
    Because this never raises, gather always completes in full — all auth IDs
    are attempted and all failures are collected before any HTTPException fires.
    """
    try:
        await _delete_supabase_auth_user_with_retry(auth_user_id)
        return auth_user_id, None
    except Exception as exc:  # noqa: BLE001
        return auth_user_id, exc


import json
from app.services.storage_cleanup import parse_and_delete_storage_path

async def _run_deletion_saga(request_id: int, auth_user_ids: list[str], storage_paths: list[str]):
    import asyncio
    from app.database.connection import DatabaseConnection

    # 1. Auth deletion
    results = await asyncio.gather(*[_safe_delete_auth_user(aid) for aid in auth_user_ids])
    failed_auth = [(aid, exc) for aid, exc in results if exc is not None]

    async with DatabaseConnection() as conn:
        if failed_auth:
            await conn.execute("UPDATE account_deletion_requests SET status = 'FAILED', last_error = $2, updated_at = NOW() WHERE id = $1", request_id, f"Auth fail: {failed_auth}")
            return
        await conn.execute("UPDATE account_deletion_requests SET status = 'AUTH_DELETED', updated_at = NOW() WHERE id = $1", request_id)

    # 2. Storage deletion
    storage_results = await asyncio.gather(*[parse_and_delete_storage_path(p) for p in storage_paths])
    failed_storage = [p for p, success in zip(storage_paths, storage_results) if not success]

    async with DatabaseConnection() as conn:
        if failed_storage:
            await conn.execute("UPDATE account_deletion_requests SET status = 'FAILED', last_error = $2, updated_at = NOW() WHERE id = $1", request_id, f"Storage fail: {failed_storage}")
            return
        await conn.execute("UPDATE account_deletion_requests SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1", request_id)


@router.delete("/me")
async def delete_account(background_tasks: BackgroundTasks, user: UserProfile = Depends(get_current_user)):
    """Delete the current user's live account data and archive minimal identity."""
    if user.premium_override:
        raise HTTPException(
            status_code=403,
            detail="Admin accounts cannot be deleted from the product UI.",
        )

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

        logger.info(
            "account_delete_initiated",
            user_id=user.id,
            email=profile["email"],
            auth_user_count=len(auth_user_ids),
        )

        audio_paths_res = await conn.fetch(
            "SELECT interview_audio_turns.audio_object_path FROM interview_audio_turns JOIN interview_sessions ON interview_sessions.id = interview_audio_turns.session_id WHERE interview_sessions.user_id = $1 AND interview_audio_turns.audio_object_path IS NOT NULL", user.id
        )
        pdf_paths_res = await conn.fetch("SELECT pdf_file_path FROM reports WHERE user_id = $1 AND pdf_file_path IS NOT NULL", user.id)
        support_paths_res = await conn.fetch("SELECT attachment_url FROM support_messages WHERE user_id = $1 AND attachment_url IS NOT NULL", user.id)
        resume_paths_res = await conn.fetch("SELECT resume_file_path FROM interview_sessions WHERE user_id = $1 AND resume_file_path IS NOT NULL", user.id)

        paths = []
        paths.extend(r["audio_object_path"] for r in audio_paths_res)
        paths.extend(r["pdf_file_path"] for r in pdf_paths_res)
        paths.extend(r["attachment_url"] for r in support_paths_res)
        paths.extend(r["resume_file_path"] for r in resume_paths_res)

        async with conn.transaction():
            request_id = await conn.fetchval(
                "INSERT INTO account_deletion_requests (user_id, email, auth_user_ids, storage_paths, status) VALUES ($1, $2, $3, $4::jsonb, 'REQUESTED') RETURNING id",
                user.id, profile["email"], auth_user_ids, json.dumps(paths)
            )

            await conn.execute(
                """DELETE FROM launch_offer_grants
                   WHERE user_id = $1
                     AND status = ANY($2::text[])""",
                user.id,
                ["pending", "rejected"],
            )
            await conn.execute(
                """INSERT INTO old_user (user_id, full_name, email)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (email) DO NOTHING""",
                user.id,
                profile["full_name"],
                profile["email"],
            )
            await conn.execute(
                "DELETE FROM profiles WHERE id = $1",
                user.id,
            )
            await conn.execute("UPDATE account_deletion_requests SET status = 'DB_DELETED' WHERE id = $1", request_id)

    background_tasks.add_task(_run_deletion_saga, request_id, auth_user_ids, paths)

    try:
        async with DatabaseConnection() as conn:
            await refresh_public_growth_metrics(conn)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "account_delete_metrics_refresh_failed",
            user_id=user.id,
            error=str(exc),
        )

    logger.info("account_deleted", user_id=user.id, email=profile["email"])
    return {
        "status": "deleted",
        "message": "Your account and interview data were deleted successfully.",
    }
