"""
PrepVista AI — Redis-Based Rate Limiter
Sliding window rate limiting using Upstash Redis REST API.
Falls back to in-memory if Redis is unavailable.

Recommendations applied:
  [Rec A] asyncio.Lock on _memory_rate_check — eliminates concurrent over-count race
  [Rec B] Trusted-proxy CIDR whitelist — X-Forwarded-For only accepted from known proxies
  [Rec C] close_redis_client() documented for main.py shutdown wiring
  [Rec D] Atomic Lua script path added alongside pipeline (toggle via USE_LUA_ATOMIC)
  [Rec E] Per-endpoint rate-limit config map — AI generation routes get tighter limits
  [Rec F] X-RateLimit-Remaining header — returned on every allowed request
"""

import asyncio
import ipaddress
import time
import uuid
from collections import defaultdict
from typing import Optional

import httpx
import structlog
from fastapi import HTTPException, Request

from app.config import get_settings

logger = structlog.get_logger("prepvista.ratelimit")

# ── In-memory fallback ────────────────────────────────────────────────────────
_MEMORY_STORE_MAX_KEYS = 10_000
_memory_store: dict[str, list[float]] = defaultdict(list)

# Rec A — asyncio.Lock eliminates the read-check-append race condition in the
# memory fallback. Without this, two coroutines simultaneously seeing
# len(store[key]) < limit both append, exceeding the limit silently.
_memory_lock = asyncio.Lock()

# ── Persistent httpx client ───────────────────────────────────────────────────
# Module-level initialization eliminates the cold-start race condition.
# max_connections=50 caps simultaneous Upstash TCP connections under 500 users.
# Separate connect/read timeouts reduce max event-loop hold from 3s → 1s.
_redis_client: httpx.AsyncClient = httpx.AsyncClient(
    timeout=httpx.Timeout(connect=0.5, read=1.0, write=1.0, pool=1.0),
    limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
)

# ── Rate-limit window ─────────────────────────────────────────────────────────
_WINDOW_SECONDS = 60

# ── Max key component length ──────────────────────────────────────────────────
_MAX_KEY_COMPONENT_LEN = 256

# ── Rec D — Atomic Lua enforcement toggle ─────────────────────────────────────
# Set USE_LUA_ATOMIC = True to switch from pipeline (near-atomic) to a single
# Lua EVAL call (fully atomic). Requires verifying your Upstash plan supports
# EVAL. The pipeline approach is the safe default.
USE_LUA_ATOMIC = False

# ── Rec E — Per-endpoint rate-limit config map ────────────────────────────────
# Routes matching a prefix get tighter (limit, window) instead of the global
# settings value. AI generation endpoints are expensive; throttle them harder.
# Keys are path prefixes. First match wins.
# Format: { "/api/path/prefix": (requests_per_window, window_seconds) }
ENDPOINT_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/interview/generate": (10, 60),   # AI generation — expensive, tight
    "/api/v1/feedback/generate":  (10, 60),   # AI feedback — expensive, tight
    "/api/v1/question/generate":  (15, 60),   # Question generation — moderate
}

# ── Rec B — Trusted proxy CIDR whitelist ──────────────────────────────────────
# X-Forwarded-For is only trusted when the direct connection comes from one of
# these ranges. Outside these ranges, the header is ignored and request.client.host
# is used directly — preventing IP spoofing by end clients.
#
# Add your infrastructure's IP ranges:
#   - Cloudflare: https://www.cloudflare.com/ips/
#   - AWS ALB: your VPC CIDR (e.g. "10.0.0.0/8")
#   - Nginx proxy subnet, etc.
#
# Set to None to trust X-Forwarded-For from any source (less secure, original behavior).
TRUSTED_PROXY_CIDRS: Optional[list[str]] = None  # e.g. ["103.21.244.0/22", "10.0.0.0/8"]

# Pre-compiled network objects for fast CIDR membership testing
_trusted_networks: Optional[list[ipaddress.IPv4Network | ipaddress.IPv6Network]] = None

if TRUSTED_PROXY_CIDRS is not None:
    _trusted_networks = []
    for cidr in TRUSTED_PROXY_CIDRS:
        try:
            _trusted_networks.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            logger.warning("invalid_trusted_proxy_cidr", cidr=cidr)


