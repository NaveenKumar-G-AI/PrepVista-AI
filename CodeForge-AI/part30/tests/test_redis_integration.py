"""
Integration tests against a REAL Redis instance (redis.asyncio).

Skipped automatically if REDIS_URL isn't set or the server isn't
reachable — mirroring test_db_repository_integration.py's pattern. When a
Redis server is available (e.g. `redis-server` running locally, or your
real REDIS_URL), these exercise the actual Lua-script token bucket and the
actual cross-process cache/lock path, not the pure-Python fallbacks.
"""

import asyncio
import os
import uuid

import pytest

redis_asyncio = pytest.importorskip("redis.asyncio")

from ai_gateway.caching.cache import RedisAICache
from ai_gateway.resilience.rate_limiter import RateLimitConfig, RedisTokenBucket

# No implicit localhost fallback here, deliberately — matching
# test_db_repository_integration.py's pattern so "zero config" has one
# consistent meaning across both integration suites: nothing runs unless
# REDIS_URL is explicitly set, even if a Redis happens to be reachable on
# the default port for unrelated reasons.
REDIS_URL = os.environ.get("REDIS_URL")

pytestmark = pytest.mark.skipif(
    not REDIS_URL, reason="REDIS_URL not set — skipping live-Redis integration tests"
)


@pytest.fixture
async def redis_client():
    client = redis_asyncio.from_url(REDIS_URL)
    yield client
    await client.aclose()


@pytest.mark.asyncio
async def test_redis_token_bucket_enforces_capacity_atomically(redis_client):
    key = f"test:{uuid.uuid4().hex}"
    bucket = RedisTokenBucket(redis_client, RateLimitConfig(capacity=3, refill_per_second=0))

    results = [await bucket.try_acquire(key) for _ in range(5)]
    assert results == [True, True, True, False, False]


@pytest.mark.asyncio
async def test_redis_token_bucket_is_atomic_under_concurrency(redis_client):
    """The whole point of the Lua script is that concurrent callers can't
    race past the capacity check-then-decrement. Fire 50 concurrent
    acquires against a capacity of 10 and confirm exactly 10 succeed."""
    key = f"test:{uuid.uuid4().hex}"
    bucket = RedisTokenBucket(redis_client, RateLimitConfig(capacity=10, refill_per_second=0))

    results = await asyncio.gather(*[bucket.try_acquire(key) for _ in range(50)])
    assert sum(1 for r in results if r) == 10, "exactly capacity=10 acquires should succeed, no more, no fewer"


@pytest.mark.asyncio
async def test_redis_cache_set_get_roundtrip(redis_client):
    cache = RedisAICache(redis_client, namespace=f"test{uuid.uuid4().hex[:8]}")
    await cache.set("k1", {"text": "hello", "n": 42}, ttl_s=30)
    value = await cache.get("k1")
    assert value == {"text": "hello", "n": 42}


@pytest.mark.asyncio
async def test_redis_cache_invalidate_prefix(redis_client):
    ns = f"test{uuid.uuid4().hex[:8]}"
    cache = RedisAICache(redis_client, namespace=ns)
    await cache.set(f"{ns}:op_a:1", "x", 30)
    await cache.set(f"{ns}:op_a:2", "y", 30)
    await cache.set(f"{ns}:op_b:1", "z", 30)

    removed = await cache.invalidate_prefix(f"{ns}:op_a:")
    assert removed == 2
    assert await cache.get(f"{ns}:op_b:1") == "z"


@pytest.mark.asyncio
async def test_redis_cache_cross_process_lock_prevents_duplicate_compute(redis_client):
    """Simulates two separate app processes racing on the same cold key:
    both call get_or_compute concurrently; only one should actually run
    `compute()` thanks to the SET NX lock, the other should wait and then
    read the now-warm cache."""
    ns = f"test{uuid.uuid4().hex[:8]}"
    cache_a = RedisAICache(redis_client, namespace=ns)
    cache_b = RedisAICache(redis_client, namespace=ns)  # separate instance = separate in-process futures dict
    key = f"{ns}:shared-cold-key"
    calls = {"n": 0}

    async def compute():
        calls["n"] += 1
        await asyncio.sleep(0.2)
        return {"result": "computed-once"}

    results = await asyncio.gather(
        cache_a.get_or_compute(key, 30, compute),
        cache_b.get_or_compute(key, 30, compute),
    )
    assert calls["n"] == 1, "only one of the two racing processes should have actually computed"
    assert results[0][0] == results[1][0] == {"result": "computed-once"}
