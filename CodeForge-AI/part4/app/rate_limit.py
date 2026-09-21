"""
Rate limiting (Phase 31: "protect against excessive submissions").

In-memory sliding window, keyed by authenticated student_id (never a
client-supplied value). This is process-local — a real multi-instance
deployment needs a shared store (Redis, or Postgres row + interval
check), which is a one-function swap of `_hits` for that store; the
policy (window, limit, 429 on exceed) transfers directly. Documented as
a known scaling gap, not hidden.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from app.auth import verify_token

WINDOW_SECONDS = 60.0
MAX_SUBMISSIONS_PER_WINDOW = 10

_hits: dict[str, deque[float]] = defaultdict(deque)


def reset_rate_limits_for_tests() -> None:
    _hits.clear()


def enforce_submission_rate_limit(student_id: str = Depends(verify_token)) -> str:
    now = time.monotonic()
    window = _hits[student_id]
    while window and now - window[0] > WINDOW_SECONDS:
        window.popleft()
    if len(window) >= MAX_SUBMISSIONS_PER_WINDOW:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: max {MAX_SUBMISSIONS_PER_WINDOW} submissions per {int(WINDOW_SECONDS)}s.",
        )
    window.append(now)
    return student_id
