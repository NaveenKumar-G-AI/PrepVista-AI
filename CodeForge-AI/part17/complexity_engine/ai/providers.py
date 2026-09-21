"""
complexity_engine.ai.providers
=================================
Real HTTP clients for Groq and Gemini. No provider is hard-coded as
"the" provider — resolve_provider() picks whichever has a key set, so
swapping providers is a config change, not a code change.

INTENTIONALLY LEFT BLANK: API keys. Set one of:
    GROQ_API_KEY=...
    GEMINI_API_KEY=...
as environment variables (see .env.example at the project root). No
key is read from anywhere else, and nothing here ever logs a key.

Model names are read from env vars with a fallback default. Provider
model names change fairly often — verify the current model id in each
provider's own docs before deploying; a stale model name fails loudly
(HTTP error) rather than silently degrading.
"""
from __future__ import annotations

import os
from typing import Callable, Optional

import httpx

GROQ_MODEL_DEFAULT = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GEMINI_MODEL_DEFAULT = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_URL_TMPL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class ProviderError(Exception):
    pass


class NoProviderConfigured(ProviderError):
    pass


def call_groq(prompt: str, api_key: Optional[str] = None, model: Optional[str] = None, timeout: float = 20.0) -> str:
    key = api_key or os.environ.get("GROQ_API_KEY")
    if not key:
        raise NoProviderConfigured("GROQ_API_KEY is not set")
    resp = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": model or GROQ_MODEL_DEFAULT,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def call_gemini(prompt: str, api_key: Optional[str] = None, model: Optional[str] = None, timeout: float = 20.0) -> str:
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise NoProviderConfigured("GEMINI_API_KEY is not set")
    url = GEMINI_URL_TMPL.format(model=model or GEMINI_MODEL_DEFAULT)
    resp = httpx.post(
        url,
        params={"key": key},
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def resolve_provider() -> Callable[[str], str]:
    """Picks whichever provider has a key configured, Groq first (it's
    typically faster/cheaper for a short JSON-explanation call). Raises
    NoProviderConfigured if neither key is set — callers should treat
    that as "AI explanation unavailable", not as a hard failure of the
    deterministic engine (see ai/explain.py)."""
    if os.environ.get("GROQ_API_KEY"):
        return call_groq
    if os.environ.get("GEMINI_API_KEY"):
        return call_gemini
    raise NoProviderConfigured("neither GROQ_API_KEY nor GEMINI_API_KEY is set")
