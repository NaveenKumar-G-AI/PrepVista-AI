import os
import sys
import asyncio
import urllib.parse
import structlog
import asyncpg
import subprocess

from app.database.connection import _run_migrations
from app.database.readiness import check_schema_readiness, DatabaseNotReadyError

logger = structlog.get_logger("prepvista.deployment")

MIGRATION_LOCK_ID = 8137357283492  # Arbitrary 64-bit int for PrepVista

def is_local_url(url: str) -> bool:
    if not url: return False
    return "localhost" in url or "127.0.0.1" in url or "supabase:5432" in url

async def bootstrap_roles(conn: asyncpg.Connection, runtime_url: str):
    parsed = urllib.parse.urlparse(runtime_url)
    runtime_user = parsed.username or "prepvista_runtime"
    runtime_pass = parsed.password or "runtime_pass"

    logger.info("bootstrapping_roles", runtime_user=runtime_user)

    exists_runtime = await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", runtime_user)
    if not exists_runtime:
        await conn.execute(f"CREATE ROLE {runtime_user} WITH LOGIN PASSWORD '{runtime_pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
    else:
        await conn.execute(f"ALTER ROLE {runtime_user} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
        await conn.execute(f"ALTER ROLE {runtime_user} WITH PASSWORD '{runtime_pass}';")

    exists_worker = await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname = 'prepvista_worker'")
    if not exists_worker:
        await conn.execute("CREATE ROLE prepvista_worker WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
    else:
        await conn.execute("ALTER ROLE prepvista_worker WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")

    db_name = parsed.path.lstrip('/')
    await conn.execute(f"GRANT CONNECT ON DATABASE {db_name} TO {runtime_user};")
    await conn.execute(f"GRANT USAGE ON SCHEMA public TO {runtime_user};")
    
    logger.info("roles_bootstrapped_successfully")

async def run_deployment():
    env = os.environ.get("ENVIRONMENT", "development")
    is_prod = env == "production"

    runtime_url = os.environ.get("DATABASE_URL")
    if not runtime_url:
        logger.error("missing_database_url")
        sys.exit(1)
        return

    migration_url = os.environ.get("MIGRATION_DATABASE_URL")
    
    if is_prod:
        if not migration_url:
            logger.error("missing_migration_database_url_in_production")
            sys.exit(1)
            return
        if is_local_url(migration_url) or is_local_url(runtime_url):
            logger.error("production_url_cannot_be_local")
            sys.exit(1)
            return
        parsed_runtime = urllib.parse.urlparse(runtime_url)
        if parsed_runtime.username == "postgres":
            logger.error("database_url_must_not_use_postgres_admin_in_production")
            sys.exit(1)
            return

    target_migration_url = migration_url or runtime_url
    auto_migrate = os.environ.get("AUTO_MIGRATE_ON_DEPLOY", "true" if is_prod else "false").lower() == "true"

    if auto_migrate:
        logger.warning("automatic_production_migration_enabled")
        conn = None
        try:
            conn = await asyncpg.connect(target_migration_url, timeout=10)
        except Exception as e:
            logger.error("migration_db_connect_failed", error=str(e))
            sys.exit(1)
            return

        try:
            logger.info("acquiring_migration_lock")
            await conn.execute("SET statement_timeout = 30000;")
            try:
                await conn.fetchval("SELECT pg_advisory_lock($1)", MIGRATION_LOCK_ID)
            except Exception:
                logger.error("migration_lock_timeout")
                sys.exit(1)
                return
            
            await conn.execute("SET statement_timeout = 0;")

            await bootstrap_roles(conn, runtime_url)

            logger.info("checking_migrations")
            await _run_migrations(conn)

            # verify readiness/ledger before passing control
            try:
                await check_schema_readiness(conn)
            except DatabaseNotReadyError as e:
                if "migration ledger is incompatible" in str(e).lower():
                    logger.error("MIGRATION_LEDGER_INCOMPATIBLE")
                    sys.exit(1)
                    return
                raise
            
            logger.info("migrations_verified_and_applied")

        except SystemExit:
            raise
        except Exception as e:
            logger.error("migration_failed", error=type(e).__name__, message=str(e))
            sys.exit(1)
            return
        finally:
            if conn:
                await conn.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK_ID)
                await conn.close()

    if "MIGRATION_DATABASE_URL" in os.environ:
        os.environ.pop("MIGRATION_DATABASE_URL")

    logger.info("starting_backend_server")
    
    port = os.environ.get("PORT", "8000")
    workers = os.environ.get("WEB_CONCURRENCY", "2")
    
    cmd = [
        "gunicorn", "app.main:app",
        "--worker-class", "uvicorn.workers.UvicornWorker",
        "--workers", workers,
        "--bind", f"0.0.0.0:{port}",
        "--timeout", "120",
        "--keep-alive", "65",
        "--graceful-timeout", "30",
        "--preload",
        "--access-logfile", "-",
        "--error-logfile", "-"
    ]
    
    if hasattr(os, "execvp"):
        os.execvp(cmd[0], cmd)
    else:
        sys.exit(subprocess.run(cmd).returncode)

if __name__ == "__main__":
    asyncio.run(run_deployment())