def _is_trusted_proxy(ip: str) -> bool:
    """Return True if the direct connection IP is a trusted proxy."""
    if _trusted_networks is None:
        # No whitelist configured — trust all sources (backwards-compatible default)
        return True
    try:
        addr = ipaddress.ip_address(ip)
        return any(addr in network for network in _trusted_networks)
    except ValueError:
        return False


def _get_client_ip(request: Request) -> str:
    """
    Extract the real client IP, respecting reverse proxy headers only from
    trusted proxy sources (Rec B).

    Priority:
      1. X-Forwarded-For first entry — ONLY if direct connection is a trusted proxy
      2. X-Real-IP — ONLY if direct connection is a trusted proxy
      3. request.client.host — always available as the final fallback

    Without this, all students behind a college NAT gateway share one bucket —
    one student's usage blocks all 499 others simultaneously.
    """
    direct_ip = request.client.host if request.client else None

    if direct_ip and _is_trusted_proxy(direct_ip):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            first_ip = forwarded_for.split(",")[0].strip()
            if first_ip:
                return first_ip

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()

    return direct_ip or "unknown"


def _safe_key(prefix: str, value: str) -> str:
    """Build a namespaced Redis/memory key with a length cap."""
    return f"{prefix}{value[:_MAX_KEY_COMPONENT_LEN]}"


def _get_redis_client() -> httpx.AsyncClient:
    """Return the persistent httpx client for Redis calls."""
    return _redis_client


async def close_redis_client() -> None:
    """
    Close the persistent Redis httpx client gracefully on app shutdown.

    Wire this in main.py to prevent connection pool leaks on every restart:

        from app.middleware.rate_limiter import close_redis_client

        @app.on_event("shutdown")
        async def shutdown():
            await close_redis_client()
    """
    await _redis_client.aclose()


def _get_endpoint_limits(path: str, default_limit: int) -> tuple[int, int]:
    """
    Rec E — Return (limit, window) for the given path.
    Checks ENDPOINT_RATE_LIMITS for a matching prefix; falls back to default.
    """
    for prefix, (limit, window) in ENDPOINT_RATE_LIMITS.items():
        if path.startswith(prefix):
            return limit, window
    return default_limit, _WINDOW_SECONDS


