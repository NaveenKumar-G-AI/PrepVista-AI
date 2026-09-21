"""
AI response cache (Features 31, 33, 34).

- Only caches when the caller says the operation is cacheable (see
  policy/policy.py OperationPolicy.cacheable) — deterministic/reusable
  operations only, never personalized output (Feature 31).
- `get_or_compute` coalesces concurrent identical requests into a single
  in-flight computation so N simultaneous identical calls trigger exactly
  one provider call (Feature 34).
- `invalidate_prefix` supports bulk invalidation when a prompt, model, or
  policy version changes (Feature 33).

Two backends behind the same interface: `InMemoryAICache` (tests / single
process) and `RedisAICache` (production, shared across app instances).
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional


@dataclass
class CacheEntry:
    value: Any
    expires_at: float


class InMemoryAICache:
    def __init__(self):
        self._store: dict[str, CacheEntry] = {}
        self._inflight: dict[str, "asyncio.Future"] = {}

    async def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        if entry.expires_at < time.monotonic():
            del self._store[key]
            return None
        return entry.value

    async def set(self, key: str, value: Any, ttl_s: float) -> None:
        self._store[key] = CacheEntry(value=value, expires_at=time.monotonic() + ttl_s)

    def invalidate_prefix(self, prefix: str) -> int:
        keys = [k for k in self._store if k.startswith(prefix)]
        for k in keys:
            del self._store[k]
        return len(keys)

    async def get_or_compute(
        self, key: str, ttl_s: float, compute: Callable[[], Awaitable[Any]]
    ) -> tuple[Any, bool]:
        """Returns (value, cache_hit). Coalesces concurrent callers sharing
        the same key into a single `compute()` invocation."""
        cached = await self.get(key)
        if cached is not None:
            return cached, True

        existing = self._inflight.get(key)
        if existing is not None:
            return await existing, True  # joined an in-flight computation, not a fresh miss

        loop = asyncio.get_event_loop()
        fut = loop.create_future()
        self._inflight[key] = fut
        try:
            result = await compute()
            await self.set(key, result, ttl_s)
            fut.set_result(result)
            return result, False
        except Exception as e:
            fut.set_exception(e)
            fut.exception()  # mark retrieved so asyncio doesn't warn if no joiner ever awaited this future
            raise
        finally:
            del self._inflight[key]


class RedisAICache:
    """Production backend. Requires a `redis.asyncio.Redis`-compatible
    client (real redis-py, or `fakeredis.aioredis.FakeRedis` in tests).

    Coalescing across *processes* is done with a short-lived Redis lock
    (SET NX PX) so only one process computes a cold key while others wait
    and then read the now-warm cache — a single process still avoids
    redundant local computation via the same in-flight-future trick as
    InMemoryAICache.
    """

    def __init__(self, redis_client, namespace: str = "aicache", lock_wait_s: float = 10.0, lock_poll_s: float = 0.05):
        self._redis = redis_client
        self._namespace = namespace
        self._lock_wait_s = lock_wait_s
        self._lock_poll_s = lock_poll_s
        self._inflight: dict[str, "asyncio.Future"] = {}

    async def get(self, key: str) -> Optional[Any]:
        raw = await self._redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set(self, key: str, value: Any, ttl_s: float) -> None:
        await self._redis.set(key, json.dumps(value), ex=max(1, int(ttl_s)))

    async def invalidate_prefix(self, prefix: str) -> int:
        count = 0
        async for k in self._redis.scan_iter(match=f"{prefix}*"):
            await self._redis.delete(k)
            count += 1
        return count

    async def get_or_compute(self, key: str, ttl_s: float, compute: Callable[[], Awaitable[Any]]) -> tuple[Any, bool]:
        cached = await self.get(key)
        if cached is not None:
            return cached, True

        existing = self._inflight.get(key)
        if existing is not None:
            return await existing, True

        loop = asyncio.get_event_loop()
        fut = loop.create_future()
        self._inflight[key] = fut
        try:
            lock_key = f"{self._namespace}:lock:{key}"
            got_lock = await self._redis.set(lock_key, "1", nx=True, px=int(self._lock_wait_s * 1000))
            if not got_lock:
                # Another process is computing this key — poll cache until it appears or we time out.
                waited = 0.0
                while waited < self._lock_wait_s:
                    await asyncio.sleep(self._lock_poll_s)
                    waited += self._lock_poll_s
                    cached = await self.get(key)
                    if cached is not None:
                        fut.set_result(cached)
                        return cached, True
                # Lock holder never finished in time — fall through and compute ourselves.
            result = await compute()
            await self.set(key, result, ttl_s)
            fut.set_result(result)
            return result, False
        except Exception as e:
            fut.set_exception(e)
            fut.exception()  # mark retrieved so asyncio doesn't warn if no joiner ever awaited this future
            raise
        finally:
            self._inflight.pop(key, None)
