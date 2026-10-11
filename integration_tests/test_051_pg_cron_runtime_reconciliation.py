import asyncio
import os
import pytest
import pytest_asyncio
import asyncpg

import subprocess

def _get_candidate_dsns():
    dsns = []
    if os.environ.get("PG_QUAL_DSN"):
        dsns.append(os.environ.get("PG_QUAL_DSN"))
    if os.name == "nt":
        try:
            wsl_ip = subprocess.check_output(
                ["wsl.exe", "-d", "Ubuntu", "-u", "root", "-e", "hostname", "-I"],
                text=True,
                timeout=3,
            ).split()[0]
            dsns.append(f"postgresql://postgres:postgres@{wsl_ip}:5433/postgres")
        except Exception:
            pass
    dsns.extend([
        "postgresql://postgres:postgres@172.24.109.149:5433/postgres",
        "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
        "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    ])
    return dsns

async def _resolve_dsn():
    for dsn in _get_candidate_dsns():
        if not dsn:
            continue
        try:
            conn = await asyncpg.connect(dsn, timeout=4.0)
            await conn.close()
            return dsn
        except Exception:
            continue
    pytest.skip("No accessible PostgreSQL 17 + pg_cron qualification database found")

@pytest_asyncio.fixture(scope="module")
async def dsn():
    return await _resolve_dsn()

@pytest_asyncio.fixture
async def admin_conn(dsn):
    conn = await asyncpg.connect(dsn)
    try:
        yield conn
    finally:
        await conn.close()

@pytest_asyncio.fixture
async def worker_conn(dsn):
    # Connect using prepvista_worker role
    # Since prepvista_worker has no password in qualification or trust auth,
    # swap username in DSN.
    worker_dsn = dsn.replace("postgres:postgres@", "prepvista_worker:qual_worker_pass@").replace("postgres@", "prepvista_worker:qual_worker_pass@")
    conn = await asyncpg.connect(worker_dsn)
    try:
        yield conn
    finally:
        await conn.close()

# ============================================================================
# 1. LEDGER & CHECKSUM VERIFICATION
# ============================================================================

@pytest.mark.asyncio
async def test_051_migration_ledger_and_checksum(admin_conn):
    """Verify migration 051 ledger entry exists, matches checksum, and 050/049 are intact."""
    rows = await admin_conn.fetch("""
        SELECT version, checksum
        FROM schema_migrations
        WHERE version IN (
            '049_backend_schema_access_hardening',
            '050_cron_schema_reconciliation',
            '051_pg_cron_runtime_reconciliation'
        )
    """)
    checksums = {r["version"]: r["checksum"] for r in rows}
    
    assert "051_pg_cron_runtime_reconciliation" in checksums, "051 migration not in ledger"
    assert checksums["051_pg_cron_runtime_reconciliation"] == "60c0e9654c0e22759ccddcdc9e6a66bd1c1d609b833cdd5dfd8d28099764cc98"

    assert "050_cron_schema_reconciliation" in checksums, "050 migration not in ledger"
    assert checksums["050_cron_schema_reconciliation"] == "3625e313ca8c504ae7622ae574aa18375056ae36c1376249c6d4fa2d3a0a3db6"

    assert "049_backend_schema_access_hardening" in checksums, "049 migration not in ledger"
    assert checksums["049_backend_schema_access_hardening"] == "40b5d3476fdf105fd6204659a6c87f835a56304b64aed28260413eac4787cb09"

# ============================================================================
# 2. DEFECT #1: WORKER LOGIN & LEAST PRIVILEGE
# ============================================================================

@pytest.mark.asyncio
async def test_prepvista_worker_login_and_attributes(admin_conn, worker_conn):
    """Verify prepvista_worker has LOGIN = true and strictly non-admin attributes."""
    role = await admin_conn.fetchrow("""
        SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
        FROM pg_roles
        WHERE rolname = 'prepvista_worker'
    """)
    assert role is not None, "prepvista_worker role missing"
    assert role["rolcanlogin"] is True, "prepvista_worker must have LOGIN enabled for pg_cron"
    assert role["rolsuper"] is False, "prepvista_worker must NOT be SUPERUSER"
    assert role["rolcreaterole"] is False, "prepvista_worker must NOT have CREATEROLE"
    assert role["rolcreatedb"] is False, "prepvista_worker must NOT have CREATEDB"
    assert role["rolreplication"] is False, "prepvista_worker must NOT have REPLICATION"
    assert role["rolbypassrls"] is False, "prepvista_worker must NOT have BYPASSRLS"

    # Verify actual connection session identity
    ident = await worker_conn.fetchrow("SELECT current_user, session_user;")
    assert ident["current_user"] == "prepvista_worker"
    assert ident["session_user"] == "prepvista_worker"

# ============================================================================
# 3. DEFECT #2: REFRESH ACTIVITY STATS & LEAST PRIVILEGE REVOCATIONS
# ============================================================================

@pytest.mark.asyncio
async def test_worker_direct_dml_revoked(worker_conn):
    """Verify prepvista_worker cannot directly UPDATE user_activity_stats or DELETE user_activity_events."""
    with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError):
        await worker_conn.execute("UPDATE public.user_activity_stats SET active_users_count = 0 WHERE id = 1;")

    with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError):
        await worker_conn.execute("DELETE FROM public.user_activity_events WHERE created_at < NOW() - INTERVAL '24 hours';")

