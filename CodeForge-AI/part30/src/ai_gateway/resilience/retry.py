"""
Bounded retry with exponential backoff + jitter (Features 26-27).

Retries TransientProviderError (timeout, rate limit, 5xx). Never retries
PermanentProviderError (bad request, auth failure, unsupported model) —
those fail immediately, on the first attempt, because retrying them can
only waste money and time without changing the outcome.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Awaitable, Callable, TypeVar

from ..errors import PermanentProviderError, TransientProviderError

T = TypeVar("T")


@dataclass(frozen=True)
class RetryPolicy:
    max_retries: int = 3          # total attempts = max_retries + 1
    base_delay_s: float = 0.2
    max_delay_s: float = 5.0
    jitter_s: float = 0.1


@dataclass
class RetryOutcome:
    attempts: int
    succeeded: bool


def compute_backoff_delay(attempt: int, policy: RetryPolicy, rand: Callable[[], float] = random.random) -> float:
    """attempt is 0-indexed (0 = delay before the 2nd try)."""
    raw = policy.base_delay_s * (2 ** attempt)
    bounded = min(policy.max_delay_s, raw)
    jitter = rand() * policy.jitter_s
    return bounded + jitter


async def retry_with_backoff(
    fn: Callable[[], Awaitable[T]],
    policy: RetryPolicy,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    rand: Callable[[], float] = random.random,
) -> T:
    """Runs `fn()`. On TransientProviderError, retries up to
    `policy.max_retries` additional times with bounded exponential backoff.
    On PermanentProviderError, re-raises immediately without retrying.
    """
    attempt = 0
    while True:
        try:
            return await fn()
        except PermanentProviderError:
            raise
        except TransientProviderError:
            if attempt >= policy.max_retries:
                raise
            delay = compute_backoff_delay(attempt, policy, rand=rand)
            await sleep(delay)
            attempt += 1
