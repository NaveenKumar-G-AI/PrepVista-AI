"""
AIProvider abstraction. Business logic (diagnosis, feedback, etc.) never
talks to Groq/Gemini/Anthropic SDKs directly — it goes through this
interface, so providers are interchangeable and testable.

    AIProvider
        ├── AnthropicProvider   (real network call, needs ANTHROPIC_API_KEY)
        ├── GroqProvider        (NOT IMPLEMENTED here — no network route /
        │                        credentials available in this sandbox;
        │                        see docs/CODEFORGE_AI_EVALUATION.md)
        ├── GeminiProvider      (NOT IMPLEMENTED here — same reason)
        └── StubProvider        (deterministic, offline — used in tests and
                                  as an explicit fallback labeled AI_EVALUATION_PENDING,
                                  never presented to a student as if it were a
                                  real model's judgement)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class AIProviderError(Exception):
    """Raised on provider outage, malformed output, or timeout."""


class AIProvider(ABC):
    name: str = "unknown"

    @abstractmethod
    def complete_json(self, system_prompt: str, user_payload: dict[str, Any], schema_hint: str) -> dict:
        """
        Send a structured request and return a parsed JSON dict.
        Must raise AIProviderError (never fabricate a plausible-looking
        response) if the call fails or the output cannot be parsed/validated.
        """
        raise NotImplementedError

    def is_available(self) -> bool:
        return True
