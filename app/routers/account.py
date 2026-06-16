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
from fastapi import APIRouter, Depends, HTTPException

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


@router.delete("/me")
async def delete_account(user: UserProfile = Depends(get_current_user)):
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

    # ── Pre-irreversible-action audit trail ───────────────────────────────────
    # Emitted BEFORE any Supabase call. If auth deletion succeeds but the DB
    # transaction subsequently fails, this log entry is the only forensic record
    # proving which auth accounts were wiped and when — enabling manual recovery
    # or DPDP/GDPR compliance reporting without guesswork.
    logger.info(
        "account_delete_initiated",
        user_id=user.id,
        email=profile["email"],
        auth_user_count=len(auth_user_ids),
    )

    # ── Fan-out: delete all linked auth users in parallel ─────────────────────
    # asyncio.gather runs all deletions concurrently, reducing latency from
    # O(N × Supabase_RTT) to O(1 × Supabase_RTT) regardless of linked ID count.
    # _safe_delete_auth_user never raises so gather completes fully and every
    # result is inspected before deciding whether to abort.
    results: list[tuple[str, Exception | None]] = await asyncio.gather(
        *[_safe_delete_auth_user(aid) for aid in auth_user_ids]
    )

    failed = [(aid, exc) for aid, exc in results if exc is not None]
    if failed:
        for auth_user_id, exc in failed:
            logger.error(
                "account_delete_auth_cleanup_failed",
                user_id=user.id,
                auth_user_id=auth_user_id,
                error=str(exc),
            )
        raise HTTPException(
            status_code=503,
            detail="Account deletion is temporarily unavailable. Please try again.",
        )

    logger.info(
        "account_delete_auth_complete",
        user_id=user.id,
        auth_user_count=len(auth_user_ids),
    )

    # ── DB cleanup: transaction covers ONLY the atomic deletion steps ─────────
    #
    # WHY refresh_public_growth_metrics IS OUTSIDE THIS TRANSACTION:
    # ─────────────────────────────────────────────────────────────────
    # Previously the metrics refresh ran inside this transaction. That created a
    # critical split-brain risk: if refresh_public_growth_metrics threw for any
    # reason (aggregation timeout, deadlock, broken view dependency), the ENTIRE
    # transaction rolled back — leaving the user's Supabase auth accounts deleted
    # but their profiles row still alive. The user could not log in and could not
    # re-trigger deletion. Manual DB surgery was the only recovery path.
    #
    # Moving it outside means: once DELETE FROM profiles commits, the deletion is
    # permanent and consistent regardless of what happens to the metrics refresh.
    # Metrics inconsistency is self-healing — the next successful refresh recomputes
    # correct counts automatically.
    #
    # WHY ON CONFLICT (email) DO NOTHING:
    # ─────────────────────────────────────
    # A user who previously deleted their account, re-registered with the same
    # email, and now deletes again would produce a duplicate row in old_user. If
    # old_user.email has a UNIQUE constraint (which it should, for data integrity),
    # a bare INSERT throws a PG unique_violation INSIDE the transaction — causing
    # the same split-brain scenario described above: auth gone, profile alive.
    # ON CONFLICT (email) DO NOTHING makes the archive insert idempotent.
    # REQUIRES: UNIQUE constraint on old_user.email — see migration note at top.
    #
    # WHY user_id IS ARCHIVED:
    # ─────────────────────────
    # All audit logs (account_delete_initiated, account_deleted, etc.) carry
    # user_id as their primary correlation key. Without user_id in old_user, a
    # DSAR (Data Subject Access Request) received after deletion cannot be
    # connected back to those log entries. user_id in old_user closes that gap.
    # REQUIRES: old_user.user_id column — see migration note at top.
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

    # ── Metrics refresh: best-effort, outside transaction ────────────────────
    # Runs after the deletion has already committed. A failure here does NOT
    # undo the deletion — the account is gone, which is correct and irreversible.
    # The error is logged for monitoring; the next successful refresh will
    # recompute correct growth counts automatically.
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
