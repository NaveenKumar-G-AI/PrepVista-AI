import asyncio
import os
import sys
import asyncpg
import structlog
from urllib.parse import urlparse, unquote
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

    if not row["rolcanlogin"]:
        logger.error("backend_missing_login", role=rolename)
        raise RuntimeError(f"Role {rolename} requires LOGIN for its backend connection")

    if await conn.fetchval('''SELECT EXISTS (
        SELECT FROM pg_roles parent WHERE parent.rolname<>$1
          AND pg_has_role($1,parent.oid,'MEMBER')
          AND (parent.rolsuper OR parent.rolcreaterole OR parent.rolcreatedb OR parent.rolbypassrls OR parent.rolreplication)
    )''',rolename):
        raise RuntimeError('Unsafe inherited backend role attributes')

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

    runtime_user = unquote(run_parsed.username or '')
    if runtime_user != 'prepvista_runtime':
        raise RuntimeError('DATABASE_URL must use the reviewed prepvista_runtime identity')

    # Connect with migration identity
    conn = await asyncpg.connect(migration_url, timeout=10)
    
    try:
        # Acquire bootstrap lock
        await conn.execute("SELECT pg_advisory_lock($1)", BOOTSTRAP_LOCK_ID)
        logger.info("acquired_bootstrap_lock")

        try:
            # Provision roles separately. URLs are credentials, never SQL role
            # definitions; this command neither creates nor repairs identities.
            for role in (runtime_user, 'prepvista_worker'):
                if not await validate_role_attributes(conn, role):
                    raise RuntimeError('Reviewed backend role prerequisite missing')

            # Validate pg_cron (fail closed if absent)
            has_pg_cron = await conn.fetchval("SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'")
            if not has_pg_cron:
                raise RuntimeError("pg_cron prerequisite unavailable. It must be installed externally.")

        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", BOOTSTRAP_LOCK_ID)
            logger.info("released_bootstrap_lock")

        # Now run migrations under the standard migration lock (handled by _run_migrations)
        logger.info("starting_migrations")
        await _run_migrations(conn)

    except Exception as e:
        logger.error("bootstrap_failed", error_type=type(e).__name__)
        raise
    finally:
        await conn.close()
        logger.info("privileged_connection_closed")

def main():
    asyncio.run(run_bootstrap())

if __name__ == "__main__":
    main()
