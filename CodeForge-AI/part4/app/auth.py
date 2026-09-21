"""
Phase 30/31 authorization. There is no real Supabase/host auth system in
this sandbox, so this module is an explicit stand-in: a minimal signed
token so ownership checks are real and testable, NOT a production auth
system. A real integration replaces `verify_token`/`require_staff_role`
with the host's actual Supabase JWT verification (reading a real `role`
claim) and keeps everything downstream (the ownership checks in main.py,
the staff-only checks on the Phase 29 reporting endpoints) unchanged —
that's the intended integration seam.

CRITICAL invariant enforced here: the student_id used for every DB write
comes ONLY from the verified token, never from a client-supplied field in
the request body. A request body containing student_id is ignored.

CRITICAL invariant enforced here #2: `role` is inside the HMAC-signed
payload, not a separate unsigned field — a student cannot forge a "staff"
role by tampering with an unsigned part of the token, because the whole
payload (subject:role:expiry) is what's signed.
"""
from __future__ import annotations

import hashlib
import hmac
import time

from fastapi import Header, HTTPException

_SECRET = b"codeforge-dev-secret-change-in-real-deployment"


def issue_dev_token(subject_id: str, role: str = "student", ttl_s: int = 3600) -> str:
    """Dev/test helper only — a real deployment never issues tokens here."""
    expiry = int(time.time()) + ttl_s
    payload = f"{subject_id}:{role}:{expiry}"
    sig = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"


def _parse_and_verify(authorization: str) -> tuple[str, str]:
    """Returns (subject_id, role), or raises 401."""
    token = authorization.removeprefix("Bearer ").strip()
    parts = token.split(":")
    if len(parts) != 4:
        raise HTTPException(status_code=401, detail="Invalid token")
    subject_id, role, expiry_str, sig = parts
    payload = f"{subject_id}:{role}:{expiry_str}"
    expected_sig = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid token signature")
    if int(expiry_str) < time.time():
        raise HTTPException(status_code=401, detail="Token expired")
    return subject_id, role


def verify_token(authorization: str = Header(...)) -> str:
    """Returns the authenticated subject's id, or raises 401. Used by every
    student-facing endpoint; deliberately ignores role so existing callers
    are unaffected by the addition of roles."""
    subject_id, _role = _parse_and_verify(authorization)
    return subject_id


def require_staff_role(authorization: str = Header(...)) -> str:
    """Phase 29: management/reporting endpoints need a genuinely different
    authorization level than students, not just 'any logged-in user'.
    Returns the staff member's id (for audit logging), or raises 401/403."""
    subject_id, role = _parse_and_verify(authorization)
    if role != "staff":
        raise HTTPException(status_code=403, detail="Forbidden: staff role required")
    return subject_id


def require_ownership(resource_student_id: str, authenticated_student_id: str) -> None:
    if resource_student_id != authenticated_student_id:
        raise HTTPException(status_code=403, detail="Forbidden: not the owner of this resource")
