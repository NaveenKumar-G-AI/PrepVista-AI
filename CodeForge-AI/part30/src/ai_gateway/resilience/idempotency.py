"""
Idempotency (Feature 35).

If a caller supplies `RequestContext.idempotency_key` (e.g. derived from a
queue message ID, so redelivery can't double-charge), the gateway checks
this store before doing any real work and returns the previously recorded
result instead of re-executing. `InMemoryIdempotencyStore` is for tests /
single-process use; production should back this with a unique constraint
on `idempotency_key` in the `ai_requests` table (see db/migrations) so it
holds even across multiple app instances racing the same key.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional


class InMemoryIdempotencyStore:
    def __init__(self) -> None:
        self._results: dict[str, Any] = {}
        self._inflight: dict[str, asyncio.Future] = {}

    async def get(self, key: str) -> Optional[Any]:
        return self._results.get(key)

    async def get_or_lock(self, key: str) -> tuple[Optional[Any], Optional[asyncio.Future]]:
        """Returns (existing_result, None) if already completed.
        Returns (None, future) if this call becomes the one responsible for
        computing the result and must call `complete(key, result)` when done.
        Returns (None, other_future) if another in-flight call owns it —
        caller should `await other_future` instead of recomputing.
        """
        if key in self._results:
            return self._results[key], None
        if key in self._inflight:
            return None, self._inflight[key]
        fut = asyncio.get_event_loop().create_future()
        self._inflight[key] = fut
        return None, fut

    def complete(self, key: str, result: Any) -> None:
        self._results[key] = result
        fut = self._inflight.pop(key, None)
        if fut is not None and not fut.done():
            fut.set_result(result)

    def fail(self, key: str, exc: BaseException) -> None:
        fut = self._inflight.pop(key, None)
        if fut is not None and not fut.done():
            fut.set_exception(exc)
            fut.exception()  # mark retrieved so asyncio doesn't warn if no waiter ever awaited this future
