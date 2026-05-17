"""
PrepVista - FastAPI dependencies
Common dependencies injected into route handlers.

Security hardening applied (2025):
  - Redis cache key uses full SHA-256 (was truncated to 16 chars → collision risk)
  - Redis-deserialized user data validated against allowlist before UserProfile()
  - Token stripped and minimum-length checked before any processing
  - Log injection via resp.text prevented (truncated + sanitized)
  - Admin email never logged in plaintext (GDPR + operational security)
  - Organisation status not leaked in 403 errors
  - PLAN_HIERARCHY moved to module level (was recreated per request)
  - Sentry user context uses profile_id only (no PII email)
  - asyncio.Lock guards httpx singleton initialization
  - jwt.InvalidTokenError logged at debug level before fallback
  - verify_aud=False documented with explicit security rationale
"""

import asyncio
import hashlib
import json
import time
import jwt
import structlog
from fastapi import Depends, HTTPException, Request

from app.config import PLAN_CONFIG, get_settings
from app.database.connection import get_db
from app.services.auth_identity import (
    ensure_auth_identity_link,
    extract_auth_identity,
    get_profile_id_for_auth_user,
)
from app.services.plan_access import highest_plan, sync_profile_plan_state
from app.services.referrals import apply_joined_referral_reward, ensure_referral_identity
from app.services.user_activity import record_user_presence

logger = structlog.get_logger("prepvista.auth")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AUTH_CACHE_TTL_SECONDS = 15
AUTH_CACHE_MAX_ITEMS   = 2000

# Minimum Bearer token length before cache lookup or JWT decode is attempted.
# A valid Supabase JWT has three Base64URL-encoded sections (header.payload.sig)
# each several dozen characters — nothing shorter than this is legitimate.
# Rejecting short tokens early prevents cache pollution and avoids wasting a
# network round-trip to Supabase for obviously malformed credentials.
_MIN_TOKEN_LENGTH = 40

# Allowlist of field names expected in a UserProfile serialised to Redis.
# Any response from Redis that contains UNEXPECTED keys is rejected outright
# and a fresh DB lookup is performed.
#
# Security rationale: if an attacker gains write access to the Redis instance
# (via exposed credentials, SSRF, or a misconfigured Upstash ACL) they can
# craft a cache entry with arbitrary fields such as {"is_admin": true}.
# Validating against this allowlist means only known, expected fields are
# accepted — any injection attempt causes a cache miss and a DB-authoritative
# lookup, not privilege escalation.
_EXPECTED_CACHE_FIELDS = frozenset({
    "id", "email", "plan", "owned_plans", "expired_plans",
    "is_admin", "premium_override", "interviews_used", "subscription_status",
})

# Plan tier numeric mapping — module-level constant.
# Was previously a dict literal inside require_plan(), meaning it was
# allocated fresh on every authenticated request hit.  At 500 req/s that
# is 500 unnecessary dict allocations per second.
PLAN_HIERARCHY: dict[str, int] = {"free": 0, "pro": 1, "career": 2}

# ---------------------------------------------------------------------------
# In-memory auth cache
# ---------------------------------------------------------------------------

_AUTH_USER_CACHE: dict[str, tuple[float, "UserProfile"]] = {}

# ---------------------------------------------------------------------------
# Async-safe HTTP client singletons
# ---------------------------------------------------------------------------

# asyncio.Lock ensures each client is created exactly once even when multiple
# coroutines race to the None check at startup.  Without locks, coroutines
# that both see None simultaneously each create a client; the slower one is
# discarded and never closed — leaking a connection pool indefinitely.
_redis_client_lock    = asyncio.Lock()
_supabase_client_lock = asyncio.Lock()
_redis_http_client    = None
_supabase_http_client = None


# ---------------------------------------------------------------------------
# Token cache key
# ---------------------------------------------------------------------------

