"""Durable, fenced deletion phases shared by the endpoint and poller."""
import asyncio
import json
import hashlib
from contextlib import suppress
from uuid import UUID, uuid4

import structlog
from app.database.connection import DatabaseConnection
from app.services.storage_cleanup import delete_storage_target, resolve_storage_reference

logger = structlog.get_logger("prepvista.deletion_worker")
DELETION_WORKER_POLL_SECONDS = 300
DELETION_MAX_RETRIES = 10
LEASE_SECONDS = 120
RENEW_SECONDS = 30
PROVIDER_TIMEOUT_SECONDS = 30
NEXT_PHASE = {
    "REQUESTED": "DB_DELETED", "DB_DELETED": "AUTH_PENDING",
    "AUTH_PENDING": "AUTH_DELETED", "AUTH_DELETED": "STORAGE_PENDING",
    "STORAGE_PENDING": "STORAGE_DELETED", "STORAGE_DELETED": "COMPLETED",
}
RECOVERABLE = [*NEXT_PHASE, "RETRY_REQUIRED"]


class LostClaim(Exception):
    pass


class InvalidTargets(Exception):
    def __init__(self, code, permanent=True):
        self.code, self.permanent = code, permanent
        super().__init__(code)


def _event(name, job, **fields):
    logger.info(name, request_id=job["id"], phase=job["status"],
                retry_count=job["retry_count"], claim_id=str(job["claim_token"]), **fields)


async def claim_deletion(request_id=None):
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("""
                SELECT * FROM account_deletion_requests
                WHERE status = ANY($1::text[])
                  AND ($2::integer IS NULL OR id = $2)
                  AND (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp())
                  AND (claim_token IS NULL OR lease_expires_at <= clock_timestamp())
                ORDER BY COALESCE(next_attempt_at, created_at), id
                FOR UPDATE SKIP LOCKED LIMIT 1
            """, RECOVERABLE, request_id)
            if not row:
                if request_id is not None:
                    logger.info("deletion_claim_conflict", request_id=request_id)
                return None
            expired = row["claim_token"] is not None
            # A lease abandoned by a dead/cancelled worker is one failed attempt.
            job = dict(await conn.fetchrow("""
                UPDATE account_deletion_requests
                SET claim_token=$2, lease_expires_at=clock_timestamp()+$3*interval '1 second',
                    retry_count=retry_count+$4, updated_at=clock_timestamp()
                WHERE id=$1 RETURNING *
            """, row["id"], uuid4(), LEASE_SECONDS, int(expired)))
    _event("deletion_request_claimed", job)
    if expired:
        _event("deletion_claim_expired_recovered", job)
    return job


async def _owns_claim(job, renew=False):
    async with DatabaseConnection() as conn:
        prefix = ("UPDATE account_deletion_requests SET lease_expires_at="
                  "clock_timestamp()+$4*interval '1 second' " if renew
                  else "SELECT id FROM account_deletion_requests ")
        args = [job["id"], job["claim_token"], job["status"],]
        query = prefix + """
            WHERE id=$1 AND claim_token=$2 AND status=$3
              AND lease_expires_at > clock_timestamp()
        """
        if renew:
            query += " RETURNING id"
            args.append(LEASE_SECONDS)
        row = await conn.fetchrow(query, *args)
    if row is None:
        _event("deletion_claim_lost", job)
        raise LostClaim()


async def _checkpoint(job, next_status):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("""
            UPDATE account_deletion_requests
            SET status=$4, claim_token=NULL, lease_expires_at=NULL,
                next_attempt_at=NULL, last_error=NULL, updated_at=clock_timestamp()
            WHERE id=$1 AND claim_token=$2 AND status=$3
              AND lease_expires_at > clock_timestamp() RETURNING id
        """, job["id"], job["claim_token"], job["status"], next_status)
    if row is None:
        raise LostClaim()
    _event("deletion_completed" if next_status == "COMPLETED" else "deletion_checkpoint", job,
           next_phase=next_status)


async def _failure(job, code, permanent=False, increment=True):
    count = job["retry_count"] + int(increment)
    exhausted = count >= DELETION_MAX_RETRIES
    terminal = permanent or exhausted
    reason = ("RETRY_EXHAUSTED:" if exhausted else "") + code
    delay = min(1800, (300 if code == "MALFORMED_PAYLOAD" else 60) * 2**min(max(count-1, 0), 5))
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("""
            UPDATE account_deletion_requests
            SET status=$4, retry_count=retry_count+$5, last_error=$6,
                next_attempt_at=CASE WHEN $7 THEN NULL
                  ELSE clock_timestamp()+$8*interval '1 second' END,
                claim_token=NULL, lease_expires_at=NULL, updated_at=clock_timestamp()
            WHERE id=$1 AND claim_token=$2 AND status=$3
              AND lease_expires_at > clock_timestamp() RETURNING id
        """, job["id"], job["claim_token"], job["status"],
            "FAILED" if terminal else job["status"], int(increment), reason, terminal, delay)
    if row is None:
        raise LostClaim()
    _event("deletion_retry_exhausted" if exhausted else
           "deletion_manual_review" if terminal else "deletion_retry_scheduled", job,
           reason=reason, resulting_retry_count=count)


