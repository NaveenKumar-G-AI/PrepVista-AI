"""Shared evidence processing using PrepVista's existing application DB pool."""
import asyncio
import structlog
from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.services.unified_evidence import process_event, backfill, lock_projection_owner
from app.services.unified_readiness import snapshot, POLICY_VERSION

logger = structlog.get_logger("prepvista.evidence_worker")
IN_PROCESS_BATCH_SIZE = 10
IN_PROCESS_TICK_TIMEOUT = 20
IN_PROCESS_POLL_SECONDS = 10


async def process_pending(event_id):
    """One atomic attempt, including failure accounting, across worker replicas."""
    async with DatabaseConnection() as conn, conn.transaction():
        owner = await conn.fetchval('SELECT user_id FROM unified_evidence_events WHERE id=$1', event_id)
        if owner is None or not await lock_projection_owner(conn, owner): return 'skipped'
        event = await conn.fetchrow('''SELECT id FROM unified_evidence_events WHERE id=$1
            AND processed_at IS NULL AND attempts < 5 AND retry_after <= NOW() FOR UPDATE''', event_id)
        if not event: return 'skipped'
        try:
            # A savepoint rolls back partial observations/snapshots while retaining
            # the outer owner/event locks until the retry state is committed.
            async with conn.transaction():
                projected_owner = await process_event(conn, event_id)
                if projected_owner: await snapshot(conn, projected_owner)
        except Exception:
            await conn.execute("UPDATE unified_evidence_events SET attempts=attempts+1,retry_after=NOW()+INTERVAL '60 seconds' WHERE id=$1", event_id)
            return 'failed'
        return 'processed' if projected_owner else 'skipped'


async def tick(limit=100, include_history=False):
    if type(limit) is not int or not 1 <= limit <= 100: raise ValueError('Invalid worker batch limit')
    if not get_settings().UNIFIED_EVIDENCE_ENABLED:
        return {'enabled': False, 'processed': 0, 'failed': 0}
    async with DatabaseConnection() as conn:
        if include_history:
            async with conn.transaction(): await backfill(conn, limit)
        ids = await conn.fetch('SELECT id FROM unified_evidence_events WHERE processed_at IS NULL AND attempts < 5 AND retry_after <= NOW() ORDER BY id LIMIT $1', limit)
    processed = failed = 0
    for row in ids:
        try:
            outcome = await process_pending(row['id'])
            processed += outcome == 'processed'
            failed += outcome == 'failed'
        except Exception:
            # An unavailable transaction cannot safely record an attempt. Leave
            # the event intact; the next bounded poll can retry after recovery.
            failed += 1
    # Role changes and freshness updates do not need artificial evidence events.
    async with DatabaseConnection() as conn:
        users = await conn.fetch('''SELECT w.user_id FROM coding_workspaces w LEFT JOIN LATERAL
            (SELECT created_at,role,policy_version FROM unified_readiness_snapshots WHERE user_id=w.user_id ORDER BY created_at DESC LIMIT 1) s ON TRUE
            WHERE s.created_at IS NULL OR s.created_at < NOW()-INTERVAL '1 day' OR s.role IS DISTINCT FROM COALESCE(w.state->>'role','GENERAL_SWE') OR s.policy_version IS DISTINCT FROM $2
            ORDER BY s.created_at ASC NULLS FIRST,w.user_id LIMIT $1''', limit, POLICY_VERSION)
        for user in users:
            async with conn.transaction(): await snapshot(conn, user['user_id'])
        pending = await conn.fetchval('SELECT count(*) FROM unified_evidence_events WHERE processed_at IS NULL')
        quarantined = await conn.fetchval('SELECT count(*) FROM unified_evidence_events WHERE processed_at IS NULL AND attempts >= 5')
    return {'enabled': True, 'processed': processed, 'failed': failed, 'pending': pending, 'quarantined': quarantined}



async def run_in_process():
    """Use the already-open pool; cancellation rolls back only unfinished work.

    Existing owner/event locks make replicas and the standalone worker safe to
    overlap. No submission execution or provider calls run in this loop.
    """
    while True:
        settings = get_settings()
        if not settings.UNIFIED_EVIDENCE_ENABLED or not settings.UNIFIED_EVIDENCE_IN_PROCESS_ENABLED:
            return
        try:
            async with asyncio.timeout(IN_PROCESS_TICK_TIMEOUT):
                result = await tick(limit=IN_PROCESS_BATCH_SIZE)
            logger.info("unified_evidence_tick", **result)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Never log student evidence, SQL, connection strings or exceptions.
            logger.warning("unified_evidence_tick_failed", error_type=type(exc).__name__)
        await asyncio.sleep(IN_PROCESS_POLL_SECONDS)
