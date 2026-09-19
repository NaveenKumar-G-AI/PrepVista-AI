"""Optional standalone worker using the same PrepVista database.

The web backend processes evidence by default when UNIFIED_EVIDENCE_ENABLED is
on. Disable UNIFIED_EVIDENCE_IN_PROCESS_ENABLED when operating this standalone
command instead. --backfill includes a bounded batch of historical finishes.
"""
import argparse
import asyncio
import json
from app.config import get_settings
from app.database.connection import init_db_pool, close_db_pool
from app.services.unified_evidence_worker import tick, process_pending  # compatibility exports


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
