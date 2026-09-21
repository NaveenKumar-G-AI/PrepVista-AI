"""
complexity_engine.api.auth
=============================
Generic JWT verification — works against any standard JWT issuer
(Supabase Auth included: point JWT_SECRET at your Supabase project's
JWT secret and this verifies it correctly as-is).

INTENTIONALLY LEFT BLANK: JWT_SECRET. Until it's set, every request is
treated as a fixed "dev-user" so the reference server is runnable and
testable without credentials — this fallback must not reach production.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import jwt
from fastapi import Header, HTTPException

JWT_SECRET = os.environ.get("JWT_SECRET")  # set this to your real auth provider's JWT secret
JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", "authenticated")  # Supabase's default audience claim
JWT_ALGORITHMS = ["HS256"]


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    claims: Dict[str, Any]
    dev_mode: bool = False


def get_current_user(authorization: Optional[str] = Header(default=None)) -> AuthenticatedUser:
    if not JWT_SECRET:
        return AuthenticatedUser(user_id="dev-user", claims={}, dev_mode=True)

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization[len("Bearer "):]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=JWT_ALGORITHMS, audience=JWT_AUDIENCE)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"invalid token: {e}") from e

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="token missing 'sub' claim")
    return AuthenticatedUser(user_id=user_id, claims=claims, dev_mode=False)
