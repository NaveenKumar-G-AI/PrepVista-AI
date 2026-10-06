import asyncio
import json
import structlog
from app.database.connection import DatabaseConnection
from app.services.storage_cleanup import parse_and_delete_storage_path
from app.routers.account import _safe_delete_auth_user

logger = structlog.get_logger("prepvista.deletion_worker")

DELETION_WORKER_POLL_SECONDS = 300  # 5 minutes
DELETION_MAX_RETRIES = 10

async def process_due_deletions() -> int:
    """Claim and process one pending deletion request."""
    async with DatabaseConnection() as conn:
        request = await conn.fetchrow(
            """
            SELECT id, user_id, auth_user_ids, storage_paths, status, retry_count
            FROM account_deletion_requests
            WHERE status IN ('DB_DELETED', 'AUTH_PENDING', 'STORAGE_PENDING', 'RETRY_REQUIRED', 'FAILED')
              AND (
                  updated_at < NOW() - INTERVAL '1 minute'
                  AND
                  (retry_count = 0 OR updated_at < NOW() - INTERVAL '30 minutes')
              )
              AND retry_count < $1
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """,
            DELETION_MAX_RETRIES
        )

        if not request:
            return 0

        request_id = request["id"]
        auth_user_ids = request["auth_user_ids"] or []
        storage_paths = json.loads(request["storage_paths"] or "[]")
        retry_count = request["retry_count"]

        logger.info("deletion_worker_processing", request_id=request_id, retry=retry_count)

        if auth_user_ids and request["status"] not in ('STORAGE_PENDING', 'AUTH_DELETED'):
            # Attempt auth
            results = await asyncio.gather(*[_safe_delete_auth_user(aid) for aid in auth_user_ids])
            failed_auth = [(aid, exc) for aid, exc in results if exc is not None]
            if failed_auth:
                await conn.execute(
                    "UPDATE account_deletion_requests SET status = 'RETRY_REQUIRED', retry_count = retry_count + 1, last_error = $2, updated_at = NOW() WHERE id = $1",
                    request_id, f"Auth fail: {failed_auth}"
                )
                return 1
            await conn.execute("UPDATE account_deletion_requests SET status = 'AUTH_DELETED', updated_at = NOW() WHERE id = $1", request_id)

        # 2. Storage deletion
        if storage_paths:
            storage_results = await asyncio.gather(*[parse_and_delete_storage_path(p) for p in storage_paths])
            failed_storage = [p for p, success in zip(storage_paths, storage_results) if not success]
            if failed_storage:
                await conn.execute(
                    "UPDATE account_deletion_requests SET status = 'RETRY_REQUIRED', retry_count = retry_count + 1, last_error = $2, updated_at = NOW() WHERE id = $1",
                    request_id, f"Storage fail: {failed_storage}"
                )
                return 1

        # 3. Success
        await conn.execute("UPDATE account_deletion_requests SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1", request_id)
        logger.info("deletion_worker_completed", request_id=request_id)
        return 1

async def run_deletion_worker_loop() -> None:
    """Continuously process pending deletions."""
    while True:
        try:
            processed = await process_due_deletions()
            if processed > 0:
                continue
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("deletion_worker_poll_failed", error=str(exc))
        await asyncio.sleep(DELETION_WORKER_POLL_SECONDS)
