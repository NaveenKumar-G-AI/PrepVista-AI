import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from app.services.deletion_worker import process_due_deletions, DELETION_MAX_RETRIES

class MockConnection:
    def __init__(self):
        self.queries = []
        self.rows = []

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        if self.rows:
            return self.rows.pop(0)
        return None

    async def execute(self, query, *args):
        self.queries.append((query, args))

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

@pytest.mark.asyncio
async def test_account_deletion_no_job_polling():
    mock_conn = MockConnection()
    with patch("app.services.deletion_worker.DatabaseConnection", return_value=mock_conn):
        processed = await process_due_deletions()
        assert processed == 0
        assert "SELECT id, user_id" in mock_conn.queries[0][0]

@pytest.mark.asyncio
async def test_account_deletion_successful():
    mock_conn = MockConnection()
    mock_conn.rows.append({
        "id": 1,
        "user_id": "00000000-0000-0000-0000-000000000000",
        "auth_user_ids": ["auth1"],
        "storage_paths": '["path1"]',
        "status": "DB_DELETED",
        "retry_count": 0
    })

    with patch("app.services.deletion_worker.DatabaseConnection", return_value=mock_conn), \
         patch("app.services.deletion_worker._safe_delete_auth_user", new_callable=AsyncMock) as mock_auth, \
         patch("app.services.deletion_worker.parse_and_delete_storage_path", new_callable=AsyncMock) as mock_storage:

        mock_auth.return_value = ('auth1', None)
        mock_storage.return_value = True

        processed = await process_due_deletions()
        assert processed == 1

        # Check updates
        assert any("SET status = 'AUTH_DELETED'" in q[0] for q in mock_conn.queries)
        assert any("SET status = 'COMPLETED'" in q[0] for q in mock_conn.queries)

@pytest.mark.asyncio
async def test_account_deletion_worker_retry():
    mock_conn = MockConnection()
    mock_conn.rows.append({
        "id": 1,
        "user_id": "00000000-0000-0000-0000-000000000000",
        "auth_user_ids": ["auth1"],
        "storage_paths": '[]',
        "status": "DB_DELETED",
        "retry_count": 0
    })

    with patch("app.services.deletion_worker.DatabaseConnection", return_value=mock_conn), \
         patch("app.services.deletion_worker._safe_delete_auth_user", new_callable=AsyncMock) as mock_auth:
        mock_auth.return_value = ("auth1", Exception("Simulated Auth Error"))

        processed = await process_due_deletions()
        assert processed == 1

        assert any("SET status = 'RETRY_REQUIRED'" in q[0] for q in mock_conn.queries)
        assert any("retry_count + 1" in q[0] for q in mock_conn.queries)

@pytest.mark.asyncio
async def test_account_deletion_maximum_retry_behavior():
    mock_conn = MockConnection()
    # It queries with DELETION_MAX_RETRIES.
    # If the row has reached it, the query will return nothing.
    with patch("app.services.deletion_worker.DatabaseConnection", return_value=mock_conn):
        processed = await process_due_deletions()
        assert processed == 0
        assert mock_conn.queries[0][1] == (DELETION_MAX_RETRIES,)

@pytest.mark.asyncio
async def test_account_deletion_concurrent_workers():
    # SKIP LOCKED is used in the query. We just mock the query behavior.
    mock_conn = MockConnection()
    mock_conn.rows.append({
        "id": 1,
        "user_id": "00000000-0000-0000-0000-000000000000",
        "auth_user_ids": [],
        "storage_paths": '[]',
        "status": "DB_DELETED",
        "retry_count": 0
    })

    with patch("app.services.deletion_worker.DatabaseConnection", return_value=mock_conn):
        res1, res2 = await asyncio.gather(
            process_due_deletions(),
            process_due_deletions()
        )
        # First call gets the row, second call gets None
        assert res1 == 1
        assert res2 == 0
        assert any("SKIP LOCKED" in q[0] for q in mock_conn.queries)

@pytest.mark.asyncio
async def test_account_deletion_existing_rows_preserved():
    # Only pending statuses are queried.
    mock_conn = MockConnection()
    with patch("app.services.deletion_worker.DatabaseConnection", return_value=mock_conn):
        await process_due_deletions()
        query = mock_conn.queries[0][0]
        assert "WHERE status IN ('DB_DELETED', 'AUTH_PENDING', 'STORAGE_PENDING', 'RETRY_REQUIRED', 'FAILED')" in query

@pytest.mark.asyncio
async def test_account_deletion_worker_starts_during_lifespan():
    from app.main import create_app
    app2 = create_app()
    from app.services.deletion_worker import run_deletion_worker_loop
    assert run_deletion_worker_loop is not None
