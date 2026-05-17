"""
PrepVista — FastAPI Application Factory
Production entry point. Registers all routers, middleware, and lifecycle events.
"""

import asyncio
import os
import time
import logging
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings, get_cors_origins, get_allowed_hosts
from app.middleware.error_handler import register_error_handlers
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.database.connection import DatabaseConnection, init_db_pool, close_db_pool
from app.routers import account, admin, admin_grants, auth, interviews, reports, dashboard, billing, referrals, feedback, support, admin_support, events, org_admin, org_college
from app.services.user_activity import refresh_user_activity_stats


# ── Structured Logging ───────────────────────────────
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if get_settings().DEBUG else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger("prepvista")
NO_STORE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex",
}
USER_ACTIVITY_REFRESH_INTERVAL_SECONDS = 60


# ── Sentry Integration (if configured) ──────────────
def _init_sentry():
    dsn = os.environ.get("SENTRY_DSN")
    if dsn:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration

            # ✅ SEC: Expanded scrubbing list. Previously missing access_token, user_text,
            # resume_summary — all three appear in interview request bodies and would be
            # sent to Sentry's external servers on any unhandled exception during a session.
            # access_token is a session credential; user_text is student PII;
            # resume_summary contains the student's full career history.
            _SENSITIVE_BODY_KEYS = frozenset({
                "resume_text", "resume_summary", "password", "verification_code",
                "refresh_token", "access_token", "user_text", "attachment_data",
                "feedback_text", "secret", "token", "api_key",
            })
            _SENSITIVE_HEADER_KEYS = frozenset({"authorization", "cookie", "x-api-key"})

            def before_send(event, hint):
                """Scrub sensitive data from Sentry payloads."""
                # Scrub request body fields
                request_data = event.get("request", {}).get("data")
                if isinstance(request_data, dict):
                    for key in list(request_data.keys()):
                        if key.lower() in _SENSITIVE_BODY_KEYS:
                            request_data[key] = "[REDACTED]"
                # Scrub request headers
                request_headers = event.get("request", {}).get("headers", {})
                if isinstance(request_headers, dict):
                    for key in list(request_headers.keys()):
                        if key.lower() in _SENSITIVE_HEADER_KEYS:
                            request_headers[key] = "[REDACTED]"
                # Scrub any extra context that may have been added
                extra = event.get("extra", {})
                if isinstance(extra, dict):
                    for key in list(extra.keys()):
                        if key.lower() in _SENSITIVE_BODY_KEYS:
                            extra[key] = "[REDACTED]"
                return event

            sentry_sdk.init(
                dsn=dsn,
                integrations=[FastApiIntegration()],
                traces_sample_rate=0.1,
                profiles_sample_rate=0.05,
                environment=get_settings().ENVIRONMENT,
                before_send=before_send,
                send_default_pii=False,
            )
            logger.info("sentry_initialized")
        except ImportError:
            logger.warning("sentry_sdk_not_installed")


def _validate_runtime_environment(settings) -> None:
    """Log a clear startup contract for Render and fail early on missing essentials."""
    required_names = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_KEY",
        "SUPABASE_JWT_SECRET",
        "DATABASE_URL",
        "FRONTEND_URL",
        "BACKEND_URL",
    ]
    missing = [name for name in required_names if not getattr(settings, name, "")]
    if settings.ENVIRONMENT == "production" and missing:
        logger.error("startup_env_invalid", missing=missing)
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

    logger.info(
        "startup_env_validated",
        environment=settings.ENVIRONMENT,
        required_count=len(required_names),
        llm_provider_available=bool(settings.GROQ_API_KEY or settings.OPENAI_API_KEY),
        redis_configured=bool(settings.UPSTASH_REDIS_URL and settings.UPSTASH_REDIS_TOKEN),
        payments_configured=bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET),
    )


async def _run_user_activity_refresh_loop():
    """Keep live-user counts fresh as users become active or inactive."""
    consecutive_failures = 0
    max_backoff_seconds = 300  # 5 minutes max
    while True:
        try:
            async with DatabaseConnection() as conn:
                await refresh_user_activity_stats(conn)
            consecutive_failures = 0  # Reset on success
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            consecutive_failures += 1
            logger.warning("user_activity_refresh_failed", error=str(exc), consecutive_failures=consecutive_failures)

        # Back off when DB keeps failing: 60s → 120s → 240s → 300s (cap)
        sleep_seconds = min(
            USER_ACTIVITY_REFRESH_INTERVAL_SECONDS * (2 ** min(consecutive_failures, 3)),
            max_backoff_seconds,
        ) if consecutive_failures > 0 else USER_ACTIVITY_REFRESH_INTERVAL_SECONDS
        await asyncio.sleep(sleep_seconds)