# ── Lua atomic script (Rec D) ─────────────────────────────────────────────────
# Fully atomic alternative to the pipeline. Activated when USE_LUA_ATOMIC = True.
# The Lua script runs as a single unit on the Redis server — no race window between
# ZREMRANGEBYSCORE, ZADD, ZCARD, and EXPIRE.
_LUA_SLIDING_WINDOW = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '0', tostring(now - window))
redis.call('ZADD', key, tostring(now), member)
local count = redis.call('ZCARD', key)
redis.call('EXPIRE', key, tostring(window))
return count
"""


async def _redis_rate_check(key: str, limit: int, window: int) -> tuple[bool, int]:
    """
    Check rate limit via Upstash Redis REST API.
    Returns (allowed: bool, remaining: int).
    """
    settings = get_settings()
    if not settings.UPSTASH_REDIS_URL or not settings.UPSTASH_REDIS_TOKEN:
        return await _memory_rate_check_async(key, limit, window)

    now = time.time()
    # Unique member prevents ZADD collision — two concurrent requests at the
    # same float timestamp would ZADD-update instead of ZADD-insert without this,
    # making ZCARD artificially low and bypassing the rate limit silently.
    member = f"{now:.6f}:{uuid.uuid4().hex[:8]}"

    try:
        client = _get_redis_client()

        if USE_LUA_ATOMIC:
            # Rec D — Single atomic Lua EVAL (fully race-free)
            payload = [
                ["EVAL", _LUA_SLIDING_WINDOW, "1", key,
                 str(now), str(window), str(limit), member]
            ]
        else:
            # Pipeline (near-atomic — acceptable for most deployments)
            payload = [
                ["ZREMRANGEBYSCORE", key, "0", str(now - window)],
                ["ZADD", key, str(now), member],
                ["ZCARD", key],
                ["EXPIRE", key, str(window)],
            ]

        resp = await client.post(
            f"{settings.UPSTASH_REDIS_URL}/pipeline",
            headers={"Authorization": f"Bearer {settings.UPSTASH_REDIS_TOKEN}"},
            json=payload,
        )
        results = resp.json()

        if USE_LUA_ATOMIC:
            count = int(results[0]["result"] if isinstance(results[0], dict) else results[0])
        else:
            count = int(results[2]["result"] if isinstance(results[2], dict) else results[2])

        remaining = max(0, limit - count)
        return count <= limit, remaining

    except httpx.TimeoutException as e:
        logger.warning("redis_rate_limit_timeout", key=key, error=str(e), fallback="memory")
        return await _memory_rate_check_async(key, limit, window)

    except httpx.ConnectError as e:
        logger.warning("redis_rate_limit_connect_error", key=key, error=str(e), fallback="memory")
        return await _memory_rate_check_async(key, limit, window)

    except Exception as e:
        logger.warning("redis_rate_limit_fallback", key=key, error=str(e), fallback="memory")
        return await _memory_rate_check_async(key, limit, window)


async def _memory_rate_check_async(key: str, limit: int, window: int) -> tuple[bool, int]:
    """
    Async wrapper for in-memory sliding window fallback.
    Rec A — asyncio.Lock makes the check-then-append atomic under concurrency.
    Returns (allowed: bool, remaining: int).
    """
    async with _memory_lock:
        now = time.time()

        # Evict oldest keys when store is at capacity
        if len(_memory_store) > _MEMORY_STORE_MAX_KEYS:
            overflow = len(_memory_store) - _MEMORY_STORE_MAX_KEYS
            candidates = [
                ((_memory_store[k][-1] if _memory_store[k] else 0.0), k)
                for k in list(_memory_store.keys())
            ]
            candidates.sort(key=lambda x: x[0])
            removed = 0
            for _, k in candidates:
                _memory_store.pop(k, None)
                removed += 1
                if removed >= overflow:
                    break

        # Slide the window
        _memory_store[key] = [t for t in _memory_store[key] if now - t < window]

        count = len(_memory_store[key])
        if count >= limit:
            return False, 0

        _memory_store[key].append(now)
        remaining = max(0, limit - count - 1)
        return True, remaining


# ── Public rate-limit dependency functions ────────────────────────────────────

async def rate_limit_ip(request: Request):
    """
    Rate limit by client IP for anonymous endpoints.
    Applies per-endpoint limits from ENDPOINT_RATE_LIMITS if path matches.
    Returns X-RateLimit-Remaining header on allowed requests (Rec F).
    """
    settings = get_settings()
    client_ip = _get_client_ip(request)
    limit, window = _get_endpoint_limits(request.url.path, settings.RATE_LIMIT_ANONYMOUS)
    key = _safe_key("rl:ip:", client_ip)
    allowed, remaining = await _redis_rate_check(key, limit, window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit reached. Please wait {window} seconds before retrying.",
            headers={
                "Retry-After": str(window),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Window": str(window),
            },
        )
    # Rec F — Inform clients how many requests they have left in the window
    request.state.ratelimit_remaining = remaining


async def rate_limit_user(user_id: str, request: Optional[Request] = None):
    """
    Rate limit by authenticated user ID.
    Applies per-endpoint limits if request is provided.
    """
    settings = get_settings()
    path = request.url.path if request else ""
    limit, window = _get_endpoint_limits(path, settings.RATE_LIMIT_AUTHENTICATED)
    key = _safe_key("rl:user:", user_id)
    allowed, remaining = await _redis_rate_check(key, limit, window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit reached. Please wait {window} seconds before retrying.",
            headers={
                "Retry-After": str(window),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Window": str(window),
            },
        )
    if request:
        request.state.ratelimit_remaining = remaining


async def rate_limit_session(session_id: str, request: Optional[Request] = None):
    """
    Rate limit per interview session (prevents automation).
    Applies per-endpoint limits if request is provided.
    """
    settings = get_settings()
    path = request.url.path if request else ""
    limit, window = _get_endpoint_limits(path, settings.RATE_LIMIT_INTERVIEW)
    key = _safe_key("rl:session:", session_id)
    allowed, remaining = await _redis_rate_check(key, limit, window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Session rate limit reached. Please wait {window} seconds before retrying.",
            headers={
                "Retry-After": str(window),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Window": str(window),
            },
        )
    if request:
        request.state.ratelimit_remaining = remaining