import asyncio

from app.services import interview_evaluation_jobs as jobs


def test_waiting_for_capacity_does_not_claim_a_lease_or_consume_an_attempt(monkeypatch):
    async def run():
        slots = asyncio.Semaphore(1)
        entered = asyncio.Event()
        release = asyncio.Event()
        claimed = []

        async def process(session_id, turn_number):
            claimed.append((session_id, turn_number))
            entered.set()
            await release.wait()
            return True

        monkeypatch.setattr(jobs, '_JOB_SLOTS', slots)
        monkeypatch.setattr(jobs, '_process_one', process)
        first = asyncio.create_task(jobs.process_one('owner', 1))
        await entered.wait()
        waiting = asyncio.create_task(jobs.process_one('owner', 2))
        await asyncio.sleep(0)
        assert claimed == [('owner', 1)]
        waiting.cancel()
        try:
            await waiting
        except asyncio.CancelledError:
            pass
        release.set()
        assert await first
        assert claimed == [('owner', 1)]
        assert await jobs.process_one('owner', 2)
        assert claimed == [('owner', 1), ('owner', 2)]

    asyncio.run(run())
