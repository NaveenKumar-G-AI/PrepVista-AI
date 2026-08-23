"""
In-process login rate limiter.

This is intentionally simple: a fixed-window counter per (email, ip)
kept in memory. It is correct for a single-process deployment. The
moment PrepVista runs more than one API process, this must be swapped
for a shared store (Redis INCR + EXPIRE is the natural replacement) —
that swap does not require touching any caller of `check_and_record`.
"""
import time
from collections import defaultdict

from app.config import get_settings

_attempts: dict[str, list[float]] = defaultdict(list)


def check_and_record(key: str) -> bool:
    """Returns True if this attempt is allowed, False if rate-limited."""
    settings = get_settings()
    now = time.time()
    window_start = now - settings.login_rate_limit_window_seconds
    attempts = [t for t in _attempts[key] if t > window_start]
    if len(attempts) >= settings.login_rate_limit_attempts:
        _attempts[key] = attempts
        return False
    attempts.append(now)
    _attempts[key] = attempts
    return True


def reset(key: str) -> None:
    _attempts.pop(key, None)
