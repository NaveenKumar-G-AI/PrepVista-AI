"""
Token-bucket rate limiting (Feature 29).

Two implementations behind the same tiny interface (`try_acquire`):

- InMemoryTokenBucket: single-process, used in unit tests and as a safe
  fallback if Redis is unreachable.
- RedisTokenBucket: atomic via a Lua script (so concurrent app instances
  sharing one Redis don't race each other), used in production. Reuses
  whatever Redis you already run for caching (settings.redis_url) rather
  than standing up separate rate-limit infrastructure (Feature 29's "use
  existing Redis... when available").

Both are used the same way for provider limits, model limits, application
limits, organization limits, and user limits — the caller just picks a
different bucket key per scope (see gateway.py).
"""

from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitConfig:
    capacity: int            # max tokens (burst size)
    refill_per_second: float  # sustained rate


class InMemoryTokenBucket:
    def __init__(self, config: RateLimitConfig, clock=time.monotonic):
        self._config = config
        self._clock = clock
        self._tokens = float(config.capacity)
        self._last = clock()

    def _refill(self) -> None:
        now = self._clock()
        elapsed = max(0.0, now - self._last)
        self._tokens = min(self._config.capacity, self._tokens + elapsed * self._config.refill_per_second)
        self._last = now

    def try_acquire(self, cost: float = 1.0) -> bool:
        self._refill()
        if self._tokens >= cost:
            self._tokens -= cost
            return True
        return False

    def available_tokens(self) -> float:
        self._refill()
        return self._tokens


class InMemoryRateLimiterRegistry:
    """One bucket per scope key (e.g. 'user:123', 'org:acme', 'provider:groq')."""

    def __init__(self, default_config: RateLimitConfig):
        self._default_config = default_config
        self._buckets: dict[str, InMemoryTokenBucket] = {}
        self._overrides: dict[str, RateLimitConfig] = {}

    def configure(self, key: str, config: RateLimitConfig) -> None:
        self._overrides[key] = config
        self._buckets.pop(key, None)  # re-create with new config on next use

    def try_acquire(self, key: str, cost: float = 1.0) -> bool:
        if key not in self._buckets:
            self._buckets[key] = InMemoryTokenBucket(self._overrides.get(key, self._default_config))
        return self._buckets[key].try_acquire(cost)


# ---------------------------------------------------------------------------
# Redis-backed atomic token bucket (production path). Import of `redis` is
# optional at module load time so the pure in-memory path above works with
# zero external dependencies.
# ---------------------------------------------------------------------------

_LUA_TOKEN_BUCKET = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_second = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(bucket[1])
local last = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  last = now
end

local elapsed = math.max(0, now - last)
tokens = math.min(capacity, tokens + elapsed * refill_per_second)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last', now)
redis.call('EXPIRE', key, 3600)

return allowed
"""


class RedisTokenBucket:
    """Requires an `redis.asyncio.Redis` client (or a compatible fake, e.g.
    `fakeredis.aioredis.FakeRedis` in tests)."""

    def __init__(self, redis_client, config: RateLimitConfig, key_prefix: str = "ratelimit"):
        self._redis = redis_client
        self._config = config
        self._key_prefix = key_prefix
        self._script = None

    async def try_acquire(self, key: str, cost: float = 1.0) -> bool:
        if self._script is None:
            self._script = self._redis.register_script(_LUA_TOKEN_BUCKET)
        full_key = f"{self._key_prefix}:{key}"
        result = await self._script(
            keys=[full_key],
            args=[self._config.capacity, self._config.refill_per_second, cost, time.time()],
        )
        return bool(int(result))
