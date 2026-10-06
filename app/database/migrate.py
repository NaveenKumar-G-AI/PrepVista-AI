"""Explicit admin/release entry point. Never invoked by application startup.

Historical migrations need separate review before using this command.
Usage: python -m app.database.migrate --execute
"""

import argparse
import asyncio

import asyncpg

from app.config import get_settings
from app.database.connection import _run_migrations


async def run_release_migrations() -> None:
    conn = await asyncpg.connect(get_settings().DATABASE_URL, timeout=10)
    try:
        await _run_migrations(conn)
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", required=True)
    parser.parse_args()
    asyncio.run(run_release_migrations())


if __name__ == "__main__":
    main()
