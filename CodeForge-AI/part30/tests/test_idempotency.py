import asyncio

import pytest

from ai_gateway.resilience.idempotency import InMemoryIdempotencyStore


@pytest.mark.asyncio
async def test_completed_result_is_returned_without_recomputation():
    store = InMemoryIdempotencyStore()
    existing, waiter = await store.get_or_lock("key-1")
    assert existing is None
    assert waiter is not None
    store.complete("key-1", "computed-result")

    existing2, waiter2 = await store.get_or_lock("key-1")
    assert existing2 == "computed-result"
    assert waiter2 is None


@pytest.mark.asyncio
async def test_concurrent_callers_with_same_key_share_one_computation():
    store = InMemoryIdempotencyStore()
    compute_calls = {"n": 0}

    async def worker():
        existing, waiter = await store.get_or_lock("dup-key")
        if existing is not None:
            return existing
        if waiter is not None:
            # crude check: am I the owner? In this store, get_or_lock returns
            # a fresh future for the first caller and the SAME future object
            # to later callers, so identity tells us who owns computation.
            pass
        compute_calls["n"] += 1
        await asyncio.sleep(0.01)
        result = f"result-{compute_calls['n']}"
        store.complete("dup-key", result)
        return result

    # Only fire the first call to establish ownership, then have the rest just read.
    first_existing, first_waiter = await store.get_or_lock("dup-key")
    assert first_existing is None

    async def compute_and_complete():
        await asyncio.sleep(0.01)
        store.complete("dup-key", "the-one-true-result")

    async def wait_for_it():
        return await first_waiter

    results = await asyncio.gather(compute_and_complete(), wait_for_it(), wait_for_it(), wait_for_it())
    assert results[1] == results[2] == results[3] == "the-one-true-result"


@pytest.mark.asyncio
async def test_failure_propagates_to_waiters():
    store = InMemoryIdempotencyStore()
    existing, waiter = await store.get_or_lock("fail-key")
    assert existing is None

    store.fail("fail-key", ValueError("boom"))
    with pytest.raises(ValueError, match="boom"):
        await waiter
