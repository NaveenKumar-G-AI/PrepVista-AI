import asyncio
import os
import sys
import asyncpg
import structlog
from urllib.parse import urlparse
from app.database.connection import _run_migrations

logger = structlog.get_logger("prepvista.bootstrap")

# The deterministic hash/integer used for the bootstrap lock
# Distinct from the migration lock.
BOOTSTRAP_LOCK_ID = 20261010  # A fixed integer for this lock

async def validate_role_attributes(conn, rolename):
    row = await conn.fetchrow("""
        SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication
        FROM pg_roles
        WHERE rolname = $1
    """, rolename)
    if not row:
        return False
    
    # Check for dangerous attributes
    dangerous = []
    if row["rolsuper"]: dangerous.append("SUPERUSER")
    if row["rolcreaterole"]: dangerous.append("CREATEROLE")
    if row["rolcreatedb"]: dangerous.append("CREATEDB")
    if row["rolbypassrls"]: dangerous.append("BYPASSRLS")
    if row["rolreplication"]: dangerous.append("REPLICATION")
    
    if dangerous:
        logger.error("dangerous_role_attributes", role=rolename, attributes=dangerous)
        raise RuntimeError(f"Role {rolename} has dangerous attributes: {', '.join(dangerous)}")

    if rolename == "prepvista_worker" and not row["rolcanlogin"]:
        logger.error("worker_missing_login", role=rolename)
        raise RuntimeError(f"Role {rolename} requires LOGIN for pg_cron scheduler execution")

    return True

async def run_bootstrap():
    migration_url = os.environ.get("MIGRATION_DATABASE_URL")
    runtime_url = os.environ.get("DATABASE_URL")

    if not migration_url:
        logger.error("missing_migration_database_url")
        sys.exit(1)
    if not runtime_url:
        logger.error("missing_runtime_database_url")
        sys.exit(1)

    mig_parsed = urlparse(migration_url)
    run_parsed = urlparse(runtime_url)

    if mig_parsed.username == run_parsed.username:
        logger.error("identical_credentials", detail="MIGRATION_DATABASE_URL and DATABASE_URL use the same identity.")
        sys.exit(1)

    runtime_user = run_parsed.username
    runtime_password = run_parsed.password

    # Connect with migration identity
    conn = await asyncpg.connect(migration_url, timeout=10)
    
    try:
        # Acquire bootstrap lock
        await conn.execute("SELECT pg_advisory_lock($1)", BOOTSTRAP_LOCK_ID)
        logger.info("acquired_bootstrap_lock")

        try:
            # Create runtime role if missing
            exists = await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", runtime_user)
            if not exists:
                logger.info("creating_runtime_role", role=runtime_user)
                if runtime_password:
                    await conn.execute(f"CREATE ROLE {runtime_user} WITH LOGIN PASSWORD '{runtime_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
                else:
                    await conn.execute(f"CREATE ROLE {runtime_user} WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
            
            await validate_role_attributes(conn, runtime_user)

            # Ensure worker role exists and has LOGIN contract required by pg_cron
            worker_row = await conn.fetchrow("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'prepvista_worker'")
            if not worker_row:
                logger.info("creating_worker_role")
                await conn.execute("CREATE ROLE prepvista_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
            elif not worker_row["rolcanlogin"]:
                logger.info("reconciling_worker_role_login")
                await conn.execute("ALTER ROLE prepvista_worker WITH LOGIN;")
            
            await validate_role_attributes(conn, "prepvista_worker")

            # Validate pg_cron (fail closed if absent)
            has_pg_cron = await conn.fetchval("SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'")
            if not has_pg_cron:
                # In a real environment, this fails closed.
                # For local testing without pg_cron, we skip to allow the rest of the tests to run if PREPVISTA_IGNORE_MISSING_CRON is set.
                if os.environ.get("PREPVISTA_IGNORE_MISSING_CRON") != "1":
                    logger.error("pg_cron_prerequisite_missing")
                    raise RuntimeError("pg_cron prerequisite unavailable. It must be installed externally.")

        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", BOOTSTRAP_LOCK_ID)
            logger.info("released_bootstrap_lock")

        # Now run migrations under the standard migration lock (handled by _run_migrations)
        logger.info("starting_migrations")
        await _run_migrations(conn)

    except Exception as e:
        logger.error("bootstrap_failed", error=str(e))
        raise
    finally:
        await conn.close()
        logger.info("privileged_connection_closed")

def main():
    asyncio.run(run_bootstrap())

if __name__ == "__main__":
    main()
