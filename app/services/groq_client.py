"""
PrepVista — Rate-Limit-Aware Groq Client
=========================================
Wraps the raw Groq HTTP calls with everything needed to survive
500 concurrent interview sessions without jamming:

  1. Token-bucket rate limiter   — never exceeds Groq's RPM limit
  2. Semaphore concurrency cap   — caps in-flight requests globally
  3. Exponential backoff + jitter — handles 429/503 gracefully
  4. Circuit breaker             — stops hammering Groq when it's down
  5. API-key rotation            — spreads load across multiple keys
  6. Per-request timeout         — returns FALLBACK signal instead of hanging
  7. Response cache              — identical (prompt-hash) calls share result
     for 90 s, which happens naturally at session-start bursts

Drop-in replacement for direct httpx/groq calls in interviewer.py:

    from app.services.groq_client import get_groq_client
    client = get_groq_client()
    result = await client.complete(messages, model, max_tokens, purpose)

`purpose` is a human label ("eval" | "question_gen" | "plan_gen") used
for metrics/logging — doesn't change behaviour.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import random
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

# Groq paid-tier conservative defaults (tune via env).
# If you have multiple API keys, set GROQ_API_KEYS as comma-separated.
_GROQ_RPM_LIMIT  = int(os.getenv("GROQ_RPM_LIMIT",  "500"))   # requests per minute
_GROQ_MAX_INFLIGHT = int(os.getenv("GROQ_MAX_INFLIGHT", "40")) # concurrent in-flight
_GROQ_TIMEOUT_S    = float(os.getenv("GROQ_TIMEOUT_S", "28")) # per-request timeout
_CACHE_TTL_S       = 90.0                                       # prompt-hash cache TTL
_CB_FAILURE_THRESHOLD = 5      # circuit breaker: open after N consecutive failures
_CB_RECOVERY_S        = 30.0  # circuit breaker: try again after N seconds


# ── Circuit breaker ────────────────────────────────────────────────────────────

class _CBState(Enum):
    CLOSED = "closed"       # normal operation
    OPEN   = "open"         # refusing all requests; returning fallback
    HALF   = "half_open"    # probing with one request


@dataclass
class _CircuitBreaker:
    threshold: int  = _CB_FAILURE_THRESHOLD
    recovery_s: float = _CB_RECOVERY_S
    _state: _CBState = _CBState.CLOSED
    _failures: int = 0
    _opened_at: float = 0.0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def record_success(self) -> None:
        async with self._lock:
            self._failures = 0
            self._state = _CBState.CLOSED

    async def record_failure(self) -> None:
        async with self._lock:
            self._failures += 1
            if self._failures >= self.threshold:
                self._state = _CBState.OPEN
                self._opened_at = time.monotonic()
                logger.warning("[groq_client] Circuit breaker OPENED after %d consecutive failures", self._failures)

    async def allow_request(self) -> bool:
        async with self._lock:
            if self._state == _CBState.CLOSED:
                return True
            if self._state == _CBState.OPEN:
                if time.monotonic() - self._opened_at >= self.recovery_s:
                    self._state = _CBState.HALF
                    logger.info("[groq_client] Circuit breaker → HALF-OPEN, probing")
                    return True
                return False
            # HALF_OPEN: allow exactly one probe
            return True


# ── Token-bucket rate limiter ──────────────────────────────────────────────────

class _TokenBucket:
    """
    Thread/async-safe token bucket for RPM limiting.
    Refills `rate` tokens every 60 seconds (1 per 60/rate seconds).
    """

    def __init__(self, rate_per_minute: int) -> None:
        self._capacity = float(rate_per_minute)
        self._tokens   = float(rate_per_minute)
        self._rate     = rate_per_minute / 60.0  # tokens per second
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Block until a token is available."""
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                wait = (1.0 - self._tokens) / self._rate
            await asyncio.sleep(wait)

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
        self._last_refill = now


# ── Response cache ─────────────────────────────────────────────────────────────

