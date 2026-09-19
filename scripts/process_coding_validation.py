"""Separate validation dispatcher. No code execution or migrations in this process."""
import argparse
import asyncio
import json
from app.config import get_settings
from app.database.connection import init_db_pool, close_db_pool
from app.services.coding_validation import configured, tick


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if not configured(get_settings()):
        print('Isolated validation is disabled or unconfigured. No database was opened.')
        return
    await init_db_pool(run_migrations=False)
    try:
        while True:
            print(json.dumps(await tick()), flush=True)
            if args.once:
                break
            await asyncio.sleep(2)
    finally:
        await close_db_pool()


if __name__ == '__main__':
    asyncio.run(main())
