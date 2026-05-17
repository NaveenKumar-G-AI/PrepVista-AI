"""
PrepVista AI — Auth Router
Handles signup, login, and token refresh via Supabase Auth.
"""

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.services.auth_identity import (
    ensure_auth_identity_link,
    extract_auth_identity,
    get_profile_id_for_auth_user,
)
from app.services.email_validation import validate_deliverable_email_address
from app.services.funnel_tracking import track_funnel_event
from app.services.launch_offer import queue_launch_offer_if_eligible
from app.services.manual_signup_verification import (
    issue_signup_verification_code,
    verify_signup_code,
    clear_signup_verification_code,
    send_admin_new_user_notification,
)
from app.services.plan_access import sync_profile_plan_state
from app.services.public_growth import refresh_public_growth_metrics
from app.services.referrals import apply_joined_referral_reward, ensure_referral_identity

router = APIRouter()
logger = structlog.get_logger("prepvista.auth")

# Persistent httpx client for Supabase API calls (avoids TCP+TLS handshake per request)
_supabase_client: httpx.AsyncClient | None = None


def _get_supabase_client() -> httpx.AsyncClient:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = httpx.AsyncClient(timeout=15.0)
    return _supabase_client


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    verification_code: str


class SignupCodeRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccountStatusRequest(BaseModel):
    email: EmailStr


class OnboardingRequest(BaseModel):
    prep_goal: str = ""
    full_name: str = ""


def _is_admin_email(email: str, settings=None) -> bool:
    """Return True when the given email matches the configured admin email."""
    settings = settings or get_settings()
    return bool(settings.ADMIN_EMAIL and email.lower() == settings.ADMIN_EMAIL.lower())


async def _find_profile_by_email(email: str):
    async with DatabaseConnection() as conn:
        return await conn.fetchrow(
            """SELECT id, email
               FROM profiles
               WHERE LOWER(email) = LOWER($1)""",
            email,
        )


def _require_deliverable_signup_email(email: str) -> str:
    """Reject manual signups that use a syntactically valid but undeliverable email."""
    try:
        return validate_deliverable_email_address(email, check_deliverability=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "invalid_email",
                "message": str(exc),
            },
        ) from exc


async def _delete_supabase_auth_user(user_id: str) -> None:
    """Delete a Supabase auth user with the service role key."""
    settings = get_settings()
    client = _get_supabase_client()
    resp = await client.delete(
        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": settings.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        },
    )

    if resp.status_code == 404:
        return

    if resp.status_code >= 400:
        try:
            data = resp.json()
        except Exception:
            data = {}
        detail = (
            data.get("msg")
            or data.get("message")
            or data.get("error_description")
            or resp.text
            or "Supabase auth user cleanup failed."
        )
        raise RuntimeError(detail)


async def _get_supabase_identity(request: Request) -> dict[str, str]:
    """Resolve the authenticated Supabase user from the bearer token."""
    import httpx

    settings = get_settings()
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split("Bearer ")[1]
    else:
        token = request.cookies.get("sb-access-token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in.")

    client = _get_supabase_client()
    resp = await client.get(
        f"{settings.SUPABASE_URL}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": settings.SUPABASE_ANON_KEY,
        },
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")

    identity = extract_auth_identity(resp.json())
    if not identity["auth_user_id"] or not identity["email"]:
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    return identity


@router.post("/account-status")
async def account_status(req: AccountStatusRequest):
    """Check whether a PrepVista profile already exists for an email address."""
    if _is_admin_email(req.email):
        return {"exists": False, "is_admin_email": True}
    profile = await _find_profile_by_email(req.email)
    return {"exists": bool(profile), "is_admin_email": False}


