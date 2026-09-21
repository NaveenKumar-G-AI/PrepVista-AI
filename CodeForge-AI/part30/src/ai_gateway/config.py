"""
Central configuration for the AI Gateway.

Every secret defaults to an EMPTY string. Nothing in this file, or anywhere
else in this package, hardcodes a real API key, database password, or
admin token. Fill in a real `.env` (copy `.env.example`) before running
against live providers or a live database — see README.md.

This module intentionally does not raise on missing secrets at import time,
so the gateway's pure logic (routing, cost math, policy, etc.) can be
imported and unit-tested with zero configuration. Call `Settings.require_*`
helpers at the call sites that actually need a given secret (e.g. right
before making a live provider HTTP call), so the failure is loud and
happens at the moment it matters instead of silently at startup.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    environment: str = field(default_factory=lambda: _env("CODEFORGE_ENV", "development"))

    # --- Secrets: intentionally blank until you set them in .env ----------
    groq_api_key: str = field(default_factory=lambda: _env("GROQ_API_KEY"))
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL"))
    redis_url: str = field(default_factory=lambda: _env("REDIS_URL"))
    admin_api_token: str = field(default_factory=lambda: _env("ADMIN_API_TOKEN"))

    # --- Non-secret tuning knobs, all overridable via env ------------------
    groq_base_url: str = field(default_factory=lambda: _env("GROQ_BASE_URL", "https://api.groq.com/openai/v1"))
    gemini_base_url: str = field(
        default_factory=lambda: _env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
    )
    default_provider_timeout_s: float = field(
        default_factory=lambda: float(_env("AI_GATEWAY_PROVIDER_TIMEOUT_S", "30"))
    )

    def require_groq_api_key(self) -> str:
        if not self.groq_api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Add it to your .env (see .env.example). "
                "Refusing to call the Groq API with an empty credential."
            )
        return self.groq_api_key

    def require_gemini_api_key(self) -> str:
        if not self.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to your .env (see .env.example). "
                "Refusing to call the Gemini API with an empty credential."
            )
        return self.gemini_api_key

    def require_database_url(self) -> str:
        if not self.database_url:
            raise RuntimeError(
                "DATABASE_URL is not set. Point it at your Supabase/Postgres connection "
                "string in .env before using db/repository.py."
            )
        return self.database_url

    def require_admin_api_token(self) -> str:
        if not self.admin_api_token:
            raise RuntimeError(
                "ADMIN_API_TOKEN is not set. The admin control plane refuses to run with "
                "no token configured, rather than silently allowing unauthenticated access."
            )
        return self.admin_api_token


settings = Settings()
