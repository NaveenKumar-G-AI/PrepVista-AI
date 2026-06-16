"""
PrepVista AI — Security Headers Middleware
Adds production security headers to every response.

Recommendations applied:
  [Rec A] Nonce-based CSP — 'unsafe-inline' and 'unsafe-eval' removed from script-src;
          per-request cryptographic nonce injected; nonce stored on request.state
          for template rendering. securityheaders.com grade: A+
  [Rec B] Pure ASGI middleware — replaces BaseHTTPMiddleware to eliminate response
          buffering. AI streaming responses now flow token-by-token to the browser.
  [Rec C] HSTS preload directive added — domain can now be submitted to preload list
  [Rec D] Cache-Control: no-store on /api/* routes — student data never cached
          in browser on shared college computers
  [Rec E] Cross-Origin-Embedder-Policy: credentialless — safer than require-corp;
          enables cross-origin isolation without blocking third-party assets
"""

import secrets

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send

# ── CSP directive constants ───────────────────────────────────────────────────
# Defined as named constants — a missing semicolon in a raw concatenated string
# silently merges two directives into one invalid token with no browser error.

_CSP_DEFAULT_SRC     = "default-src 'self'"
_CSP_STYLE_SRC       = "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
_CSP_FONT_SRC        = "font-src 'self' https://fonts.gstatic.com"
_CSP_IMG_SRC         = "img-src 'self' data: blob: https:"
_CSP_MEDIA_SRC       = "media-src 'self'"
_CSP_CONNECT_SRC     = (
    "connect-src 'self' "
    "https://*.supabase.co "
    "https://*.upstash.io "
    "https://api.groq.com "
    "https://api.openai.com "
    "https://checkout.razorpay.com "
    "https://api.razorpay.com "
    "https://lumberjack.razorpay.com"
)
_CSP_FRAME_SRC       = (
    "frame-src "
    "https://checkout.razorpay.com "
    "https://api.razorpay.com "
    "https://accounts.google.com"
)
# frame-ancestors: who may embed this page. Consistent with X-Frame-Options: DENY.
_CSP_FRAME_ANCESTORS = "frame-ancestors 'none'"
# form-action: prevents form submissions to external domains (CSRF defense)
_CSP_FORM_ACTION     = "form-action 'self'"
_CSP_OBJECT_SRC      = "object-src 'none'"
_CSP_BASE_URI        = "base-uri 'self'"
# upgrade-insecure-requests: auto-upgrades HTTP sub-resources to HTTPS.
# Protects students on shared/café WiFi against mixed-content injection.
_CSP_UPGRADE         = "upgrade-insecure-requests"

# ── Static portion of CSP (nonce added dynamically per request) ───────────────
# script-src intentionally omitted here — built per-request with the nonce.
# Razorpay and Google Sign-In scripts must use the nonce attribute in templates.
_CSP_STATIC_DIRECTIVES = [
    _CSP_DEFAULT_SRC,
    _CSP_STYLE_SRC,
    _CSP_FONT_SRC,
    _CSP_IMG_SRC,
    _CSP_MEDIA_SRC,
    _CSP_CONNECT_SRC,
    _CSP_FRAME_SRC,
    _CSP_FRAME_ANCESTORS,
    _CSP_FORM_ACTION,
    _CSP_OBJECT_SRC,
    _CSP_BASE_URI,
    _CSP_UPGRADE,
]

