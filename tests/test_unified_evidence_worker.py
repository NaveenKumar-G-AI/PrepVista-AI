import asyncio
from types import SimpleNamespace

import pytest

from app.services import unified_evidence_worker as worker


@pytest.mark.parametrize('evidence,embedded', [(False, True), (True, False), (False, False)])
def test_disabled_loop_never_opens_database(monkeypatch, evidence, embedded):
    monkeypatch.setattr(worker, 'get_settings', lambda: SimpleNamespace(
        UNIFIED_EVIDENCE_ENABLED=evidence, UNIFIED_EVIDENCE_IN_PROCESS_ENABLED=embedded))
    def forbidden():
        raise AssertionError('Disabled worker touched the database')
    monkeypatch.setattr(worker, 'DatabaseConnection', forbidden)
    asyncio.run(worker.run_in_process())


@pytest.mark.parametrize('first_failure', ['exception', 'timeout'])
def test_worker_recovers_after_failure_and_cancels_inflight_work(monkeypatch, first_failure):
    monkeypatch.setattr(worker, 'get_settings', lambda: SimpleNamespace(
        UNIFIED_EVIDENCE_ENABLED=True, UNIFIED_EVIDENCE_IN_PROCESS_ENABLED=True))
    monkeypatch.setattr(worker, 'IN_PROCESS_POLL_SECONDS', 0)
    monkeypatch.setattr(worker, 'IN_PROCESS_TICK_TIMEOUT', 0.02)

    async def scenario():
        calls = []
        cancelled = []
        recovered = asyncio.Event()
        async def tick(*, limit):
            calls.append(limit)
            if len(calls) == 1 and first_failure == 'exception':
                raise RuntimeError('private connection data must not be logged')
            try:
                if len(calls) > 1:
                    recovered.set()
                await asyncio.Event().wait()
            finally:
                cancelled.append(len(calls))
        monkeypatch.setattr(worker, 'tick', tick)
        task = asyncio.create_task(worker.run_in_process())
        try:
            await asyncio.wait_for(recovered.wait(), 1)
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        assert calls == [10, 10]
        assert cancelled[-1] == 2
    asyncio.run(scenario())


def test_backend_starts_worker_after_pool_and_stops_before_pool_close(monkeypatch):
    from fastapi import FastAPI
    from app import main
    from app.services import report_schedules, calibration
    settings = SimpleNamespace(APP_VERSION='test', ENVIRONMENT='test',
        UNIFIED_EVIDENCE_ENABLED=True, UNIFIED_EVIDENCE_IN_PROCESS_ENABLED=True)
    monkeypatch.setattr(main, 'get_settings', lambda: settings)
    monkeypatch.setattr(main, '_init_sentry', lambda: None)
    monkeypatch.setattr(main, '_validate_runtime_environment', lambda _: None)
    async def scenario():
        events = []
        started = asyncio.Event()
        async def pool(**kwargs): events.append('pool_open')
        async def close(): events.append('pool_close')
        async def background(): await asyncio.Event().wait()
        async def evidence():
            assert events == ['pool_open']
            events.append('worker_started')
            started.set()
            try: await asyncio.Event().wait()
            finally: events.append('worker_stopped')
        async def noop(*args, **kwargs): pass
        class Connection:
            async def __aenter__(self): return None
            async def __aexit__(self, *args): pass
        monkeypatch.setattr(main, 'init_db_pool', pool)
        monkeypatch.setattr(main, 'close_db_pool', close)
        monkeypatch.setattr(main, 'DatabaseConnection', Connection)
        monkeypatch.setattr(main, 'refresh_user_activity_stats', noop)
        monkeypatch.setattr(main, '_run_user_activity_refresh_loop', background)
        monkeypatch.setattr(report_schedules, 'run_report_schedule_loop', background)
        monkeypatch.setattr(calibration, 'load_calibrated_parameters', noop)
        monkeypatch.setattr(worker, 'run_in_process', evidence)
        async with main.lifespan(FastAPI()):
            await asyncio.wait_for(started.wait(), 1)
        assert events == ['pool_open', 'worker_started', 'worker_stopped', 'pool_close']
    asyncio.run(scenario())