def _json(value):
    return json.loads(value) if isinstance(value, str) else value


async def _validated_targets(job):
    try:
        owner = str(UUID(str(job["user_id"])))
        auth = job["auth_user_ids"]
        paths = _json(job["storage_paths"])
        if (not isinstance(auth, list) or not isinstance(paths, list)
                or any(not isinstance(p, str) or not p for p in paths)
                or any(not isinstance(a, str) or str(UUID(a)) != a for a in auth)):
            raise ValueError()
    except (TypeError, ValueError, AttributeError):
        raise InvalidTargets("MALFORMED_PAYLOAD", permanent=False) from None
    resolved = [resolve_storage_reference(p) for p in paths]
    if any(target is None for target in resolved):
        raise InvalidTargets("UNSAFE_STORAGE_TARGET")
    async with DatabaseConnection() as conn:
        rows = await conn.fetch("""
            SELECT metadata -> 'deletion_requests' -> $2 AS receipt
            FROM old_user WHERE user_id=$1
        """, UUID(owner), str(job["id"]))
        receipts = [r["receipt"] for r in rows if r["receipt"] is not None]
        try:
            receipt = _json(receipts[0]) if len(receipts) == 1 else None
            if (not isinstance(receipt, dict) or receipt.get("version") != 1
                    or receipt.get("user_id") != owner or receipt.get("request_id") != job["id"]
                    or receipt.get("auth_user_ids") != auth or receipt.get("storage_paths") != paths
                    or receipt.get("db_deleted") is not True):
                raise InvalidTargets("OWNERSHIP_UNVERIFIED")
        except (TypeError, ValueError):
            raise InvalidTargets("OWNERSHIP_UNVERIFIED") from None
        if await conn.fetchval("SELECT EXISTS(SELECT 1 FROM profiles WHERE id=$1)", UUID(owner)):
            raise InvalidTargets("LOCAL_DELETION_UNCONFIRMED")
        if await conn.fetchval("""
            SELECT EXISTS(SELECT 1 FROM auth_identity_links
              WHERE auth_user_id=ANY($1::uuid[]) AND profile_id<>$2)
        """, [UUID(a) for a in auth], UUID(owner)):
            raise InvalidTargets("CROSS_USER_AUTH_TARGET")
        bindings = receipt.get("storage_bindings")
        if not isinstance(bindings, list) or len(bindings) != len(paths):
            raise InvalidTargets("OWNERSHIP_UNVERIFIED")
        for path, target, binding in zip(paths, resolved, bindings):
            if (not isinstance(binding, dict) or binding.get("path") != path
                    or binding.get("user_id") != owner):
                raise InvalidTargets("CROSS_USER_STORAGE_TARGET")
            session_id = binding.get("session_id")
            prefix = session_id or owner
            if target[1].split("/", 1)[0] != prefix:
                raise InvalidTargets("CROSS_USER_STORAGE_TARGET")
            if session_id:
                try:
                    session_uuid = UUID(session_id)
                except (ValueError, TypeError):
                    raise InvalidTargets("OWNERSHIP_UNVERIFIED") from None
                if await conn.fetchval("""
                    SELECT EXISTS(SELECT 1 FROM interview_sessions WHERE id=$1 AND user_id<>$2)
                """, session_uuid, UUID(owner)):
                    raise InvalidTargets("CROSS_USER_STORAGE_TARGET")
    completed = receipt.get("completed_operations", [])
    expected = {_operation_key("auth", a) for a in auth} | {_operation_key("storage", t) for t in resolved}
    if not isinstance(completed, list) or any(not isinstance(k, str) or k not in expected for k in completed):
        raise InvalidTargets("INVALID_OPERATION_RECEIPT")
    return ([a for a in dict.fromkeys(auth) if _operation_key("auth", a) not in completed],
            [t for t in dict.fromkeys(resolved) if _operation_key("storage", t) not in completed])


def _operation_key(phase, target):
    return hashlib.sha256(json.dumps([phase, target], separators=(",", ":")).encode()).hexdigest()


