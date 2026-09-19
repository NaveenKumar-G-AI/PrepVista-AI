"""Bounded outbox worker: python -m scripts.process_unified_evidence --once.

Run independently of FastAPI. Flags default off. --backfill includes a bounded
batch of committed historical finishes; repeated invocations resume by source ID.
"""
import argparse
import asyncio
import json
from app.config import get_settings
from app.database.connection import DatabaseConnection, init_db_pool, close_db_pool
from app.services.unified_evidence import process_event, backfill, lock_projection_owner
from app.services.unified_readiness import snapshot, POLICY_VERSION


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


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--backfill', action='store_true')
    args = parser.parse_args()
    if not get_settings().UNIFIED_EVIDENCE_ENABLED:
        print('Unified evidence processing is disabled. No database was opened.')
        return
    await init_db_pool(run_migrations=False)
    try:
        while True:
            print(json.dumps(await tick(include_history=args.backfill)), flush=True)
            if args.once: break
            await asyncio.sleep(5)
    finally: await close_db_pool()


if __name__ == '__main__': asyncio.run(main())
