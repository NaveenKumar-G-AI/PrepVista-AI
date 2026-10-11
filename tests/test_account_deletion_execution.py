"""Provider classification and lifecycle tests; concurrency uses real PostgreSQL."""
import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from app.services import deletion_worker as worker
from app.services import storage_cleanup as storage
from app.routers import account

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("status,retryable", [(204,None),(404,None),(403,False),(429,True),(503,True)])
async def test_auth_status_classification_and_absence(monkeypatch,status,retryable):
    client = SimpleNamespace(delete=AsyncMock(return_value=httpx.Response(status,text="SENSITIVE PROVIDER BODY")))
    monkeypatch.setattr(account,"_supabase_client",client)
    if retryable is None:
        await account._delete_supabase_auth_user("synthetic-id")
    else:
        with pytest.raises(account.AuthDeletionError) as error:
            await account._delete_supabase_auth_user("synthetic-id")
        assert error.value.retryable is retryable
        assert "SENSITIVE" not in str(error.value)


async def test_auth_internal_transient_retries_do_not_change_database(monkeypatch):
    operation = AsyncMock(side_effect=[account.AuthDeletionError(True),account.AuthDeletionError(True),None])
    monkeypatch.setattr(account,"_delete_supabase_auth_user",operation)
    monkeypatch.setattr(account,"_AUTH_DELETE_RETRY_BASE_DELAY",0)
    await account._delete_supabase_auth_user_with_retry("synthetic")
    assert operation.await_count == 3
    operation.reset_mock(side_effect=True)
    operation.side_effect = account.AuthDeletionError(False)
    with pytest.raises(account.AuthDeletionError):
        await account._delete_supabase_auth_user_with_retry("synthetic")
    assert operation.await_count == 1


async def test_auth_transport_failure_is_sanitized_retryable(monkeypatch):
    client = SimpleNamespace(delete=AsyncMock(side_effect=httpx.ConnectError("sensitive endpoint")))
    monkeypatch.setattr(account,"_supabase_client",client)
    with pytest.raises(account.AuthDeletionError) as error:
        await account._delete_supabase_auth_user("synthetic")
    assert error.value.retryable and str(error.value) == "AUTH_PROVIDER_FAILURE"


@pytest.mark.parametrize("status,success,retryable",[(200,True,False),(404,True,False),(403,False,False),(429,False,True),(500,False,True)])
async def test_storage_absence_and_failure_classification(monkeypatch,status,success,retryable):
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def request(self,*args,**kwargs): return httpx.Response(status,text="SENSITIVE PROVIDER BODY")
    monkeypatch.setattr(storage.httpx,"AsyncClient",lambda **kwargs:Client())
    result = await storage.delete_storage_target("synthetic","owner/file")
    assert result.success is success and result.retryable is retryable
    assert "SENSITIVE" not in result.code


async def test_storage_transport_failure_is_retryable(monkeypatch):
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self,*args): pass
        async def request(self,*args,**kwargs): raise httpx.ReadTimeout("sensitive endpoint")
    monkeypatch.setattr(storage.httpx,"AsyncClient",lambda **kwargs:Client())
    assert await storage.delete_storage_target("b","p") == storage.StorageDeleteResult(False,True,"STORAGE_TRANSPORT_FAILURE")


async def test_dispatcher_uses_only_shared_claim_protocol(monkeypatch):
    process = AsyncMock(side_effect=[1,1,0])
    monkeypatch.setattr(worker,"process_due_deletions",process)
    await worker.dispatch_deletion(42)
    assert process.await_count == 3
    assert all(c.args == (42,) for c in process.await_args_list)


@pytest.mark.parametrize("raise_inside", [False,True])
@pytest.mark.parametrize("peer_fails", [False,True])
async def test_shutdown_awaits_worker_before_pool_close(monkeypatch,raise_inside,peer_fails):
    from app import main
    from app.middleware import rate_limiter
    app = main.create_app()
    ready, stopped = asyncio.Event(), asyncio.Event()
    async def poller():
        ready.set()
        try:
            await asyncio.Event().wait()
        finally:
            await asyncio.sleep(0)
            stopped.set()
    async def bootstrap(app):
        app.state.deletion_worker_task = asyncio.create_task(poller())
        await asyncio.Event().wait()
    async def close_pool():
        assert stopped.is_set()
        assert app.state.deletion_worker_task.done()
    monkeypatch.setattr(main,"_bootstrap_runtime_services",bootstrap)
    monkeypatch.setattr(main,"close_db_pool",close_pool)
    monkeypatch.setattr(main,"_init_sentry",lambda:None)
    monkeypatch.setattr(rate_limiter,"close_redis_client",AsyncMock())
    async def exercise():
        async with main.lifespan(app):
            await asyncio.wait_for(ready.wait(),2)
            if peer_fails:
                async def broken_peer():
                    raise RuntimeError("synthetic peer failure")
                app.state.report_schedule_task = asyncio.create_task(broken_peer())
                await asyncio.sleep(0)
            if raise_inside:
                raise RuntimeError("synthetic lifespan failure")
    if raise_inside:
        with pytest.raises(RuntimeError,match="synthetic"):
            await exercise()
    else:
        await exercise()
    assert stopped.is_set()
