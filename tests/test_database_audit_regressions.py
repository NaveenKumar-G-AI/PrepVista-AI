"""Behavioral startup contracts; no live database or service is contacted."""

from contextlib import asynccontextmanager
from pathlib import Path

import pytest

from app.database import connection, readiness


class LedgerConnection:
    def __init__(self, ledger):
        self.ledger = ledger
        self.statements = []
        self.in_transaction = False
        self.closed = False

    def is_in_transaction(self): return self.in_transaction
    def is_closed(self): return self.closed
    def terminate(self): self.closed = True
    async def fetchval(self, query, *args, **kwargs): return True

    async def fetch(self, query, *args):
        return [{"version": version, "checksum": checksum}
                for version, checksum in self.ledger.items()]

    async def execute(self, query, *args, **kwargs):
        self.statements.append((query, args, self.in_transaction))
        if "INSERT INTO schema_migrations" in query:
            self.ledger[args[0]] = args[1]

    @asynccontextmanager
    async def transaction(self, **kwargs):
        self.in_transaction = True
        try:
            yield
        finally:
            self.in_transaction = False


def release_ledger():
    directory = Path(connection.__file__).parent / "migrations"
    return {path.stem: connection._compute_migration_checksum(connection._read_migration_sql(path))
            for path in directory.glob("*.sql")}


@pytest.mark.asyncio
async def test_missing_checksum_is_fatal_without_rewriting_ledger():
    ledger = release_ledger()
    ledger[min(ledger)] = None
    conn = LedgerConnection(ledger)

    with pytest.raises(connection.DatabaseNotReadyError, match="checksum"):
        await connection._run_migrations(conn)

    assert not any("UPDATE schema_migrations" in query for query, _, _ in conn.statements)
    assert not any("INSERT INTO schema_migrations" in query for query, _, _ in conn.statements)


@pytest.mark.asyncio
async def test_changed_checksum_remains_fatal():
    ledger = release_ledger()
    ledger[min(ledger)] = "incorrect-checksum"
    conn = LedgerConnection(ledger)

    with pytest.raises(Exception, match="MIGRATION_LEDGER_INCOMPATIBLE"):
        await connection._run_migrations(conn)

    assert not any("UPDATE schema_migrations" in query for query, _, _ in conn.statements)


@pytest.mark.asyncio
async def test_extra_production_versions_are_preserved():
    ledger = release_ledger()
    ledger["046_production_only"] = "existing-production-checksum"
    conn = LedgerConnection(ledger)

    await connection._run_migrations(conn)

    assert not any("UPDATE schema_migrations" in query or "INSERT INTO schema_migrations" in query
                   for query, _, _ in conn.statements)
    assert conn.ledger == ledger


@pytest.mark.asyncio
async def test_missing_047_runs_atomically_without_replaying_history():
    ledger = release_ledger()
    ledger.pop("047_account_deletion_retry_support")
    conn = LedgerConnection(ledger)

    await connection._run_migrations(conn)

    applied = [(args[0], in_transaction) for query, args, in_transaction in conn.statements
               if "INSERT INTO schema_migrations" in query]
    assert applied == [("047_account_deletion_retry_support", True)]
    changes = [(query, in_transaction) for query, _, in_transaction in conn.statements
               if "ADD COLUMN IF NOT EXISTS retry_count" in query]
    assert len(changes) == 1
    assert changes[0][1] is True


class SchemaConnection:
    def __init__(self, missing=None):
        self.missing = missing
        self.readonly = False

    @asynccontextmanager
    async def transaction(self, *, readonly):
        assert readonly
        self.readonly = True
        yield

    async def fetch(self, query, *args):
        assert self.readonly
        if "pg_catalog.pg_constraint" in query:
            return [{"convalidated": True, "expression": "((claim_token IS NULL) = (lease_expires_at IS NULL))"}]
        if "pg_catalog.pg_attribute" not in query:
            return []
        return [dict(table_name=table, column_name=name, column_type=column_type)
                for table, types in readiness.REQUIRED_SCHEMA.items()
                for column_type, names in types.items()
                for name in names.split()
                if (table, name) != self.missing]


@pytest.mark.asyncio
async def test_readiness_rejects_missing_deletion_retry_count():
    conn = SchemaConnection(missing=("account_deletion_requests", "retry_count"))
    with pytest.raises(connection.DatabaseNotReadyError, match="account_deletion_requests.retry_count"):
        await readiness.check_schema_readiness(conn)


@pytest.mark.asyncio
async def test_readiness_accepts_complete_schema_without_writes():
    await readiness.check_schema_readiness(SchemaConnection())


@pytest.mark.asyncio
@pytest.mark.parametrize("column", ["claim_token","lease_expires_at","next_attempt_at"])
async def test_readiness_requires_deletion_lease_columns(column):
    with pytest.raises(connection.DatabaseNotReadyError,match=column):
        await readiness.check_schema_readiness(SchemaConnection(missing=("account_deletion_requests",column)))


@pytest.mark.asyncio
async def test_readiness_requires_archive_receipt_schema():
    with pytest.raises(connection.DatabaseNotReadyError,match="old_user.metadata"):
        await readiness.check_schema_readiness(SchemaConnection(missing=("old_user","metadata")))


@pytest.mark.asyncio
async def test_missing_048_runs_without_replaying_history():
    ledger = release_ledger()
    ledger.pop("048_account_deletion_claim_leases")
    conn = LedgerConnection(ledger)
    await connection._run_migrations(conn)
    applied = [(args[0], in_transaction) for query,args,in_transaction in conn.statements
               if "INSERT INTO schema_migrations" in query]
    assert applied == [("048_account_deletion_claim_leases", True)]


@pytest.mark.parametrize("timeout", [0,-1,float("inf"),float("nan"),601])
def test_migration_lock_wait_configuration_is_bounded(timeout):
    from app.config import Settings
    with pytest.raises(ValueError):
        Settings(MIGRATION_LOCK_TIMEOUT_SECONDS=timeout)


@pytest.mark.asyncio
async def test_all_checksums_checked_before_any_missing_file_executes():
    ledger=release_ledger()
    ledger.pop(min(ledger))
    ledger[max(ledger)]="invalid"
    conn=LedgerConnection(ledger)
    with pytest.raises(connection.MigrationStartupError,match="MIGRATION_LEDGER_INCOMPATIBLE"):
        await connection._run_migrations(conn)
    assert not any("INSERT INTO schema_migrations" in q for q,_,_ in conn.statements)
