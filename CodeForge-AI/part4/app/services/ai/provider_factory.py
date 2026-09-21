"""
Provider selection. Business logic never picks a provider directly —
it asks this factory, which reads environment configuration once.

Priority: explicit AI_PROVIDER override > ANTHROPIC_API_KEY > GROQ_API_KEY
> GEMINI_API_KEY > none configured (every caller then correctly falls
back to AI_EVALUATION_PENDING rather than fabricating output).
"""
from __future__ import annotations

import os

from .anthropic_provider import AnthropicProvider
from .base import AIProvider
from .gemini_provider import GeminiProvider
from .groq_provider import GroqProvider

_PROVIDER_CLASSES: dict[str, type[AIProvider]] = {
    "anthropic": AnthropicProvider,
    "groq": GroqProvider,
    "gemini": GeminiProvider,
}


def get_configured_provider() -> AIProvider | None:
    forced = os.environ.get("AI_PROVIDER", "").strip().lower()
    if forced:
        cls = _PROVIDER_CLASSES.get(forced)
        if cls is None:
            return None
        instance = cls()
        return instance if instance.is_available() else None

    for cls in (AnthropicProvider, GroqProvider, GeminiProvider):
        instance = cls()
        if instance.is_available():
            return instance
    return None