async def _remember_operation(job, phase, target):
    """Fence and commit each target receipt so a later target failure cannot replay it."""
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("""
                SELECT id FROM account_deletion_requests
                WHERE id=$1 AND claim_token=$2 AND status=$3
                  AND lease_expires_at > clock_timestamp() FOR UPDATE
            """, job["id"], job["claim_token"], job["status"])
            if row is None:
                raise LostClaim()
            path = ["deletion_requests", str(job["id"]), "completed_operations"]
            result = await conn.execute("""
                UPDATE old_user SET metadata=jsonb_set(metadata, $2::text[],
                  COALESCE(metadata #> $2::text[], '[]'::jsonb) || $3::jsonb, true)
                WHERE user_id=$1 AND metadata -> 'deletion_requests' ? $4
            """, job["user_id"], path, json.dumps([_operation_key(phase, target)]), str(job["id"]))
            if result != "UPDATE 1":
                raise InvalidTargets("OWNERSHIP_UNVERIFIED")


async def _auth_delete(auth_id):
    from app.routers.account import _safe_delete_auth_user
    _, error = await _safe_delete_auth_user(auth_id)
    if error is not None:
        raise InvalidTargets("AUTH_PROVIDER_FAILURE", permanent=not getattr(error, "retryable", True))


async def _external_phase(job, auth, storage):
    lost = asyncio.Event()

    async def heartbeat():
        try:
            while True:
                await asyncio.sleep(RENEW_SECONDS)
                await _owns_claim(job, renew=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            lost.set()

    async def perform():
        phase = "auth" if job["status"] == "AUTH_PENDING" else "storage"
        _event("deletion_" + phase + "_started", job)
        for target in (auth if phase == "auth" else storage):
            await _owns_claim(job)
            if phase == "auth":
                await asyncio.wait_for(_auth_delete(target), PROVIDER_TIMEOUT_SECONDS)
            else:
                result = await asyncio.wait_for(delete_storage_target(*target), PROVIDER_TIMEOUT_SECONDS)
                if not result.success:
                    raise InvalidTargets(result.code, permanent=not result.retryable)
            await _remember_operation(job, phase, target)
        _event("deletion_" + phase + "_completed", job)

    tasks = [asyncio.create_task(heartbeat()), asyncio.create_task(perform()),
             asyncio.create_task(lost.wait())]
    try:
        await asyncio.wait(tasks[1:], return_when=asyncio.FIRST_COMPLETED)
        if lost.is_set():
            raise LostClaim()
        await tasks[1]
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def process_due_deletions(request_id=None):
    job = await claim_deletion(request_id)
    if job is None:
        return 0
    try:
        if job["retry_count"] >= DELETION_MAX_RETRIES:
            await _failure(job, "ATTEMPT_LIMIT", permanent=True, increment=False)
            return 1
        if job["retry_count"] < 0:
            raise InvalidTargets("INVALID_RETRY_COUNT")
        if job["status"] == "RETRY_REQUIRED":
            raise InvalidTargets("LEGACY_PHASE_AMBIGUOUS")
        auth, storage = await _validated_targets(job)
        if job["status"] in {"AUTH_PENDING", "STORAGE_PENDING"}:
            await _external_phase(job, auth, storage)
        await _checkpoint(job, NEXT_PHASE[job["status"]])
    except asyncio.CancelledError:
        # Retain the lease: a cancelled HTTP operation has an ambiguous outcome.
        raise
    except LostClaim:
        pass
    except InvalidTargets as exc:
        with suppress(LostClaim):
            await _failure(job, exc.code, permanent=exc.permanent)
    except Exception:
        with suppress(LostClaim):
            await _failure(job, "PROCESSING_FAILURE")
    return 1


async def dispatch_deletion(request_id):
    """Best-effort wakeup after local commit; poller uses the identical protocol."""
    try:
        while await process_due_deletions(request_id):
            pass
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.warning("deletion_dispatch_deferred", request_id=request_id, reason="DATABASE_UNAVAILABLE")


async def deletion_queue_metrics():
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("""
            SELECT count(*) FILTER (WHERE status=ANY($1::text[])) AS pending,
              count(*) FILTER (WHERE claim_token IS NOT NULL
                AND lease_expires_at>clock_timestamp()) AS active_claims,
              count(*) FILTER (WHERE next_attempt_at IS NOT NULL AND status=ANY($1::text[])) AS retries,
              count(*) FILTER (WHERE status='FAILED' AND retry_count>=10) AS exhausted,
              count(*) FILTER (WHERE status='FAILED' AND retry_count<10) AS manual_review,
              EXTRACT(EPOCH FROM clock_timestamp()-min(created_at)
                FILTER (WHERE status=ANY($1::text[]))) AS oldest_pending_seconds
            FROM account_deletion_requests
        """, RECOVERABLE)
    return dict(row)


async def run_deletion_worker_loop():
    while True:
        try:
            if await process_due_deletions():
                continue
            logger.info("deletion_queue_health", **await deletion_queue_metrics())
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning("deletion_worker_poll_failed", reason="DATABASE_UNAVAILABLE")
        await asyncio.sleep(DELETION_WORKER_POLL_SECONDS)
