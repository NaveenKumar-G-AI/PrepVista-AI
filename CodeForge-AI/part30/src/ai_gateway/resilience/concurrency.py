"""
Concurrency control (Feature 30).

A thin wrapper around asyncio.Semaphore, keyed per scope (e.g. per
provider, or per organization) so one request source can never exhaust
provider capacity. gateway.py acquires the relevant semaphore(s) before
dispatching a provider call.
"""

from __future__ import annotations

import asyncio


class ConcurrencyLimiter:
    def __init__(self, default_limit: int = 10):
        self._default_limit = default_limit
        self._semaphores: dict[str, asyncio.Semaphore] = {}
        self._limits: dict[str, int] = {}

    def configure(self, key: str, limit: int) -> None:
        self._limits[key] = limit
        self._semaphores.pop(key, None)

    def _get(self, key: str) -> asyncio.Semaphore:
        if key not in self._semaphores:
            self._semaphores[key] = asyncio.Semaphore(self._limits.get(key, self._default_limit))
        return self._semaphores[key]

    def in_flight(self, key: str) -> int:
        sem = self._get(key)
        limit = self._limits.get(key, self._default_limit)
        return limit - sem._value  # inspecting internal counter for observability only

    def acquire(self, key: str):
        """Usage: `async with limiter.acquire('provider:groq'): ...`"""
        return self._get(key)