@pytest.mark.asyncio
async def test_cron_refresh_activity_stats_function_and_acls(admin_conn, worker_conn):
    """Verify cron_refresh_activity_stats is SECURITY DEFINER, search_path pinned, and worker can EXECUTE."""
    fn = await admin_conn.fetchrow("""
        SELECT prosecdef, proconfig
        FROM pg_proc
        WHERE proname = 'cron_refresh_activity_stats'
    """)
    assert fn is not None, "cron_refresh_activity_stats function missing"
    assert fn["prosecdef"] is True, "Must be SECURITY DEFINER"
    assert fn["proconfig"] == ["search_path=pg_catalog, public, pg_temp"], "search_path must be pinned"

    # Execution permission checks
    assert await admin_conn.fetchval("SELECT has_function_privilege('prepvista_worker', 'cron_refresh_activity_stats()', 'execute')")
    assert not await admin_conn.fetchval("SELECT has_function_privilege('anon', 'cron_refresh_activity_stats()', 'execute')")
    assert not await admin_conn.fetchval("SELECT has_function_privilege('authenticated', 'cron_refresh_activity_stats()', 'execute')")
    assert not await admin_conn.fetchval("SELECT has_function_privilege('prepvista_runtime', 'cron_refresh_activity_stats()', 'execute')")

    # Worker can execute the function
    await worker_conn.execute("SELECT public.cron_refresh_activity_stats();")

@pytest.mark.asyncio
async def test_refresh_activity_stats_cron_job_and_run_details(admin_conn):
    """Verify refresh-activity-stats job config in cron.job and successful scheduler runs."""
    job = await admin_conn.fetchrow("""
        SELECT jobid, command, username, active
        FROM cron.job
        WHERE jobname = 'refresh-activity-stats'
    """)
    assert job is not None, "refresh-activity-stats cron job missing"
    assert job["username"] == "prepvista_worker"
    assert job["command"] == "SELECT public.cron_refresh_activity_stats();"
    assert job["active"] is True

    # Check that pg_cron scheduler has succeeded runs for this job
    detail = await admin_conn.fetchrow("""
        SELECT status, return_message
        FROM cron.job_run_details
        WHERE jobid = $1
        ORDER BY runid DESC
        LIMIT 1
    """, job["jobid"])
    assert detail is not None, "No run details recorded for refresh-activity-stats"
    assert detail["status"] == "succeeded", f"Scheduler run failed with: {detail['return_message']}"
    assert detail["return_message"] == "SELECT 1"

# ============================================================================
# 4. DEFECT #3: PARTITION CREATION CONCURRENCY & ADVISORY LOCK
# ============================================================================

@pytest.mark.asyncio
async def test_cron_create_activity_partition_concurrency(dsn):
    """Verify concurrent execution of cron_create_activity_partition at 2, 5, 10 workers."""
    async def worker_call():
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute("SELECT public.cron_create_activity_partition();")
            return True
        finally:
            await conn.close()

    for count in [2, 5, 10]:
        tasks = [worker_call() for _ in range(count)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        errors = [r for r in results if isinstance(r, Exception)]
        assert len(errors) == 0, f"Concurrency test at {count} failed with errors: {errors}"

@pytest.mark.asyncio
async def test_created_partition_integrity_and_security(admin_conn):
    """Verify partition table inherits from user_activity_events and has RLS enabled."""
    part = await admin_conn.fetchrow("""
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = 'user_activity_events'
        ORDER BY c.relname DESC
        LIMIT 1
    """)
    assert part is not None, "No partition created for user_activity_events"
    assert part["relrowsecurity"] is True, f"RLS must be enabled on partition {part['relname']}"

# ============================================================================
# 5. ALL SCHEDULED CRON JOBS HEALTH
# ============================================================================

@pytest.mark.asyncio
async def test_all_scheduled_cron_jobs_health(admin_conn, worker_conn):
    """Verify all 7 production cron jobs exist under prepvista_worker and execute cleanly."""
    expected_jobs = [
        "refresh-activity-stats",
        "gdpr-pseudonymise-old-user",
        "gdpr-hard-delete-old-user",
        "refresh-public-growth-metrics",
        "purge-usage-events",
        "purge-billing-events",
        "create-activity-partition",
    ]
    rows = await admin_conn.fetch("""
        SELECT jobname, username, command, active
        FROM cron.job
        WHERE username = 'prepvista_worker'
    """)
    jobs_by_name = {r["jobname"]: r for r in rows}

    for name in expected_jobs:
        assert name in jobs_by_name, f"Expected cron job '{name}' missing"
        assert jobs_by_name[name]["active"] is True, f"Cron job '{name}' is inactive"

    # Verify worker can execute each of the security definer functions directly
    functions_to_test = [
        "cron_refresh_activity_stats()",
        "cron_gdpr_pseudonymise_old_user()",
        "cron_gdpr_hard_delete_old_user()",
        "cron_refresh_public_growth_metrics()",
        "cron_purge_usage_events()",
        "cron_purge_billing_events()",
        "cron_create_activity_partition()",
    ]
    for fn in functions_to_test:
        await worker_conn.execute(f"SELECT public.{fn};")
