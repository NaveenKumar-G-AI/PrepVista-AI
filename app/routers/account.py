"""Own-account local deletion and durable external-cleanup scheduling."""
import asyncio
import json
from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.public_growth import refresh_public_growth_metrics
from app.services.storage_cleanup import resolve_storage_reference

router = APIRouter()
logger = structlog.get_logger("prepvista.account")
_supabase_client = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0),
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=30.0),
)
_MAX_AUTH_DELETE_RETRIES = 2
_AUTH_DELETE_RETRY_BASE_DELAY = 0.4


class AuthDeletionError(RuntimeError):
    def __init__(self, retryable):
        self.retryable = retryable
        super().__init__("AUTH_PROVIDER_FAILURE")


async def close_supabase_client():
    await _supabase_client.aclose()


async def _delete_supabase_auth_user(user_id):
    settings = get_settings()
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise AuthDeletionError(True)
    try:
        resp = await _supabase_client.delete(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={"apikey": settings.SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"},
        )
    except httpx.HTTPError:
        raise AuthDeletionError(True) from None
    if resp.status_code == 404 or 200 <= resp.status_code < 300:
        return
    raise AuthDeletionError(resp.status_code in {408, 429} or resp.status_code >= 500)


async def _delete_supabase_auth_user_with_retry(auth_user_id):
    for attempt in range(_MAX_AUTH_DELETE_RETRIES + 1):
        try:
            await _delete_supabase_auth_user(auth_user_id)
            return
        except AuthDeletionError as exc:
            if not exc.retryable or attempt == _MAX_AUTH_DELETE_RETRIES:
                raise
            logger.info("account_delete_auth_retry", attempt=attempt+1, reason="TRANSIENT_PROVIDER_FAILURE")
            await asyncio.sleep(_AUTH_DELETE_RETRY_BASE_DELAY * 2**attempt)


async def _safe_delete_auth_user(auth_user_id):
    try:
        await _delete_supabase_auth_user_with_retry(auth_user_id)
        return auth_user_id, None
    except Exception as exc:
        return auth_user_id, exc


@router.delete("/me")
async def delete_account(background_tasks: BackgroundTasks, user: UserProfile = Depends(get_current_user)):
    """Commit local deletion plus verified targets, then wake the shared dispatcher."""
    if user.premium_override:
        raise HTTPException(status_code=403, detail="Admin accounts cannot be deleted from the product UI.")
    owner = str(UUID(str(user.id)))
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            profile = await conn.fetchrow(
                "SELECT full_name, email FROM profiles WHERE id=$1 FOR UPDATE", user.id)
            if not profile:
                raise HTTPException(status_code=404, detail="Profile not found.")
            links = await conn.fetch(
                "SELECT auth_user_id FROM auth_identity_links WHERE profile_id=$1 ORDER BY auth_user_id FOR UPDATE",
                user.id)
            auth_ids = [str(r["auth_user_id"]) for r in links] or [owner]
            # The fallback identity must not belong to another live profile.
            if await conn.fetchval("""
                SELECT EXISTS(SELECT 1 FROM auth_identity_links
                  WHERE auth_user_id=ANY($1::uuid[]) AND profile_id<>$2)
            """, [UUID(a) for a in auth_ids], user.id):
                raise HTTPException(status_code=409, detail="Account cleanup requires review.")

            # Lock parents before children: FK inserts must wait for deletion,
            # and existing source updates must settle before targets are frozen.
            await conn.fetch("SELECT id FROM interview_sessions WHERE user_id=$1 ORDER BY id FOR UPDATE", user.id)
            audio = await conn.fetch("""
                SELECT a.audio_object_path AS path, a.session_id
                FROM interview_audio_turns a JOIN interview_sessions s ON s.id=a.session_id
                WHERE s.user_id=$1 AND a.audio_object_path IS NOT NULL FOR UPDATE OF a
            """, user.id)
            resumes = await conn.fetch("""
                SELECT resume_file_path AS path, id AS session_id FROM interview_sessions
                WHERE user_id=$1 AND resume_file_path IS NOT NULL FOR UPDATE
            """, user.id)
            other = await conn.fetch("""
                SELECT pdf_file_path AS path FROM reports WHERE user_id=$1 AND pdf_file_path IS NOT NULL FOR UPDATE
            """, user.id)
            other += await conn.fetch("""
                SELECT attachment_url AS path FROM support_messages
                WHERE user_id=$1 AND attachment_url IS NOT NULL FOR UPDATE
            """, user.id)
            bindings = []
            for row in [*audio, *resumes, *other]:
                path = row["path"]
                target = resolve_storage_reference(path)
                session = str(row["session_id"]) if "session_id" in row else None
                # Ownership comes from the scoped source and its namespace together.
                if target is None or target[1].split("/", 1)[0] not in {owner, session}:
                    raise HTTPException(status_code=409, detail="Account cleanup requires review.")
                bindings.append({"path": path, "user_id": owner,
                                 "session_id": session if target[1].split("/", 1)[0] == session else None})
            # Deduplicate exact references without changing their original spelling.
            bindings = list({b["path"]: b for b in bindings}.values())
            paths = [b["path"] for b in bindings]
            request_id = await conn.fetchval("""
                INSERT INTO account_deletion_requests(user_id,email,auth_user_ids,storage_paths,status)
                VALUES($1,$2,$3,$4::jsonb,'REQUESTED') RETURNING id
            """, user.id, profile["email"], auth_ids, json.dumps(paths))
            receipt = {"version": 1, "request_id": request_id, "user_id": owner,
                       "auth_user_ids": auth_ids, "storage_paths": paths,
                       "storage_bindings": bindings, "db_deleted": True}
            archives = await conn.fetch(
                "SELECT id,user_id,metadata FROM old_user WHERE user_id=$1 FOR UPDATE",
                user.id)
            if archives:
                if len(archives) != 1 or str(archives[0]["user_id"]) != owner:
                    raise HTTPException(status_code=409, detail="Account cleanup requires review.")
                archive = archives[0]
                metadata = archive["metadata"]
                metadata = json.loads(metadata) if isinstance(metadata, str) else metadata
                # Never turn legacy NULL/missing receipts into verified history.
                if (not isinstance(metadata, dict)
                        or not isinstance(metadata.get("deletion_requests"), dict)
                        or not metadata["deletion_requests"]):
                    raise HTTPException(status_code=409, detail="Account cleanup requires review.")
                receipts = metadata["deletion_requests"]
                if str(request_id) in receipts:
                    raise HTTPException(status_code=409, detail="Account cleanup requires review.")
                receipts[str(request_id)] = receipt
                await conn.execute("UPDATE old_user SET metadata=$2::jsonb WHERE id=$1",
                                   archive["id"], json.dumps(metadata))
            else:
                # Production need not have a unique email constraint. Insert the
                # new request's complete receipt, never an empty legacy archive.
                archive_id = await conn.fetchval("""
                    INSERT INTO old_user(user_id,full_name,email,metadata)
                    VALUES($1,$2,$3,$4::jsonb) RETURNING id
                """, user.id, profile["full_name"], profile["email"],
                    json.dumps({"deletion_requests": {str(request_id): receipt}}))
                if archive_id is None:
                    raise HTTPException(status_code=409, detail="Account cleanup requires review.")
            await conn.execute("""
                DELETE FROM launch_offer_grants WHERE user_id=$1 AND status=ANY($2::text[])
            """, user.id, ["pending", "rejected"])
            await conn.execute("DELETE FROM profiles WHERE id=$1", user.id)
            await conn.execute("""
                UPDATE account_deletion_requests SET status='DB_DELETED',updated_at=clock_timestamp() WHERE id=$1
            """, request_id)
    from app.services.deletion_worker import dispatch_deletion
    background_tasks.add_task(dispatch_deletion, request_id)
    try:
        async with DatabaseConnection() as conn:
            await refresh_public_growth_metrics(conn)
    except Exception:
        logger.warning("account_delete_metrics_refresh_failed", request_id=request_id)
    logger.info("account_local_deletion_committed", request_id=request_id)
    return {"status": "deleted", "cleanup_status": "pending",
            "message": "Your account data was removed. External account and file cleanup is queued."}