def _describe_startup_error(exc: Exception) -> str:
    """Return a useful startup error string even when str(exc) is empty."""
    message = str(exc).strip()
    return message or repr(exc)


def _health_payload(
    app: FastAPI,
    settings,
    *,
    status: str,
    database: str,
) -> dict:
    """Build a consistent lightweight health payload.

    ✅ SEC: Deliberately minimal. Previously exposed version, environment, and
    raw db_init_error strings to unauthenticated callers.
    - version: used by attackers to look up known CVEs for your exact build
    - environment: confirms 'production' target for an attacker
    - database_status: contains raw DB error messages that reveal schema details

    Health checks only need status + uptime for platform probes (Render, Railway,
    ECS, etc). Everything else is internal observability available in your logs.
    """
    started_at = float(getattr(app.state, "started_at", time.time()))
    uptime_seconds = max(0, int(time.time() - started_at))
    return {
        "status": status,
        "service": "prepvista-backend",
        "database": database,
        "uptime_seconds": uptime_seconds,
    }


async def _bootstrap_runtime_services(app: FastAPI):
    """Bring up DB-backed services in the background so the port binds quickly."""
    retry_delay_seconds = 3
    attempt = 0

    while True:
        try:
            attempt += 1
            await init_db_pool(max_attempts=1, log_failures=False)
            app.state.db_ready = True
            app.state.db_init_error = None
            app.state.activity_refresh_task = asyncio.create_task(_run_user_activity_refresh_loop())
            try:
                async with DatabaseConnection() as conn:
                    await refresh_user_activity_stats(conn)
            except Exception as exc:
                logger.warning(
                    "initial_user_activity_refresh_failed",
                    error=_describe_startup_error(exc),
                )
            logger.info("runtime_services_ready", attempt=attempt)
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            app.state.db_ready = False
            app.state.db_init_error = _describe_startup_error(exc)
            log_method = logger.warning if attempt == 1 else logger.info
            log_method(
                "runtime_db_init_retrying",
                attempt=attempt,
                retry_in_seconds=retry_delay_seconds,
                error_type=type(exc).__name__,
                error=app.state.db_init_error,
            )
            await asyncio.sleep(retry_delay_seconds)


# ── Application Lifecycle ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings = get_settings()
    _init_sentry()
    _validate_runtime_environment(settings)
    logger.info("starting_prepvista", version=settings.APP_VERSION, env=settings.ENVIRONMENT)
    app.state.started_at = time.time()
    app.state.db_ready = False
    app.state.db_init_error = None
    app.state.activity_refresh_task = None
    app.state.runtime_bootstrap_task = asyncio.create_task(_bootstrap_runtime_services(app))
    yield
    runtime_bootstrap_task = getattr(app.state, "runtime_bootstrap_task", None)
    if runtime_bootstrap_task:
        runtime_bootstrap_task.cancel()
        try:
            await runtime_bootstrap_task
        except asyncio.CancelledError:
            pass
    activity_refresh_task = getattr(app.state, "activity_refresh_task", None)
    if activity_refresh_task:
        activity_refresh_task.cancel()
        try:
            await activity_refresh_task
        except asyncio.CancelledError:
            pass
    await close_db_pool()
    logger.info("shutdown_complete")