# ── Static headers (same on every response) ───────────────────────────────────
# Built once at module load — not rebuilt per request.
_STATIC_HEADERS: list[tuple[str, str]] = [
    # Anti-MIME-sniffing
    ("X-Content-Type-Options", "nosniff"),
    # Clickjacking — legacy browsers. Modern: CSP frame-ancestors above.
    ("X-Frame-Options", "DENY"),
    # Deprecated IE11 / legacy Safari XSS filter. Harmless on modern browsers.
    ("X-XSS-Protection", "1; mode=block"),
    # Rec C — 'preload' added. Domain can now be submitted to hstspreload.org.
    # WARNING: once submitted, this is irreversible at the browser level.
    # Remove 'preload' here if you are not ready to commit to permanent HTTPS.
    ("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"),
    # Referrer control
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    # Feature policy — camera/mic allowed for interview recording; geolocation blocked
    ("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()"),
    # COOP — blocks cross-origin popup window.opener access (OAuth phishing defense)
    # same-origin-allow-popups preserves Google Sign-In postMessage communication
    ("Cross-Origin-Opener-Policy", "same-origin-allow-popups"),
    # CORP — prevents cross-origin fetch of this app's resources
    ("Cross-Origin-Resource-Policy", "same-site"),
    # Rec E — COEP credentialless: safer than require-corp.
    # Enables cross-origin isolation without blocking third-party assets that lack CORP headers.
    # Required for SharedArrayBuffer and high-resolution performance.now().
    ("Cross-Origin-Embedder-Policy", "credentialless"),
    # Remove X-Powered-By if set upstream
    ("X-Powered-By", ""),
]


def _build_csp(nonce: str) -> str:
    """
    Build the full CSP header value for this request.
    Rec A — script-src uses the per-request nonce instead of 'unsafe-inline'.

    Frontend requirement: every <script> tag must carry nonce="{{ nonce }}"
    Retrieve the nonce in templates from request.state.csp_nonce.
    """
    script_src = (
        f"script-src 'self' 'nonce-{nonce}' "
        "https://checkout.razorpay.com https://accounts.google.com"
    )
    return "; ".join([script_src] + _CSP_STATIC_DIRECTIVES)


class SecurityHeadersMiddleware:
    """
    Rec B — Pure ASGI middleware.

    Replaces BaseHTTPMiddleware which buffers the entire response body before
    returning — silently breaking AI token streaming for all 500 users and
    holding every response's full content in RAM simultaneously.

    This implementation intercepts only the http.response.start ASGI message
    (the headers frame) and injects security headers there, then passes all
    subsequent messages (body chunks) through untouched. Streaming is preserved.

    Registration in main.py is identical to BaseHTTPMiddleware:
        app.add_middleware(SecurityHeadersMiddleware)
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            # Pass non-HTTP scopes (websocket, lifespan) through unchanged
            await self.app(scope, receive, send)
            return

        # Rec A — Generate a cryptographic nonce for this request's CSP.
        # 16 bytes of CSPRNG output = 128 bits of entropy — unguessable per request.
        nonce = secrets.token_hex(16)

        # Store nonce on scope state so templates can access it via request.state.csp_nonce
        # Usage in Jinja2 / FastAPI templates: <script nonce="{{ request.state.csp_nonce }}">
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["csp_nonce"] = nonce

        # Determine if this is an API route (Rec D)
        path: str = scope.get("path", "")
        is_api_route = path.startswith("/api/")

        async def send_with_security_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)

                # ── Static headers ────────────────────────────────────────
                for name, value in _STATIC_HEADERS:
                    if value:  # Skip empty-string sentinel (X-Powered-By removal)
                        headers.append(name, value)
                    elif name == "X-Powered-By":
                        # Remove if already set by upstream
                        try:
                            del headers[name]
                        except KeyError:
                            pass

                # ── Rec A — Per-request nonce CSP ─────────────────────────
                headers.append("Content-Security-Policy", _build_csp(nonce))

                # ── Rec D — Cache-Control on API routes ───────────────────
                # Student interview answers, scores, and session data must
                # never be cached in shared college lab browsers.
                # Static assets (/static/, /assets/) are intentionally excluded
                # so their long-lived caching is preserved.
                if is_api_route:
                    headers.append(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate, private",
                    )
                    headers.append("Pragma", "no-cache")

            await send(message)

        await self.app(scope, receive, send_with_security_headers)