@router.post("/signup/request-code")
async def request_signup_code(req: SignupCodeRequest):
    """Send a one-time manual signup verification code to the provided email."""
    signup_email = _require_deliverable_signup_email(str(req.email))
    settings = get_settings()
    is_admin_email = _is_admin_email(signup_email, settings)

    try:
        existing_profile = await _find_profile_by_email(signup_email)
        if existing_profile and not is_admin_email:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "account_exists",
                    "message": "This email is already registered. Please sign in instead.",
                },
            )

        async with DatabaseConnection() as conn:
            try:
                result = await issue_signup_verification_code(conn, signup_email)
            except ValueError as exc:
                message = str(exc)
                status_code = 429 if "Please wait" in message else 400
                error_code = "verification_code_rate_limited" if status_code == 429 else "verification_code_request_failed"
                raise HTTPException(
                    status_code=status_code,
                    detail={
                        "error": error_code,
                        "message": message,
                    },
                ) from exc
            except RuntimeError as exc:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "error": "verification_email_unavailable",
                        "message": str(exc),
                    },
                ) from exc

        return {
            "status": "ok",
            "message": "Verification code sent. Enter it below to finish creating your account.",
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("signup_code_request_error", error=str(e))
        raise HTTPException(status_code=500, detail="Verification code could not be sent.")


@router.post("/signup")
async def signup(req: SignupRequest):
    """Complete manual signup only after the email verification code is confirmed."""
    import httpx
    settings = get_settings()
    signup_email = _require_deliverable_signup_email(str(req.email))
    is_admin_email = _is_admin_email(signup_email, settings)

    try:
        existing_profile = await _find_profile_by_email(signup_email)
        if existing_profile and not is_admin_email:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "account_exists",
                    "message": "This email is already registered. Please sign in instead.",
                },
            )

        async with DatabaseConnection() as conn:
            try:
                await verify_signup_code(conn, signup_email, req.verification_code)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "verification_code_invalid",
                        "message": str(exc),
                    },
                ) from exc

        client = _get_supabase_client()
        resp = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/signup",
            json={"email": signup_email, "password": req.password},
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
        )
        data = resp.json()

        if resp.status_code >= 400:
            detail = data.get("msg") or data.get("message") or data.get("error_description") or "Signup failed."
            raise HTTPException(status_code=resp.status_code, detail=detail)

        user = data.get("user", {})
        user_id = user.get("id")

        if user_id:
            try:
                async with DatabaseConnection() as conn:
                    async with conn.transaction():
                        await conn.execute(
                            """INSERT INTO profiles (id, email, full_name, plan, subscription_status, is_admin)
                               VALUES ($1, $2, $3, 'free', $4, $5)
                               ON CONFLICT (id) DO UPDATE SET
                                   email = EXCLUDED.email,
                                   full_name = EXCLUDED.full_name,
                                   subscription_status = EXCLUDED.subscription_status,
                                   is_admin = profiles.is_admin OR EXCLUDED.is_admin,
                                   updated_at = NOW()""",
                            user_id,
                            signup_email,
                            req.full_name,
                            "active" if is_admin_email else "none",
                            is_admin_email,
                        )
                        await ensure_auth_identity_link(
                            conn,
                            user_id,
                            user_id,
                            signup_email,
                            "email",
                        )
                        launch_offer_grant = await queue_launch_offer_if_eligible(
                            conn,
                            user_id,
                            signup_email,
                            is_admin=is_admin_email,
                        )
                        await ensure_referral_identity(conn, user_id)
                        await apply_joined_referral_reward(conn, user_id, signup_email)
                        await sync_profile_plan_state(
                            conn,
                            user_id,
                            (
                                "pro"
                                if launch_offer_grant
                                and launch_offer_grant.get("status") == "approved"
                                and launch_offer_grant.get("plan") == "pro"
                                else "free"
                            ),
                            premium_override=is_admin_email,
                        )
                        try:
                            await track_funnel_event(
                                conn,
                                "signup completed",
                                user_id=user_id,
                                metadata={"method": "email_password"},
                            )
                        except Exception as exc:
                            logger.warning("funnel_tracking_signup_failed", user_id=user_id, error=str(exc))
                        await clear_signup_verification_code(conn, signup_email)
                        await refresh_public_growth_metrics(conn)
            except Exception:
                await _delete_supabase_auth_user(user_id)
                raise
            await send_admin_new_user_notification(
                signup_email,
                user_name=req.full_name,
                source="manual_signup",
            )

        return {
            "user": {"id": user_id, "email": signup_email},
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("signup_error", error=str(e))
        raise HTTPException(status_code=500, detail="Signup service unavailable.")


@router.post("/login")
async def login(req: LoginRequest):
    """Authenticate user via Supabase Auth."""
    import httpx
    settings = get_settings()
    is_admin_email = _is_admin_email(req.email, settings)

    try:
        existing_profile = await _find_profile_by_email(req.email)
        if not existing_profile and not is_admin_email:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "new_user",
                    "message": "This looks like a new user. Create your account first.",
                },
            )

        client = _get_supabase_client()
        resp = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": req.email, "password": req.password},
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
        )
        data = resp.json()

        if resp.status_code >= 400:
            detail = data.get("error_description") or data.get("msg") or "Invalid credentials."
            raise HTTPException(status_code=401, detail=detail)

        user = data.get("user", {})
        user_id = user.get("id")

        # Ensure profile exists
        if user_id:
            created_profile_id = None
            canonical_profile_id = str(existing_profile["id"]) if existing_profile else user_id
            async with DatabaseConnection() as conn:
                async with conn.transaction():
                    if existing_profile:
                        await conn.execute(
                            """UPDATE profiles
                               SET email = $2,
                                   subscription_status = CASE WHEN $3 THEN 'active' ELSE subscription_status END,
                                   is_admin = CASE WHEN $3 THEN TRUE ELSE is_admin END,
                                   updated_at = NOW()
                               WHERE id = $1""",
                            canonical_profile_id,
                            req.email,
                            is_admin_email,
                        )
                    else:
                        created_profile_id = await conn.fetchval(
                            """INSERT INTO profiles (id, email, plan, subscription_status, is_admin)
                               VALUES ($1, $2, 'free', $3, $4)
                               ON CONFLICT (id) DO NOTHING
                               RETURNING id""",
                            user_id,
                            req.email,
                            "active" if is_admin_email else "none",
                            is_admin_email,
                        )
                        canonical_profile_id = str(created_profile_id) if created_profile_id else user_id

                    await ensure_auth_identity_link(
                        conn,
                        user_id,
                        canonical_profile_id,
                        req.email,
                        "email",
                    )
                    if is_admin_email:
                        await conn.execute(
                            """UPDATE profiles
                               SET is_admin = TRUE,
                                   subscription_status = 'active',
                                   updated_at = NOW()
                                WHERE id = $1""",
                            canonical_profile_id,
                        )
                    await ensure_referral_identity(conn, canonical_profile_id)
                    selected_plan = None
                    if created_profile_id:
                        launch_offer_grant = await queue_launch_offer_if_eligible(
                            conn,
                            canonical_profile_id,
                            req.email,
                            is_admin=is_admin_email,
                        )
                        selected_plan = (
                            "pro"
                            if launch_offer_grant
                            and launch_offer_grant.get("status") == "approved"
                            and launch_offer_grant.get("plan") == "pro"
                            else "free"
                        )
                        await apply_joined_referral_reward(conn, canonical_profile_id, req.email)
                        await refresh_public_growth_metrics(conn)
                        try:
                            await track_funnel_event(
                                conn,
                                "signup completed",
                                user_id=canonical_profile_id,
                                metadata={"method": "email_password"},
                            )
                        except Exception as exc:
                            logger.warning("funnel_tracking_signup_failed", user_id=canonical_profile_id, error=str(exc))
                    await sync_profile_plan_state(
                        conn,
                        canonical_profile_id,
                        selected_plan,
                        premium_override=is_admin_email,
                    )
            if created_profile_id:
                await send_admin_new_user_notification(
                    req.email,
                    source="first_password_login",
                )

        return {
            "user": {"id": user_id, "email": req.email},
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("login_error", error=str(e))
        raise HTTPException(status_code=500, detail="Login service unavailable.")


@router.post("/oauth/complete")
async def complete_oauth_login(request: Request):
    """Complete Google OAuth for both new and existing users."""
    identity = await _get_supabase_identity(request)
    auth_user_id = identity["auth_user_id"]
    email = identity["email"]
    full_name = identity["full_name"]
    avatar_url = identity["avatar_url"]
    provider = identity["provider"] or "google"
    settings = get_settings()
    is_admin_email = _is_admin_email(email, settings)
    profile_created = False
    canonical_profile_id = auth_user_id

    async with DatabaseConnection() as conn:
        async with conn.transaction():
            canonical_profile_id = await get_profile_id_for_auth_user(conn, auth_user_id) or auth_user_id

            profile = await conn.fetchrow(
                "SELECT id, referral_code FROM profiles WHERE id = $1",
                canonical_profile_id,
            )

            if not profile:
                profile = await conn.fetchrow(
                    "SELECT id, referral_code FROM profiles WHERE id = $1",
                    auth_user_id,
                )
                if profile:
                    canonical_profile_id = str(profile["id"])

            if not profile:
                profile = await conn.fetchrow(
                    """SELECT id, referral_code
                       FROM profiles
                       WHERE LOWER(email) = LOWER($1)""",
                    email,
                )
                if profile:
                    canonical_profile_id = str(profile["id"])

            if not profile:
                profile_created = True
                canonical_profile_id = auth_user_id
                await conn.execute(
                    """INSERT INTO profiles (id, email, full_name, avatar_url, plan, subscription_status, is_admin)
                       VALUES ($1, $2, $3, $4, 'free', $5, $6)""",
                    canonical_profile_id,
                    email,
                    full_name or None,
                    avatar_url or None,
                    "active" if is_admin_email else "none",
                    is_admin_email,
                )
                profile = {"id": canonical_profile_id, "referral_code": None}
            else:
                await conn.execute(
                    """UPDATE profiles
                       SET email = $2,
                           full_name = CASE
                               WHEN COALESCE(NULLIF(full_name, ''), '') = '' THEN COALESCE($3, full_name)
                               ELSE full_name
                           END,
                           avatar_url = COALESCE($4, avatar_url),
                           subscription_status = CASE WHEN $5 THEN 'active' ELSE subscription_status END,
                           is_admin = CASE WHEN $5 THEN TRUE ELSE is_admin END,
                           updated_at = NOW()
                       WHERE id = $1""",
                    canonical_profile_id,
                    email,
                    full_name or None,
                    avatar_url or None,
                    is_admin_email,
                )

            await ensure_auth_identity_link(
                conn,
                auth_user_id,
                canonical_profile_id,
                email,
                provider,
            )

            if not profile["referral_code"]:
                await ensure_referral_identity(conn, canonical_profile_id)

            selected_plan = None
            if profile_created:
                launch_offer_grant = await queue_launch_offer_if_eligible(
                    conn,
                    canonical_profile_id,
                    email,
                    is_admin=is_admin_email,
                )
                await apply_joined_referral_reward(conn, canonical_profile_id, email)
                await refresh_public_growth_metrics(conn)
                try:
                    await track_funnel_event(
                        conn,
                        "signup completed",
                        user_id=canonical_profile_id,
                        metadata={"method": provider or "google"},
                    )
                except Exception as exc:
                    logger.warning("funnel_tracking_signup_failed", user_id=canonical_profile_id, error=str(exc))
                selected_plan = (
                    "pro"
                    if launch_offer_grant
                    and launch_offer_grant.get("status") == "approved"
                    and launch_offer_grant.get("plan") == "pro"
                    else "free"
                )

            await sync_profile_plan_state(
                conn,
                canonical_profile_id,
                selected_plan,
                premium_override=is_admin_email,
            )

    if profile_created:
        await send_admin_new_user_notification(
            email,
            user_name=full_name,
            source="google_oauth_signup",
        )

    return {
        "status": "ok",
        "message": "OAuth login verified.",
        "profile_id": canonical_profile_id,
    }


@router.post("/refresh")
async def refresh_token(request: Request):
    """Refresh an expired access token."""
    settings = get_settings()

    # Guard against oversized payloads (DoS prevention)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 8192:
        raise HTTPException(status_code=413, detail="Request body too large.")

    body = await request.json()
    refresh = body.get("refresh_token")
    if not refresh:
        raise HTTPException(status_code=400, detail="refresh_token is required.")

    try:
        client = _get_supabase_client()
        resp = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            json={"refresh_token": refresh},
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
        )
        data = resp.json()

        if resp.status_code >= 400:
            raise HTTPException(status_code=401, detail="Token refresh failed. Please log in again.")

        return {
            "access_token": data.get("access_token"),
            "refresh_token": data.get("refresh_token"),
            "expires_in": data.get("expires_in"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("refresh_error", error=str(e))
        raise HTTPException(status_code=500, detail="Auth service unavailable.")


@router.post("/onboarding")
async def complete_onboarding(req: OnboardingRequest, request: Request):
    """Complete the onboarding wizard."""
    from app.dependencies import get_current_user
    user = await get_current_user(request)

    async with DatabaseConnection() as conn:
        await conn.execute(
            """UPDATE profiles
               SET onboarding_completed = TRUE, prep_goal = $2, full_name = COALESCE(NULLIF($3, ''), full_name)
               WHERE id = $1""",
            user.id, req.prep_goal, req.full_name,
        )

    return {"status": "ok", "message": "Onboarding complete."}


@router.get("/me")
async def get_me(request: Request):
    """Get current user profile."""
    from app.dependencies import get_current_user
    user = await get_current_user(request)

    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT full_name, email, plan, subscription_status, onboarding_completed,
                      prep_goal, interviews_used_this_period, theme_preference, created_at,
                      is_org_admin, org_student, organization_id
               FROM profiles WHERE id = $1""",
            user.id,
        )

    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")

    from app.services.quota import get_usage_stats
    usage = await get_usage_stats(user.id, premium_override=user.premium_override)

    return {
        "id": user.id,
        "full_name": row["full_name"],
        "email": row["email"],
        "plan": row["plan"],
        "active_plan": row["plan"],
        "owned_plans": user.owned_plans,
        "expired_plans": user.expired_plans,
        "highest_owned_plan": user.effective_plan,
        "effective_plan": user.effective_plan,
        "is_admin": user.is_admin,
        "is_org_admin": bool(row.get("is_org_admin")),
        "org_student": bool(row.get("org_student")),
        "organization_id": str(row["organization_id"]) if row.get("organization_id") else None,
        "premium_override": user.premium_override,
        "subscription_status": row["subscription_status"] or "none",
        "onboarding_completed": row["onboarding_completed"],
        "prep_goal": row["prep_goal"],
        "theme_preference": row["theme_preference"] or "system",
        "usage": usage,
        "created_at": str(row["created_at"]),
    }
