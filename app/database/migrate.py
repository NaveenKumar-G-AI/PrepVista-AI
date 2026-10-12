"""Explicit admin/release entry point. Never invoked by application startup.

Historical migrations need separate review before using this command.
Usage: python -m app.database.migrate --execute
"""

import argparse
import asyncio
import os
import sys

import asyncpg

from app.database.connection import _run_migrations

async def run_release_migrations(*, through: str | None = None) -> None:
    database_url = os.environ.get("MIGRATION_DATABASE_URL")
    if not database_url:
        print("Error: MIGRATION_DATABASE_URL must be set.")
        sys.exit(1)

    conn = await asyncpg.connect(database_url, timeout=10)
    try:
        if through is not None:
            await _run_migrations(conn, through=through)
        else:
            await _run_migrations(conn)
    finally:
        await conn.close()

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", required=True)
    parser.add_argument('--through', help='Exact full migration stem; validates all applied checksums, executes only through this version')
    args = parser.parse_args()
    asyncio.run(run_release_migrations(through=args.through))

if __name__ == "__main__":
    main()