class _PromptCache:
    """
    In-process LRU-like cache keyed on (prompt-hash, model, max_tokens).
    TTL-based expiry. Bounded at 256 entries.
    Eliminates duplicate plan-gen calls at burst start (same resume submitted
    in quick succession during CSV import + session creation).
    """

    _MAX = 256

    def __init__(self, ttl_s: float = _CACHE_TTL_S) -> None:
        self._ttl = ttl_s
        self._store: dict[str, tuple[Any, float]] = {}
        self._order: deque[str] = deque()

    def _key(self, messages: list[dict], model: str, max_tokens: int) -> str:
        raw = json.dumps({"m": messages, "md": model, "mt": max_tokens}, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()[:24]

    def get(self, messages: list[dict], model: str, max_tokens: int) -> Any | None:
        k = self._key(messages, model, max_tokens)
        entry = self._store.get(k)
        if entry and time.monotonic() - entry[1] < self._ttl:
            return entry[0]
        if entry:
            self._store.pop(k, None)
        return None

    def set(self, messages: list[dict], model: str, max_tokens: int, value: Any) -> None:
        k = self._key(messages, model, max_tokens)
        if k not in self._store:
            self._order.append(k)
            if len(self._order) > self._MAX:
                old = self._order.popleft()
                self._store.pop(old, None)
        self._store[k] = (value, time.monotonic())


# ── API key rotator ────────────────────────────────────────────────────────────

class _KeyRotator:
    """
    Round-robins across multiple Groq API keys so rate limits are
    spread across keys rather than hammering one.
    Set GROQ_API_KEYS=key1,key2,key3 in env. Falls back to GROQ_API_KEY.
    """

    def __init__(self) -> None:
        multi = os.getenv("GROQ_API_KEYS", "")
        if multi:
            self._keys = [k.strip() for k in multi.split(",") if k.strip()]
        else:
            single = os.getenv("GROQ_API_KEY", "")
            self._keys = [single] if single else []
        if not self._keys:
            raise RuntimeError(
                "No Groq API key found. Set GROQ_API_KEY or GROQ_API_KEYS env var."
            )
        self._idx = 0
        self._lock = asyncio.Lock()

    async def next_key(self) -> str:
        async with self._lock:
            key = self._keys[self._idx % len(self._keys)]
            self._idx += 1
            return key

    @property
    def key_count(self) -> int:
        return len(self._keys)


# ── Main client ───────────────────────────────────────────────────────────────

# Sentinel: returned when Groq is unavailable and caller must use template fallback
FALLBACK_SIGNAL = "__PREPVISTA_FALLBACK__"


class AsyncGroqClient:
    """
    Singleton (via get_groq_client()) rate-limit-aware Groq client.

    Usage:
        client = get_groq_client()
        text = await client.complete(messages, purpose="question_gen")
        if text == FALLBACK_SIGNAL:
            # use pre-built template fallback — do NOT block the student
    """

    def __init__(self) -> None:
        self._rotator   = _KeyRotator()
        self._bucket    = _TokenBucket(_GROQ_RPM_LIMIT * self._rotator.key_count)
        self._semaphore = asyncio.Semaphore(_GROQ_MAX_INFLIGHT)
        self._breaker   = _CircuitBreaker()
        self._cache     = _PromptCache()
        self._http      = httpx.AsyncClient(timeout=_GROQ_TIMEOUT_S + 2)

        effective_rpm = _GROQ_RPM_LIMIT * self._rotator.key_count
        logger.info(
            "[groq_client] Initialized: %d API key(s), effective RPM cap %d, "
            "max in-flight %d, timeout %.1fs",
            self._rotator.key_count, effective_rpm,
            _GROQ_MAX_INFLIGHT, _GROQ_TIMEOUT_S,
        )

    async def complete(
        self,
        messages: list[dict],
        model: str = DEFAULT_MODEL,
        max_tokens: int = 1024,
        purpose: str = "general",
        use_cache: bool = True,
        temperature: float = 0.7,
    ) -> str:
        """
        Send a chat-completion request to Groq.

        Returns the assistant's text content, or FALLBACK_SIGNAL if:
          - The circuit breaker is open
          - All retries are exhausted
          - The request times out after _GROQ_TIMEOUT_S

        Callers MUST check for FALLBACK_SIGNAL and use their template fallback.
        This is the contract that makes the interview engine "never jam":
        even when Groq is completely unavailable, every student gets a question.
        """
        # ── Circuit breaker check ──────────────────────────────────────────
        if not await self._breaker.allow_request():
            logger.warning("[groq_client] Circuit OPEN — returning fallback (%s)", purpose)
            return FALLBACK_SIGNAL

        # ── Cache check (skip for eval/scoring — uniqueness matters there) ──
        if use_cache and purpose in {"plan_gen", "question_gen"}:
            cached = self._cache.get(messages, model, max_tokens)
            if cached is not None:
                logger.debug("[groq_client] Cache hit (%s)", purpose)
                return cached

        # ── Rate limiter (blocks until a token is available) ───────────────
        await self._bucket.acquire()

        # ── Concurrency cap ────────────────────────────────────────────────
        async with self._semaphore:
            return await self._execute_with_retry(
                messages, model, max_tokens, purpose, temperature, use_cache
            )

    async def _execute_with_retry(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        purpose: str,
        temperature: float,
        use_cache: bool,
        max_attempts: int = 4,
    ) -> str:
        last_error: Exception | None = None

        for attempt in range(max_attempts):
            api_key = await self._rotator.next_key()
            try:
                text = await asyncio.wait_for(
                    self._single_request(messages, model, max_tokens, temperature, api_key),
                    timeout=_GROQ_TIMEOUT_S,
                )
                await self._breaker.record_success()
                if use_cache and purpose in {"plan_gen", "question_gen"}:
                    self._cache.set(messages, model, max_tokens, text)
                return text

            except asyncio.TimeoutError:
                logger.warning(
                    "[groq_client] Timeout on attempt %d/%d (%s)",
                    attempt + 1, max_attempts, purpose,
                )
                await self._breaker.record_failure()
                last_error = asyncio.TimeoutError()

            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status == 429:
                    # Rate-limited: back off and retry
                    # Honour Retry-After header if present
                    retry_after = float(exc.response.headers.get("retry-after", "1"))
                    wait = retry_after + _jitter(attempt)
                    logger.warning(
                        "[groq_client] 429 on attempt %d/%d, waiting %.2fs (%s)",
                        attempt + 1, max_attempts, wait, purpose,
                    )
                    await asyncio.sleep(wait)
                    last_error = exc
                    continue
                elif status in {500, 502, 503, 504}:
                    wait = _backoff(attempt)
                    logger.warning(
                        "[groq_client] %d on attempt %d/%d, waiting %.2fs (%s)",
                        status, attempt + 1, max_attempts, wait, purpose,
                    )
                    await self._breaker.record_failure()
                    await asyncio.sleep(wait)
                    last_error = exc
                    continue
                else:
                    # 4xx (not 429): not retryable
                    await self._breaker.record_failure()
                    logger.error("[groq_client] Non-retryable %d (%s): %s", status, purpose, exc)
                    return FALLBACK_SIGNAL

            except Exception as exc:  # noqa: BLE001
                await self._breaker.record_failure()
                logger.error("[groq_client] Unexpected error (%s): %s", purpose, exc)
                last_error = exc
                if attempt < max_attempts - 1:
                    await asyncio.sleep(_backoff(attempt))

        logger.error(
            "[groq_client] All %d attempts failed (%s). Last: %s",
            max_attempts, purpose, last_error,
        )
        return FALLBACK_SIGNAL

    async def _single_request(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int,
        temperature: float,
        api_key: str,
    ) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        response = await self._http.post(
            GROQ_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]

    async def close(self) -> None:
        await self._http.aclose()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _backoff(attempt: int, base: float = 1.0, cap: float = 16.0) -> float:
    """Exponential backoff: 1s, 2s, 4s, 8s… capped at 16s."""
    return min(cap, base * math.pow(2, attempt))


def _jitter(attempt: int) -> float:
    """Full jitter on top of backoff — prevents thundering herd at scale."""
    return random.uniform(0, _backoff(attempt) * 0.5)  # noqa: S311


# ── Singleton accessor ─────────────────────────────────────────────────────────

_client: AsyncGroqClient | None = None
_client_lock: asyncio.Lock | None = None


def get_groq_client() -> AsyncGroqClient:
    """
    Return the process-level singleton AsyncGroqClient.
    Thread-safe at Python GIL level for the first call; asyncio-safe thereafter.
    Call once at app startup (e.g. FastAPI lifespan) to pre-initialize the
    HTTP connection pool, then call from any coroutine.
    """
    global _client, _client_lock
    if _client is None:
        _client = AsyncGroqClient()
    return _client


async def shutdown_groq_client() -> None:
    """Call during app shutdown (FastAPI lifespan teardown) to close HTTP pool."""
    global _client
    if _client:
        await _client.close()
        _client = None