import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
import asyncpg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app.database.connection as db
from app.database.readiness import check_schema_readiness

async def main():
    if len(sys.argv) < 5:
        sys.exit(1)

    dsn = sys.argv[1]
    directory = Path(sys.argv[2])
    mode = sys.argv[3]
    wait = float(sys.argv[4])

    os.environ["ENVIRONMENT"] = "development"
    os.environ["PREPVISTA_DEBUG"] = "false"
    os.environ["DATABASE_URL"] = dsn
    os.environ["SUPABASE_URL"] = "https://test.supabase.co"
    os.environ["SUPABASE_ANON_KEY"] = "synthetic"
    os.environ["SUPABASE_SERVICE_KEY"] = "synthetic"
    os.environ["SUPABASE_JWT_SECRET"] = "synthetic-secret-long-enough-for-tests"

    db.__file__ = str(directory / "connection.py")
    settings = SimpleNamespace(
        DATABASE_URL=dsn,
        MIGRATION_LOCK_TIMEOUT_SECONDS=wait,
        DB_POOL_MIN_SIZE=1,
        DB_POOL_MAX_SIZE=2,
    )
    db.get_settings = lambda: settings

    # Signal arrival and wait on gate
    init_conn = await asyncpg.connect(dsn)
    try:
        await init_conn.execute("INSERT INTO audit_arrived(process_id) VALUES($1)", os.getpid())
        while True:
            ready = await init_conn.fetchval("SELECT ready FROM audit_gate")
            if ready:
                break
            await asyncio.sleep(0.01)
    finally:
        await init_conn.close()

    pool_created = False
    try:
        # Connect dedicated migration session
        mconn = await asyncpg.connect(dsn, server_settings={"application_name": "prepvista-migrations"})
        try:
            # Custom locked runner to record audit_attempts and handle modes
            original_locked = db._run_migrations_locked

            async def custom_locked(conn):
                backend_pid = await conn.fetchval("SELECT pg_backend_pid()")
                if mode == "holding":
                    print(f"PARKED {backend_pid}", flush=True)
                    await asyncio.Event().wait()

                # Read ledger and files
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version    TEXT PRIMARY KEY,
                        applied_at TIMESTAMPTZ DEFAULT NOW(),
                        checksum   TEXT
                    )
                """)
                applied_checksums = {
                    row["version"]: row["checksum"]
                    for row in await conn.fetch("SELECT version, checksum FROM schema_migrations")
                }
                migrations_dir = directory / "migrations"
                migration_files = sorted(
                    f for f in migrations_dir.iterdir()
                    if f.suffix == ".sql" and f.name[0].isdigit()
                )
                missing = []
                for mf in migration_files:
                    v = mf.stem
                    sql = db._read_migration_sql(mf)
                    chk = db._compute_migration_checksum(sql)
                    if v in applied_checksums:
                        stored = applied_checksums[v]
                        if stored is None or stored != chk:
                            if stored is None:
                                raise db.MigrationStartupError(f"Applied migration checksum is missing: {v}")
                            raise db.MigrationStartupError("MIGRATION_LEDGER_INCOMPATIBLE")
                    else:
                        missing.append((mf, sql, chk))

                count = 0
                for mf, sql, chk in missing:
                    v = mf.stem
                    exec_sql, _ = db._strip_outer_transaction(sql)
                    use_tx = "concurrently" not in exec_sql.lower()

                    if mode == "during":
                        if use_tx:
                            async with conn.transaction():
                                await conn.execute(
                                    "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'DDL', $2, $3)",
                                    os.getpid(), v, backend_pid
                                )
                                await conn.execute(exec_sql)
                                print(f"PARKED {backend_pid}", flush=True)
                                await asyncio.Event().wait()
                        else:
                            await conn.execute(
                                "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'DDL', $2, $3)",
                                os.getpid(), v, backend_pid
                            )
                            await conn.execute(exec_sql)
                            print(f"PARKED {backend_pid}", flush=True)
                            await asyncio.Event().wait()

                    if mode == "after_ledger":
                        if use_tx:
                            async with conn.transaction():
                                await conn.execute(
                                    "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'DDL', $2, $3)",
                                    os.getpid(), v, backend_pid
                                )
                                await conn.execute(exec_sql)
                                await conn.execute(
                                    "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", v, chk
                                )
                                await conn.execute(
                                    "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'LEDGER', $2, $3)",
                                    os.getpid(), v, backend_pid
                                )
                                print(f"PARKED {backend_pid}", flush=True)
                                await asyncio.Event().wait()

                    if use_tx:
                        async with conn.transaction():
                            await conn.execute(
                                "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'DDL', $2, $3)",
                                os.getpid(), v, backend_pid
                            )
                            await conn.execute(exec_sql)
                            await conn.execute(
                                "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", v, chk
                            )
                            await conn.execute(
                                "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'LEDGER', $2, $3)",
                                os.getpid(), v, backend_pid
                            )
                    else:
                        await conn.execute(
                            "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'DDL', $2, $3)",
                            os.getpid(), v, backend_pid
                        )
                        await conn.execute(exec_sql)
                        await conn.execute(
                            "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", v, chk
                        )
                        await conn.execute(
                            "INSERT INTO audit_attempts(process_id, kind, version, backend_pid) VALUES($1, 'LEDGER', $2, $3)",
                            os.getpid(), v, backend_pid
                        )
                    count += 1
                return count

            db._run_migrations_locked = custom_locked
            await db._run_migrations(mconn)
        finally:
            await mconn.close()

        # Initialize pool
        await db.init_db_pool(max_attempts=1)
        pool_created = True

        async with db.DatabaseConnection() as conn:
            await check_schema_readiness(conn)

        # Check pool usability
        test_pool = await asyncpg.create_pool(dsn, min_size=1, max_size=1)
        async with test_pool.acquire() as c:
            assert await c.fetchval("SELECT 1") == 1
        await test_pool.close()

        await db.close_db_pool()
        print("RESULT " + json.dumps({"status": "ready", "readiness": True, "pool_usable": True}), flush=True)

    except Exception as exc:
        print("RESULT " + json.dumps({
            "status": "error",
            "error_type": type(exc).__name__,
            "error": str(exc),
            "pool_created": pool_created
        }), flush=True)

if __name__ == "__main__":
    asyncio.run(main())