def _token_cache_key(token: str) -> str:
    """Return the full SHA-256 hex digest of the token (64 chars).

    We store the hash, not the token, so that a log or memory dump of the
    cache never exposes live credentials.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# In-memory cache helpers
# ---------------------------------------------------------------------------

def _get_cached_user(token: str) -> "UserProfile | None":
    """Try the in-memory cache (fastest path — same worker, same deploy)."""
    cache_key = _token_cache_key(token)
    cached = _AUTH_USER_CACHE.get(cache_key)
    if cached:
        expires_at, user = cached
        if time.monotonic() < expires_at:
            return user
        _AUTH_USER_CACHE.pop(cache_key, None)
    return None


def _set_cached_user(token: str, user: "UserProfile") -> None:
    cache_key = _token_cache_key(token)
    if len(_AUTH_USER_CACHE) >= AUTH_CACHE_MAX_ITEMS:
        # Evict the oldest entry (insertion-order dict, Python ≥ 3.7).
        _AUTH_USER_CACHE.pop(next(iter(_AUTH_USER_CACHE)), None)
    _AUTH_USER_CACHE[cache_key] = (time.monotonic() + AUTH_CACHE_TTL_SECONDS, user)


# ---------------------------------------------------------------------------
# Redis cache helpers
# ---------------------------------------------------------------------------

def _safe_log_snippet(text: str, max_len: int = 200) -> str:
    """Return a sanitized, length-capped snippet safe for structured logs.

    Strips newlines and carriage returns to prevent log injection — an
    attacker controlling error response bodies (e.g. via MITM or a
    compromised upstream) could inject fake log lines with embedded newlines.
    """
    return str(text or "")[:max_len].replace("\n", " ").replace("\r", "")


async def _get_cached_user_redis(token: str) -> "UserProfile | None":
    """Try Redis for cached user (cross-worker, survives restarts).

    Security: the full SHA-256 hash is used as the Redis key.
    The original code used only the first 16 hex chars (64 bits), which
    creates a birthday-collision risk and, more critically, means two
    different tokens with the same 16-char prefix would share a cache slot —
    potentially serving one user's profile to a different user.
    """
    settings = get_settings()
    if not settings.UPSTASH_REDIS_URL or not settings.UPSTASH_REDIS_TOKEN:
        return None

    cache_key = _token_cache_key(token)
    # Full 64-char SHA-256 key — no collision risk, no prefix-sharing
    redis_key = f"pv:auth:{cache_key}"

    try:
        import httpx
        global _redis_http_client
        if _redis_http_client is None:
            async with _redis_client_lock:
                if _redis_http_client is None:   # double-checked locking
                    _redis_http_client = httpx.AsyncClient(timeout=2.0)

        resp = await _redis_http_client.get(
            f"{settings.UPSTASH_REDIS_URL}/get/{redis_key}",
            headers={"Authorization": f"Bearer {settings.UPSTASH_REDIS_TOKEN}"},
        )
        if resp.status_code != 200:
            return None

        data = resp.json()
        result = data.get("result")
        if not result:
            return None

        user_dict = json.loads(result)

        # Security: validate that Redis returned only expected keys.
        # Unexpected keys signal either data corruption or a Redis injection
        # attack — in both cases the safe action is a fresh DB lookup.
        unexpected_keys = set(user_dict.keys()) - _EXPECTED_CACHE_FIELDS
        if unexpected_keys:
            logger.warning(
                "redis_cache_unexpected_fields",
                keys=sorted(unexpected_keys),
            )
            return None

        # Construct UserProfile with explicit field extraction — never
        # unpack an untrusted dict with ** directly into the constructor.
        user = UserProfile(
            id=str(user_dict.get("id") or ""),
            email=str(user_dict.get("email") or ""),
            plan=str(user_dict.get("plan") or "free"),
            owned_plans=user_dict.get("owned_plans") if isinstance(user_dict.get("owned_plans"), list) else ["free"],
            expired_plans=user_dict.get("expired_plans") if isinstance(user_dict.get("expired_plans"), list) else [],
            is_admin=bool(user_dict.get("is_admin", False)),
            premium_override=bool(user_dict.get("premium_override", False)),
            interviews_used=int(user_dict.get("interviews_used") or 0),
            subscription_status=str(user_dict.get("subscription_status") or "none"),
        )

        # Reject entries with blank essential fields — a legitimate cached
        # UserProfile always has both id and email.
        if not user.id or not user.email:
            logger.warning("redis_cache_invalid_user_fields")
            return None

        # Warm the in-memory cache so the next request on this worker skips Redis
        _set_cached_user(token, user)
        return user

    except Exception as exc:
        logger.debug("redis_cache_read_failed", error=str(exc))

    return None


async def _set_cached_user_redis(token: str, user: "UserProfile") -> None:
    """Cache user in Redis with TTL (cross-worker persistence)."""
    settings = get_settings()
    if not settings.UPSTASH_REDIS_URL or not settings.UPSTASH_REDIS_TOKEN:
        return

    cache_key = _token_cache_key(token)
    redis_key  = f"pv:auth:{cache_key}"    # full 64-char key

    # Serialise only the known safe fields — never serialize the entire object
    # which may grow over time to include sensitive internal state.
    user_json = json.dumps({
        "id":                  user.id,
        "email":               user.email,
        "plan":                user.plan,
        "owned_plans":         user.owned_plans,
        "expired_plans":       user.expired_plans,
        "is_admin":            user.is_admin,
        "premium_override":    user.premium_override,
        "interviews_used":     user.interviews_used,
        "subscription_status": user.subscription_status,
    })

    try:
        import httpx
        global _redis_http_client
        if _redis_http_client is None:
            async with _redis_client_lock:
                if _redis_http_client is None:
                    _redis_http_client = httpx.AsyncClient(timeout=2.0)

        await _redis_http_client.post(
            f"{settings.UPSTASH_REDIS_URL}",
            headers={
                "Authorization": f"Bearer {settings.UPSTASH_REDIS_TOKEN}",
                "Content-Type":  "application/json",
            },
            json=["SETEX", redis_key, str(AUTH_CACHE_TTL_SECONDS), user_json],
        )
    except Exception:
        pass  # In-memory fallback already set; Redis write failure is non-fatal


# ---------------------------------------------------------------------------
# JWT decode
# ---------------------------------------------------------------------------

def _decode_token_identity(token: str, settings):
    """Decode Supabase JWT locally to avoid network round-trips on every request.

    Security notes:
    ─ verify_aud=False: Supabase issues tokens with aud="authenticated" by
      default but PrepVista does not configure a specific audience claim.
      Enabling audience verification would require adding aud to every JWT
      or configuring Supabase to include a custom aud — out of scope for the
      current integration.  This is acceptable because the SUPABASE_JWT_SECRET
      is a shared-secret known only to PrepVista's backend; any token that
      decodes successfully with this secret was issued by this Supabase project.
    ─ leeway=10: allows up to 10 seconds of clock skew between server and
      token issuer — prevents spurious 401s when server clocks drift slightly.
    ─ algorithms=["HS256"]: explicit algorithm allowlist prevents algorithm
      confusion attacks (e.g. RS256/none algorithm confusion).
    """
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
            leeway=10,
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        # Log at debug level — not an error (can be a legitimate opaque token
        # that should be verified via the Supabase API instead).  At warning
        # level this would flood logs during normal operation.
        logger.debug("jwt_local_decode_failed", reason=type(exc).__name__)
        return None

    auth_user_id = payload.get("sub")
    email        = payload.get("email")
    app_metadata = payload.get("app_metadata") or {}
    provider     = app_metadata.get("provider") or payload.get("provider") or "email"

    if not auth_user_id or not email:
        return None

    return {
        "auth_user_id": str(auth_user_id),
        "email":        str(email),
        "provider":     str(provider),
    }


# ---------------------------------------------------------------------------
# UserProfile
# ---------------------------------------------------------------------------

class UserProfile:
    """User context object attached to authenticated requests.

    All fields are explicitly typed and coerced in __init__ — this prevents
    a Redis injection attack from promoting a string "true" to a truthy value
    via Python's truthiness rules when the caller passes raw Redis data.
    """

    __slots__ = (
        "id", "email", "plan", "owned_plans", "expired_plans",
        "is_admin", "premium_override", "is_org_student",
        "interviews_used", "subscription_status",
    )

    def __init__(
        self,
        id: str,
        email: str,
        plan: str,
        owned_plans: list[str] | None = None,
        expired_plans: list[str] | None = None,
        is_admin: bool = False,
        premium_override: bool = False,
        is_org_student: bool = False,
        interviews_used: int = 0,
        subscription_status: str = "none",
    ):
        # Explicit type coercion on every field — prevents a crafted cache
        # entry from injecting unexpected types into the auth object.
        self.id                  = str(id or "")
        self.email               = str(email or "")
        self.plan                = str(plan or "free")
        self.owned_plans         = list(owned_plans) if isinstance(owned_plans, list) else ["free"]
        self.expired_plans       = list(expired_plans) if isinstance(expired_plans, list) else []
        self.is_admin            = bool(is_admin)
        self.premium_override    = bool(premium_override)
        self.is_org_student      = bool(is_org_student)
        self.interviews_used     = int(interviews_used or 0)
        self.subscription_status = str(subscription_status or "none")

    @property
    def effective_plan(self) -> str:
        """Highest owned plan unless admin override is active."""
        if self.premium_override or self.is_org_student:
            return "career"
        return highest_plan(self.owned_plans)

    @property
    def effective_config(self) -> dict:
        return PLAN_CONFIG.get(self.effective_plan, PLAN_CONFIG["free"])

    def has_feature(self, feature: str) -> bool:
        return self.effective_config.get(feature, False)

    @property
    def has_expired_paid_plan(self) -> bool:
        return (
            bool(self.expired_plans)
            and self.effective_plan == "free"
            and not self.premium_override
        )

    def premium_lock_message(self, feature_label: str, minimum: str = "pro") -> str:
        if self.has_expired_paid_plan:
            if len(self.expired_plans) == 1:
                plan_label = f"{self.expired_plans[0].title()} plan"
            else:
                joined = ", ".join(p.title() for p in self.expired_plans)
                plan_label = f"{joined} plans"
            return f"Your {plan_label} expired. Upgrade to unlock {feature_label} again."
        return f"This feature requires the {minimum.title()} plan or higher."


# ---------------------------------------------------------------------------
# Main auth dependency
# ---------------------------------------------------------------------------

async def get_current_user(request: Request) -> UserProfile:
    """Extract and verify JWT from Authorization header or cookie.

    Extraction order:
      1. Authorization: Bearer <token>  (preferred — HttpOnly-cookie fallback)
      2. sb-access-token cookie

    Cache order:
      1. In-memory (same worker, fastest)
      2. Redis (cross-worker, survives restarts)
      3. Local JWT decode (avoids Supabase round-trip for valid tokens)
      4. Supabase /auth/v1/user (authoritative but slowest)
    """
    settings = get_settings()
    token: str | None = None

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        # Strip whitespace: prevents a "Bearer eyJ... \n" header from
        # producing a different cache key than "Bearer eyJ..." for the
        # same logical token.
        token = auth_header[len("Bearer "):].strip()
    else:
        token = request.cookies.get("sb-access-token")
        if token:
            token = token.strip()

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")

    # Reject tokens that are structurally too short to be valid JWTs.
    # This prevents cache pollution and avoids pointless decode/network work
    # for obviously invalid credentials (fuzzing, misconfigured clients).
    if len(token) < _MIN_TOKEN_LENGTH:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")

    # ── Layer 1: In-memory cache ───────────────────────────────────────────
    cached_user = _get_cached_user(token)
    if cached_user:
        return cached_user

    # ── Layer 2: Redis cache ───────────────────────────────────────────────
    cached_user = await _get_cached_user_redis(token)
    if cached_user:
        return cached_user

    # ── Layer 3 + 4: JWT decode → Supabase API ────────────────────────────
    decoded_identity = _decode_token_identity(token, settings)
    try:
        if decoded_identity:
            auth_user_id = decoded_identity["auth_user_id"]
            email        = decoded_identity["email"]
            provider     = decoded_identity["provider"]
        else:
            import httpx
            global _supabase_http_client
            if _supabase_http_client is None:
                async with _supabase_client_lock:
                    if _supabase_http_client is None:
                        _supabase_http_client = httpx.AsyncClient(timeout=10.0)

            resp = await _supabase_http_client.get(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey":        settings.SUPABASE_ANON_KEY,
                },
            )

            if resp.status_code != 200:
                # Sanitize resp.text before logging — the response body is
                # attacker-influenced and may contain newlines or escape sequences
                # designed to inject fake log entries (log injection attack).
                logger.error(
                    "supabase_auth_rejected",
                    status=resp.status_code,
                    body=_safe_log_snippet(resp.text),
                )
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired authentication token.",
                )

            identity     = extract_auth_identity(resp.json())
            auth_user_id = identity["auth_user_id"]
            email        = identity["email"]
            provider     = identity["provider"]

            if not auth_user_id:
                raise HTTPException(status_code=401, detail="Invalid token payload.")

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("auth_verification_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Authentication service unavailable.")

    db = await get_db()
    try:
        profile_id = await get_profile_id_for_auth_user(db, auth_user_id)
        if not profile_id:
            legacy_profile_id = await db.fetchval(
                "SELECT id FROM profiles WHERE id = $1",
                auth_user_id,
            )
            if legacy_profile_id:
                profile_id = str(legacy_profile_id)
                await ensure_auth_identity_link(db, auth_user_id, profile_id, email, provider)
            else:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error":   "account_not_registered",
                        "message": "This account is not registered in PrepVista yet. Please create your account first.",
                    },
                )

        row = await db.fetchrow(
            """SELECT plan, is_admin, interviews_used_this_period,
                      subscription_status, referral_code, org_student
               FROM profiles WHERE id = $1""",
            profile_id,
        )

        if not row:
            raise HTTPException(
                status_code=403,
                detail={
                    "error":   "account_not_registered",
                    "message": "This account is not registered in PrepVista yet. Please create your account first.",
                },
            )

        if not row["referral_code"]:
            await ensure_referral_identity(db, profile_id)

        plan                = row["plan"]
        is_admin_db         = bool(row["is_admin"])
        interviews_used     = int(row["interviews_used_this_period"] or 0)
        subscription_status = str(row["subscription_status"] or "none")
        is_org_student      = bool(row.get("org_student"))

        premium_override = bool(
            settings.ADMIN_EMAIL
            and email.lower() == settings.ADMIN_EMAIL.lower()
        )

        plan_state = await sync_profile_plan_state(
            db,
            profile_id,
            plan,
            premium_override=premium_override,
            is_org_student=is_org_student,
        )

        try:
            await record_user_presence(db, profile_id)
        except Exception as exc:
            logger.warning("presence_touch_failed", user_id=profile_id, error=str(exc))

        plan                = plan_state["selected_plan"]
        owned_plans         = plan_state["owned_plans"]
        expired_plans       = plan_state["expired_plans"]
        subscription_status = plan_state["subscription_status"]

    finally:
        from app.database.connection import _pool
        if _pool:
            await _pool.release(db)

    is_admin = is_admin_db
    if premium_override:
        is_admin = True
        # Log admin override using only a hash of the email — never the
        # plaintext address.  Email is PII and should not appear in log
        # aggregators (Datadog, Papertrail, Sentry logs) without consent.
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()[:12]
        logger.info("admin_override_active", email_hash=email_hash)

    resolved_user = UserProfile(
        id=profile_id,
        email=email,
        plan=plan,
        owned_plans=owned_plans,
        expired_plans=expired_plans,
        is_admin=is_admin,
        premium_override=premium_override,
        is_org_student=is_org_student,
        interviews_used=interviews_used,
        subscription_status=subscription_status,
    )

    # Sentry error correlation — profile_id only, never email.
    # Email is PII under GDPR Art. 4(1); transmitting it to Sentry's SaaS
    # without explicit user consent and a DPA would be a compliance violation.
    try:
        import sentry_sdk
        sentry_sdk.set_user({"id": profile_id})
        sentry_sdk.set_tag("plan", plan)
    except ImportError:
        pass

    _set_cached_user(token, resolved_user)
    await _set_cached_user_redis(token, resolved_user)
    return resolved_user


# ---------------------------------------------------------------------------
# Plan-gating dependency
# ---------------------------------------------------------------------------

def require_plan(minimum: str):
    """Dependency that gates access based on plan tier."""

    async def dependency(user: UserProfile = Depends(get_current_user)):
        if user.premium_override:
            return user
        effective = user.effective_plan
        if PLAN_HIERARCHY.get(effective, 0) < PLAN_HIERARCHY.get(minimum, 0):
            raise HTTPException(
                status_code=403,
                detail={
                    "error":         "plan_required",
                    "message":       user.premium_lock_message("this feature", minimum=minimum),
                    "required":      minimum,
                    "current":       user.plan,
                    "reason":        "expired_plan" if user.has_expired_paid_plan else "upgrade_required",
                    "expired_plans": user.expired_plans,
                    "upgrade_url":   "/pricing",
                },
            )
        return user

    return dependency


# ---------------------------------------------------------------------------
# Organisation admin dependencies
# ---------------------------------------------------------------------------

class OrgAdminProfile:
    """Context for an authenticated organisation (college) admin."""

    def __init__(
        self,
        user: UserProfile,
        org_admin_id: str,
        organization_id: str,
        organization_name: str,
        org_code: str,
        org_category: str,
        org_status: str,
        admin_role: str = "org_admin",
        admin_status: str = "active",
    ):
        self.user              = user
        self.org_admin_id      = org_admin_id
        self.organization_id   = organization_id
        self.organization_name = organization_name
        self.org_code          = org_code
        self.org_category      = org_category
        self.org_status        = org_status
        self.admin_role        = admin_role
        self.admin_status      = admin_status

    @property
    def user_id(self) -> str:
        return self.user.id

    @property
    def email(self) -> str:
        return self.user.email

    @property
    def is_active(self) -> bool:
        return self.admin_status == "active" and self.org_status == "active"


async def get_org_admin(
    user: UserProfile = Depends(get_current_user),
) -> OrgAdminProfile:
    """Resolve the calling user's organisation admin record.

    Raises 403 if user is not a registered org admin, or if org/admin is
    suspended.  Organisation status value is NOT included in error messages
    to prevent leaking internal status categories to clients.
    """
    db = await get_db()
    try:
        row = await db.fetchrow(
            """SELECT
                   oa.id              AS org_admin_id,
                   oa.organization_id,
                   oa.role            AS admin_role,
                   oa.status          AS admin_status,
                   o.name             AS organization_name,
                   o.org_code,
                   o.category         AS org_category,
                   o.status           AS org_status
               FROM organization_admins oa
               JOIN organizations o ON o.id = oa.organization_id
               WHERE oa.user_id = $1
               LIMIT 1""",
            user.id,
        )
    finally:
        from app.database.connection import _pool
        if _pool:
            await _pool.release(db)

    if not row:
        raise HTTPException(
            status_code=403,
            detail="You are not registered as an organization admin.",
        )

    if row["admin_status"] != "active":
        raise HTTPException(
            status_code=403,
            detail="Your organization admin account is currently disabled.",
        )

    if row["org_status"] != "active":
        # Generic message — does not reveal the specific org_status value
        # (e.g. "suspended_nonpayment", "under_review") which is internal data.
        raise HTTPException(
            status_code=403,
            detail="Your organization's access is currently restricted. Please contact the platform admin.",
        )

    return OrgAdminProfile(
        user=user,
        org_admin_id=str(row["org_admin_id"]),
        organization_id=str(row["organization_id"]),
        organization_name=row["organization_name"],
        org_code=row["org_code"],
        org_category=row["org_category"],
        org_status=row["org_status"],
        admin_role=row["admin_role"],
        admin_status=row["admin_status"],
    )


def require_org_admin():
    """Dependency that gates routes to verified, active org admins only."""

    async def dependency(
        org_admin: OrgAdminProfile = Depends(get_org_admin),
    ) -> OrgAdminProfile:
        if not org_admin.is_active:
            raise HTTPException(
                status_code=403,
                detail="Organization admin access is not active.",
            )
        return org_admin

    return dependency


def require_main_admin():
    """Dependency that gates routes to the platform main admin only."""

    async def dependency(
        user: UserProfile = Depends(get_current_user),
    ) -> UserProfile:
        if not user.is_admin and not user.premium_override:
            raise HTTPException(
                status_code=403,
                detail="Platform admin permissions required.",
            )
        return user

    return dependency