# ── App Factory ──────────────────────────────────────
def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────
    # ✅ SEC: Use get_cors_origins() from config — supports comma-separated list
    # of origins, enforces no wildcard in production, and is the single source
    # of truth so no route through the app bypasses the CORS policy.
    cors_origins = get_cors_origins()
    if settings.DEBUG:
        # Add localhost variants only in dev — never in production
        _dev_origins = {
            "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000",
        }
        cors_origins = list(dict.fromkeys(cors_origins + [o for o in _dev_origins if o not in cors_origins]))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-Request-ID"],
        max_age=3600,
    )

    # ── Trusted Host ─────────────────────────────
    # ✅ SEC: TrustedHostMiddleware prevents Host header injection attacks.
    # Without this, an attacker sends a request with Host: evil.com — your
    # app uses the Host header to build password-reset links, which then point
    # to the attacker's domain. Students click the link, attacker captures the
    # token. This middleware rejects requests with unrecognised Host headers.
    allowed_hosts = get_allowed_hosts()
    if allowed_hosts and allowed_hosts != ["*"]:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
    elif settings.ENVIRONMENT == "production":
        logger.warning(
            "trusted_host_wildcard_in_production",
            advice="Set ALLOWED_HOSTS=prepvista.ai,www.prepvista.ai to prevent Host header injection.",
        )

    # ── Request Size Limit ───────────────────────
    # ✅ SEC: Reject oversized request bodies before they reach any route handler.
    # Without this, a 500MB POST body travels all the way through CORS, auth, and
    # route dispatch before being rejected — wasting a connection slot and memory
    # for the full duration. FastAPI/Starlette has no built-in body size limit.
    _max_body_bytes = settings.MAX_REQUEST_SIZE_MB * 1024 * 1024

    @app.middleware("http")
    async def _enforce_request_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _max_body_bytes:
            return JSONResponse(
                {"detail": f"Request body exceeds the {settings.MAX_REQUEST_SIZE_MB} MB limit."},
                status_code=413,
                headers=NO_STORE_HEADERS,
            )
        return await call_next(request)

    # ── Security Headers ─────────────────────────
    app.add_middleware(SecurityHeadersMiddleware)

    # ── Error Handlers ───────────────────────────
    register_error_handlers(app)

    # ── Routers ──────────────────────────────────
    app.include_router(auth.router, prefix="/auth", tags=["Auth"])
    app.include_router(interviews.router, prefix="/interviews", tags=["Interviews"])
    app.include_router(reports.router, prefix="/reports", tags=["Reports"])
    app.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
    app.include_router(billing.router, prefix="/billing", tags=["Billing"])
    app.include_router(account.router, prefix="/account", tags=["Account"])
    app.include_router(support.router, prefix="/support", tags=["Support Chat"])
    app.include_router(admin.router, prefix="/admin", tags=["Admin"])
    app.include_router(admin_grants.router, prefix="/admin/grants", tags=["Admin Grants"])
    app.include_router(admin_support.router, prefix="/admin/support", tags=["Admin Support Chat"])
    app.include_router(referrals.router, prefix="/referrals", tags=["Referrals"])
    app.include_router(feedback.router, prefix="/feedback", tags=["Feedback"])
    app.include_router(events.router, prefix="/events", tags=["Events"])
    app.include_router(org_admin.router, prefix="/org/admin", tags=["Org Admin"])
    app.include_router(org_college.router, prefix="/org/my", tags=["College Admin"])

    # ── Health Check ─────────────────────────────
    @app.api_route("/", methods=["GET", "HEAD"])
    async def root_health():
        """Return a lightweight 200 at the root for platform probes."""
        db_ready = bool(getattr(app.state, "db_ready", False))
        return JSONResponse(
            _health_payload(
                app,
                settings,
                status="ok" if db_ready else "starting",
                database="ok" if db_ready else "starting",
            ),
            headers=NO_STORE_HEADERS,
        )

    @app.get("/health")
    async def health():
        db_ready = bool(getattr(app.state, "db_ready", False))
        return JSONResponse(
            _health_payload(
                app,
                settings,
                status="ok" if db_ready else "starting",
                database="ok" if db_ready else "starting",
            ),
            headers=NO_STORE_HEADERS,
        )

    @app.get("/health/awake")
    async def health_awake():
        started_at = float(getattr(app.state, "started_at", time.time()))
        uptime_seconds = max(0, int(time.time() - started_at))
        return JSONResponse(
            {
                "status": "awake",
                "service": "prepvista-backend",
                "app": settings.APP_NAME,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "uptime_seconds": uptime_seconds,
            },
            headers=NO_STORE_HEADERS,
        )

    @app.get("/health/ready")
    async def health_ready():
        if not bool(getattr(app.state, "db_ready", False)):
            return JSONResponse(
                _health_payload(
                    app,
                    settings,
                    status="starting",
                    database="initializing",
                ),
                status_code=503,
                headers=NO_STORE_HEADERS,
            )

        try:
            async with DatabaseConnection() as conn:
                await conn.fetchval("SELECT 1")
        except Exception as exc:
            logger.warning("health_ready_failed", error=_describe_startup_error(exc))
            return JSONResponse(
                _health_payload(
                    app,
                    settings,
                    status="degraded",
                    database="unavailable",
                ),
                status_code=503,
                headers=NO_STORE_HEADERS,
            )

        return JSONResponse(
            _health_payload(
                app,
                settings,
                status="ready",
                database="ok",
            ),
            headers=NO_STORE_HEADERS,
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    port = int(get_settings().BACKEND_URL.split(":")[-1]) if ":" in get_settings().BACKEND_URL else 8000
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=get_settings().DEBUG)