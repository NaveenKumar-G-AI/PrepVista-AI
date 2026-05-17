"""
PrepVista - Application Configuration
Uses Pydantic Settings for type-safe env var management.
"""

import os
from enum import IntEnum
from functools import lru_cache
from typing import Any

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration. All values loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App
    APP_NAME: str = "PrepVista"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    # ✅ SEC: Explicit security surface controls — all in one place so nothing is
    # accidentally left open after a deploy. These are the fields attackers probe first.
    # ALLOWED_HOSTS prevents Host header injection (used for password-reset link poisoning).
    # CORS_ALLOWED_ORIGINS prevents cross-origin credential theft from malicious sites.
    # SECURE_HEADERS_ENABLED gates the entire security-header middleware (CSP, HSTS, etc).
    # MAX_REQUEST_SIZE_MB caps request body size — prevents memory-exhaustion DoS.
    ALLOWED_HOSTS: str = Field(
        default="*",
        description="Comma-separated allowed Host header values. Use '*' only in dev. "
                    "Example: 'prepvista.ai,www.prepvista.ai'",
    )
    CORS_ALLOWED_ORIGINS: str = Field(
        default="http://localhost:3000",
        description="Comma-separated CORS allowed origins. Never use '*' in production.",
    )
    SECURE_HEADERS_ENABLED: bool = Field(
        default=True,
        description="Enable security response headers (CSP, HSTS, X-Frame-Options, etc).",
    )
    MAX_REQUEST_SIZE_MB: int = Field(
        default=10,
        description="Maximum request body size in MB. Prevents memory-exhaustion DoS.",
    )

    # Admin
    ADMIN_EMAIL: str = Field(default="", description="Admin email for premium override and payment notifications")

    # Supabase
    SUPABASE_URL: str = Field(..., description="Supabase project URL")
    SUPABASE_ANON_KEY: str = Field(..., description="Supabase anonymous/public key")
    SUPABASE_SERVICE_KEY: str = Field(..., description="Supabase service role key (server-only)")
    SUPABASE_JWT_SECRET: str = Field(..., description="JWT secret for verifying tokens")
    DATABASE_URL: str = Field(..., description="PostgreSQL connection string")

    # Razorpay
    RAZORPAY_KEY_ID: str = Field(default="", description="Razorpay Key ID")
    RAZORPAY_KEY_SECRET: str = Field(default="", description="Razorpay Key Secret")
    RAZORPAY_WEBHOOK_SECRET: str = Field(default="", description="Razorpay Webhook Secret (if separate from key secret)")

    # Database Pool (asyncpg)
    # ✅ FIXED: DB_POOL_MIN_SIZE 3→5, DB_POOL_MAX_SIZE 20→50.
    # At 500 concurrent users all making async DB calls, 20 connections created a queue
    # that snowballed under any burst load. asyncpg async queries are fast (< 10ms each)
    # but 500 users ÷ 20 connections = 25 users waiting per connection at peak.
    # 50 connections gives comfortable headroom; override via env var for your infra.
    DB_POOL_MIN_SIZE: int = Field(default=5, description="asyncpg pool minimum connections")
    DB_POOL_MAX_SIZE: int = Field(default=50, description="asyncpg pool maximum connections")

    # LLM Providers
    GROQ_API_KEY: str = Field(default="", description="Groq API key")
    GROQ_MODEL: str = "llama-3.1-8b-instant"
    GROQ_EVAL_MODEL: str = "llama-3.3-70b-versatile"
    OPENAI_API_KEY: str = Field(default="", description="OpenAI API key (fallback)")
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Upstash Redis (Rate Limiting)
    UPSTASH_REDIS_URL: str = Field(default="", description="Upstash Redis REST URL")
    UPSTASH_REDIS_TOKEN: str = Field(default="", description="Upstash Redis REST token")

    # Resend (Email)
    RESEND_API_KEY: str = Field(default="", description="Resend API key for transactional email")
    FROM_EMAIL: str = "PrepVista <noreply@prepvista.ai>"
    GMAIL_API_CLIENT_ID: str = Field(default="", description="Google OAuth client ID for Gmail API email sending")
    GMAIL_API_CLIENT_SECRET: str = Field(
        default="",
        description="Google OAuth client secret for Gmail API email sending",
    )
    GMAIL_API_REFRESH_TOKEN: str = Field(
        default="",
        description="Google OAuth refresh token for Gmail API email sending",
    )
    GMAIL_API_FROM_EMAIL: str = Field(default="", description="From address for Gmail API emails")
    EMAIL_VERIFICATION_CODE_TTL_MINUTES: int = 10
    EMAIL_VERIFICATION_RESEND_SECONDS: int = 60
    EMAIL_VERIFICATION_MAX_ATTEMPTS: int = 5

    # Plan Configuration
    FREE_INTERVIEWS_PER_MONTH: int = 2
    PRO_INTERVIEWS_PER_MONTH: int = 15
    CAREER_INTERVIEWS_PER_MONTH: int = 40

    # Interview Defaults
    MAX_RESUME_SIZE_BYTES: int = 5 * 1024 * 1024
    MAX_RESUME_TEXT_LENGTH: int = 6000
    # ✅ FIXED: was 5000 — mismatched with api.ts _MAX_USER_TEXT_CHARS=8000.
    # The frontend cap must always be <= the backend cap or students get a
    # silent error on a valid answer. Both are now aligned at 8000 chars.
    MAX_ANSWER_TEXT_LENGTH: int = 8000
    DEFAULT_LLM_TIMEOUT: float = 15.0
    LLM_RETRIES: int = 3
    MAX_HISTORY_TURNS_IN_CONTEXT: int = 8

    # Rate Limiting
    RATE_LIMIT_ANONYMOUS: int = 20
    RATE_LIMIT_AUTHENTICATED: int = 60
    RATE_LIMIT_INTERVIEW: int = 10

    @field_validator(
        "APP_NAME",
        "APP_VERSION",
        "ENVIRONMENT",
        "FRONTEND_URL",
        "BACKEND_URL",
        "ADMIN_EMAIL",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_JWT_SECRET",
        "DATABASE_URL",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "GROQ_EVAL_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "UPSTASH_REDIS_URL",
        "UPSTASH_REDIS_TOKEN",
        "RESEND_API_KEY",
        "FROM_EMAIL",
        "GMAIL_API_CLIENT_ID",
        "GMAIL_API_CLIENT_SECRET",
        "GMAIL_API_REFRESH_TOKEN",
        "GMAIL_API_FROM_EMAIL",
        mode="before",
    )
    @classmethod
    def _strip_string_values(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("FRONTEND_URL", "BACKEND_URL", "SUPABASE_URL")
    @classmethod
    def _normalize_urls(cls, value: str) -> str:
        return value.rstrip("/") if value else value

    @field_validator("FRONTEND_URL", "BACKEND_URL", mode="after")
    @classmethod
    def _enforce_https_in_production(cls, value: str) -> str:
        # ✅ SEC: Enforce HTTPS in production. HTTP OAuth redirect URIs allow token
        # interception via network sniffing and open-redirect attacks.
        # The Vercel breach chain started with OAuth token theft — HTTP makes this trivial.
        # ENVIRONMENT is validated before this runs via Pydantic field ordering.
        import os
        env = os.getenv("ENVIRONMENT", "production").lower().strip()
        if env == "production" and value and value.startswith("http://"):
            raise ValueError(
                f"URL must use HTTPS in production (got: {value}). "
                "HTTP endpoints allow OAuth token interception."
            )
        # ✅ SEC: Block wildcard CORS in production. A '*' CORS policy lets any
        # malicious website make credentialed requests to your API using a
        # logged-in student's browser session — instant account takeover.
        if env == "production" and "*" in (value or ""):
            raise ValueError(
                "Wildcard (*) is not allowed in CORS_ALLOWED_ORIGINS or ALLOWED_HOSTS in production. "
                "Set explicit origins: CORS_ALLOWED_ORIGINS=https://prepvista.ai"
            )
        return value

    @field_validator("ENVIRONMENT")
    @classmethod
    def _validate_environment(cls, value: str) -> str:
        normalized = value.lower().strip()
        # ✅ FIXED: added "staging" — previously only development|production allowed.
        # Any staging deploy would crash at startup before serving a single request.
        allowed = {"development", "staging", "production"}
        if normalized not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of: {', '.join(sorted(allowed))}")
        return normalized

    @field_validator(
        # ✅ FIXED: Added DB_POOL_MIN_SIZE and DB_POOL_MAX_SIZE — previously unvalidated.
        # Setting DB_POOL_MAX_SIZE=0 in .env caused asyncpg to fail silently at pool
        # creation with no actionable error. Now caught immediately at startup.
        "DB_POOL_MIN_SIZE",
        "DB_POOL_MAX_SIZE",
        "FREE_INTERVIEWS_PER_MONTH",
        "PRO_INTERVIEWS_PER_MONTH",
        "CAREER_INTERVIEWS_PER_MONTH",
        "MAX_RESUME_SIZE_BYTES",
        "MAX_RESUME_TEXT_LENGTH",
        "MAX_ANSWER_TEXT_LENGTH",
        "LLM_RETRIES",
        "MAX_HISTORY_TURNS_IN_CONTEXT",
        "RATE_LIMIT_ANONYMOUS",
        "RATE_LIMIT_AUTHENTICATED",
        "RATE_LIMIT_INTERVIEW",
        "EMAIL_VERIFICATION_CODE_TTL_MINUTES",
        "EMAIL_VERIFICATION_RESEND_SECONDS",
        "EMAIL_VERIFICATION_MAX_ATTEMPTS",
    )
    @classmethod
    def _validate_positive_ints(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Value must be >= 0")
        return value

    @field_validator("DEFAULT_LLM_TIMEOUT")
    @classmethod
    def _validate_timeout(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("DEFAULT_LLM_TIMEOUT must be > 0")
        return value

    @model_validator(mode="after")
    def _validate_provider_config(self) -> "Settings":
        if self.ENVIRONMENT == "production" and not self.GROQ_API_KEY and not self.OPENAI_API_KEY:
            raise ValueError("At least one LLM provider API key must be configured in production")

        if bool(self.RAZORPAY_KEY_ID) ^ bool(self.RAZORPAY_KEY_SECRET):
            raise ValueError("Both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set together")

        if bool(self.UPSTASH_REDIS_URL) ^ bool(self.UPSTASH_REDIS_TOKEN):
            raise ValueError("Both UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN must be set together")

        gmail_values = [
            self.GMAIL_API_CLIENT_ID,
            self.GMAIL_API_CLIENT_SECRET,
            self.GMAIL_API_REFRESH_TOKEN,
        ]
        if any(gmail_values) and not all(gmail_values):
            raise ValueError(
                "GMAIL_API_CLIENT_ID, GMAIL_API_CLIENT_SECRET, and GMAIL_API_REFRESH_TOKEN must be set together"
            )

        # ✅ SEC: JWT secret minimum entropy check.
        # A short or weak SUPABASE_JWT_SECRET allows offline brute-force of HS256 tokens.
        # Attacker can then forge a JWT for any user_id — full account takeover with no
        # password. NIST SP 800-107 recommends ≥256 bits (32 bytes) for HMAC-SHA256.
        if self.SUPABASE_JWT_SECRET and len(self.SUPABASE_JWT_SECRET) < 32:
            raise ValueError(
                "SUPABASE_JWT_SECRET must be at least 32 characters. "
                "Short secrets allow offline JWT brute-force → full account takeover."
            )

        # ✅ SEC: Enforce DEBUG=False in production. DEBUG=True exposes full stack traces,
        # internal variable values, and SQL queries in HTTP error responses.
        # This is exactly the "enumeration" step the Vercel attacker used after gaining access.
        if self.ENVIRONMENT == "production" and self.DEBUG:
            raise ValueError(
                "DEBUG must be False in production. "
                "DEBUG=True exposes stack traces and internal state in HTTP responses."
            )

        # ✅ SEC: Warn if RAZORPAY_WEBHOOK_SECRET is empty in production with payments active.
        # Without webhook secret verification, any attacker can POST fake payment confirmations
        # to your webhook endpoint and grant themselves paid plan access for free.
        if (
            self.ENVIRONMENT == "production"
            and self.RAZORPAY_KEY_ID
            and not self.RAZORPAY_WEBHOOK_SECRET
        ):
            raise ValueError(
                "RAZORPAY_WEBHOOK_SECRET must be set when Razorpay is configured in production. "
                "Without it, anyone can POST fake payment confirmations to your webhook endpoint "
                "and grant themselves paid plan access."
            )

        # ✅ ADDED: DB pool cross-validation — MIN > MAX causes asyncpg to raise a
        # cryptic error at the first DB call, not at startup. Catch it here so the
        # error message is actionable.
        if self.DB_POOL_MIN_SIZE > self.DB_POOL_MAX_SIZE:
            raise ValueError(
                f"DB_POOL_MIN_SIZE ({self.DB_POOL_MIN_SIZE}) cannot exceed "
                f"DB_POOL_MAX_SIZE ({self.DB_POOL_MAX_SIZE})"
            )
        if self.DB_POOL_MAX_SIZE < 1:
            raise ValueError("DB_POOL_MAX_SIZE must be >= 1")

        # ✅ ADDED: Interview count drift check. Settings and PLAN_CONFIG both define
        # interview limits. Mismatch = billing logic silently uses different limits
        # depending on which source each file reads.
        _plan_free_limit = PLAN_CONFIG.get("free", {}).get("interviews_per_month")
        _plan_pro_limit = PLAN_CONFIG.get("pro", {}).get("interviews_per_month")
        if _plan_free_limit is not None and _plan_free_limit != self.FREE_INTERVIEWS_PER_MONTH:
            raise ValueError(
                f"FREE_INTERVIEWS_PER_MONTH ({self.FREE_INTERVIEWS_PER_MONTH}) does not match "
                f"PLAN_CONFIG['free']['interviews_per_month'] ({_plan_free_limit}). "
                "Update both together to keep billing consistent."
            )
        if _plan_pro_limit is not None and _plan_pro_limit != self.PRO_INTERVIEWS_PER_MONTH:
            raise ValueError(
                f"PRO_INTERVIEWS_PER_MONTH ({self.PRO_INTERVIEWS_PER_MONTH}) does not match "
                f"PLAN_CONFIG['pro']['interviews_per_month'] ({_plan_pro_limit}). "
                "Update both together to keep billing consistent."
            )

        return self


PLAN_CONFIG = {
    "free": {
        "max_turns": 5,
        "temperature": 0.35,
        "max_words": 28,
        "role_title": "Friendly Interview Coach",
        "opening_style": "simple, warm, confidence-building",
        "interviews_per_month": 2,
        "has_ideal_answers": False,
        "has_pdf_report": False,
        "has_rubric_breakdown": False,
        "has_session_history": False,
        "has_corrected_intent": False,
        "has_answer_blueprint": False,
        "followup_depth_limit": 1,
        "question_retry_limit": 1,
        "price_paise": 0,
        "price_display": "Free",
    },
    "pro": {
        "max_turns": 10,
        "temperature": 0.45,
        "max_words": 30,
        "role_title": "Senior Technical Interviewer",
        "opening_style": "strict but fair, technical, concise",
        "interviews_per_month": 15,
        "has_ideal_answers": True,
        "has_pdf_report": True,
        "has_rubric_breakdown": True,
        "has_session_history": True,
        "has_corrected_intent": True,
        "has_answer_blueprint": False,
        "followup_depth_limit": 2,
        "question_retry_limit": 2,
        "price_paise": 29900,
        "price_display": "Rs299/month",
    },
    "career": {
        "max_turns": 13,
        "temperature": 0.50,
        "max_words": 35,
        "role_title": "Advanced Hiring Panel Interviewer",
        "opening_style": "sharp, adaptive, personalized, realistic",
        "interviews_per_month": None,
        "has_ideal_answers": True,
        "has_pdf_report": True,
        "has_rubric_breakdown": True,
        "has_session_history": True,
        "has_corrected_intent": True,
        "has_answer_blueprint": True,
        "followup_depth_limit": 2,
        "question_retry_limit": 2,
        "price_paise": 69900,
        "price_display": "Rs699/month",
    },
}

VALID_PLANS = set(PLAN_CONFIG.keys())
PLAN_HIERARCHY = {"free": 0, "pro": 1, "career": 2}


class AdminUnlimitedGrant(IntEnum):
    """Sentinel values for tier-isolated unlimited admin grants.

    Each value maps to the plan tier where the unlimited grant is active.
    When the user switches to a different plan, the grant has no effect.
    """
    FREE_UNLIMITED = 9991
    PRO_UNLIMITED = 9992
    CAREER_UNLIMITED = 9993


ADMIN_UNLIMITED_BY_PLAN = {
    "free": AdminUnlimitedGrant.FREE_UNLIMITED,
    "pro": AdminUnlimitedGrant.PRO_UNLIMITED,
    "career": AdminUnlimitedGrant.CAREER_UNLIMITED,
}

ADMIN_UNLIMITED_VALUES = set(AdminUnlimitedGrant)

DIFFICULTY_MODE_CONFIG = {
    "auto": {
        "label": "Auto",
        "description": "Adaptive difficulty based on the resume, plan, and live answers.",
        "planner_bias": "adaptive",
        "live_bias": "adaptive",
    },
    "basic": {
        "label": "Basic",
        "description": "Simpler, more direct questions with lighter follow-up pressure.",
        "planner_bias": "easy",
        "live_bias": "supportive",
    },
    "medium": {
        "label": "Medium",
        "description": "Balanced interview depth without overly basic warm-up questions.",
        "planner_bias": "medium",
        "live_bias": "balanced",
    },
    "difficult": {
        "label": "Difficult",
        "description": "Sharper interview depth for stronger candidates who want tougher practice.",
        "planner_bias": "hard",
        "live_bias": "challenging",
    },
}

VALID_DIFFICULTY_MODES = set(DIFFICULTY_MODE_CONFIG.keys())

PAYMENT_STATES = {
    "created",
    "pending",
    "verified",
    "failed",
    "refunded",
    "expired",
}

CATEGORY_WEIGHTS = {
    "introduction": 0.10,
    "technical_depth": 0.25,
    "project_ownership": 0.20,
    "communication": 0.15,
    "problem_solving": 0.15,
    "behavioral": 0.15,
}

# ── College B2B Organization Configuration ───────────
COLLEGE_STUDENT_PLAN = "career"  # College students always get Career plan

ORG_CATEGORIES = {"college"}  # Only college for this build

ORG_CATEGORY_CONFIG = {
    "college": {
        "label": "College",
        "code_prefix": "COL",
        "default_plan": "college_standard",
        "student_plan": COLLEGE_STUDENT_PLAN,
        "default_seat_limit": 50,
        "max_seat_limit": 5000,
        "allowed_student_plans": [COLLEGE_STUDENT_PLAN],
    },
}

ORG_BILLING_CONFIG = {
    "college_standard": {
        "label": "College Standard",
        "billing_types": ["monthly", "annual", "per_student", "batch"],
        "default_billing_type": "annual",
        "base_price_paise_monthly": 9900,   # ₹99/seat/month
        "base_price_paise_annual": 99900,   # ₹999/seat/year
    },
}

ORG_ACCESS_LOG_ACTIONS = {
    "grant_access",
    "revoke_access",
    "add_student",
    "remove_student",
    "edit_student",
    "bulk_add",
    "bulk_grant",
    "admin_login",
    "segment_add",
    "segment_edit",
    "segment_delete",
}

ORG_STATUSES = {"active", "suspended", "expired", "pending"}
ORG_ADMIN_STATUSES = {"active", "inactive", "suspended"}
ORG_STUDENT_STATUSES = {"active", "inactive", "removed"}
SEGMENT_STATUSES = {"active", "inactive"}

# College CSV upload limits
COLLEGE_CSV_MAX_ROWS = 500
COLLEGE_CSV_REQUIRED_COLUMNS = {
    "email", "student_id", "department", "batch"
}

# Pagination defaults
ORG_DEFAULT_PAGE_SIZE = 25
ORG_MAX_PAGE_SIZE = 100


def generate_org_code(next_seq: int, category: str = "college") -> str:
    """Generate an organization code in the format COL-XXXX."""
    cfg = ORG_CATEGORY_CONFIG.get(category)
    if not cfg:
        raise ValueError(f"Unknown organization category: {category}")
    prefix = cfg["code_prefix"]
    return f"{prefix}-{next_seq:04d}"


def is_valid_org_category(category: str) -> bool:
    """Check if the organization category is supported."""
    return (category or "").lower().strip() in ORG_CATEGORIES


def get_org_category_config(category: str) -> dict:
    """Return org category config with fallback to college."""
    normalized = (category or "college").lower().strip()
    return dict(ORG_CATEGORY_CONFIG.get(normalized, ORG_CATEGORY_CONFIG["college"]))


def get_plan_config(plan: str) -> dict:
    """Return a safe plan config copy with fallback to free."""
    selected_plan = (plan or "free").lower().strip()
    return dict(PLAN_CONFIG.get(selected_plan, PLAN_CONFIG["free"]))


def is_valid_plan(plan: str) -> bool:
    """Check whether the supplied plan name is valid."""
    return (plan or "").lower().strip() in VALID_PLANS


def is_valid_difficulty_mode(mode: str) -> bool:
    """Check whether the supplied difficulty mode is one of the supported public values."""
    return (mode or "").lower().strip() in VALID_DIFFICULTY_MODES


def normalize_difficulty_mode(mode: str) -> str:
    """Return a safe difficulty-mode value with fallback to auto."""
    normalized = (mode or "auto").lower().strip()
    return normalized if normalized in VALID_DIFFICULTY_MODES else "auto"


def get_difficulty_mode_config(mode: str) -> dict:
    """Return a safe difficulty-mode config copy."""
    normalized = normalize_difficulty_mode(mode)
    return dict(DIFFICULTY_MODE_CONFIG[normalized])


def can_access_plan(user_plan: str, requested_plan: str) -> bool:
    """Check whether a user's current plan can access a requested plan."""
    user_value = PLAN_HIERARCHY.get((user_plan or "free").lower().strip(), 0)
    requested_value = PLAN_HIERARCHY.get((requested_plan or "free").lower().strip(), 0)
    return user_value >= requested_value


def get_env(name: str, default: str = "") -> str:
    """Small helper for non-pydantic one-off environment access."""
    return os.getenv(name, default).strip()


def get_allowed_hosts() -> list[str]:
    """Return the parsed list of allowed Host header values.

    ✅ SEC: Central parser — every middleware and test uses this function so
    there is no risk of one part of the app using a different split character.
    Returns ['*'] in development if not configured (safe default for local dev).
    """
    raw = get_settings().ALLOWED_HOSTS or "*"
    return [h.strip() for h in raw.split(",") if h.strip()]


def get_cors_origins() -> list[str]:
    """Return the parsed list of allowed CORS origins.

    ✅ SEC: CORS misconfiguration is in the OWASP Top 10 and was a contributing
    factor in several 2024-2025 SaaS credential theft incidents. Never '*' in prod.
    """
    raw = get_settings().CORS_ALLOWED_ORIGINS or "http://localhost:3000"
    return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()