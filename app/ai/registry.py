"""
PrepVista AI — ProviderRegistry: lazy name-keyed provider construction.
Ported from Part 4. Obtain providers via registry.get("groq"), never by
importing adapter classes directly.
"""
from __future__ import annotations
from collections.abc import Callable
from app.ai.errors import ProviderNotRegisteredError
from app.ai.provider import ModelProvider


class ProviderRegistry:
    """Name -> ModelProvider factory registry with lazy, cached construction."""

    def __init__(self) -> None:
        self._factories:  dict[str, Callable[[], ModelProvider]] = {}
        self._instances:  dict[str, ModelProvider] = {}

    def register(self, name: str, factory: Callable[[], ModelProvider]) -> None:
        self._factories[name] = factory
        self._instances.pop(name, None)

    def get(self, name: str) -> ModelProvider:
        if name not in self._factories:
            raise ProviderNotRegisteredError(name, available=list(self._factories))
        if name not in self._instances:
            self._instances[name] = self._factories[name]()
        return self._instances[name]

    def available_providers(self) -> list[str]:
        return sorted(self._factories)

    async def aclose_all(self) -> None:
        for provider in self._instances.values():
            await provider.aclose()
        self._instances.clear()


def build_prepvista_registry() -> ProviderRegistry:
    """Build the PrepVista AI provider registry.

    Registers:
      - groq       (groq SDK — installed)
      - openai     (openai SDK — installed, used as fallback)
      - openrouter (openai SDK pointed at openrouter.ai — installed)
      - mock       (in-memory, always available, used in tests)

    Gemini and Cerebras adapters are registered but return 'misconfigured'
    from health() if their SDKs are not installed — no import-time crash.
    """
    from app.ai.providers.mock import MockProvider
    from app.ai.providers.groq_adapter import GroqAdapter
    from app.ai.providers.openai_adapter import OpenAIAdapter
    from app.ai.providers.openrouter_adapter import OpenRouterAdapter
    from app.ai.providers.stub import StubProvider
    from app.config import get_settings

    settings = get_settings()

    registry = ProviderRegistry()
    registry.register("mock",       lambda: MockProvider())
    registry.register("groq",       lambda: GroqAdapter(api_key=settings.GROQ_API_KEY))
    registry.register("openai",     lambda: OpenAIAdapter(api_key=settings.OPENAI_API_KEY))
    registry.register("openrouter", lambda: OpenRouterAdapter(api_key=getattr(settings, "OPENROUTER_API_KEY", None)))
    # Stubs for SDKs not currently installed
    registry.register("gemini",   lambda: StubProvider("gemini",   "google-genai SDK not installed"))
    registry.register("cerebras", lambda: StubProvider("cerebras", "cerebras-cloud-sdk not installed"))
    return registry


# Module-level singleton — lazy, built on first access
_registry: ProviderRegistry | None = None

def get_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = build_prepvista_registry()
    return _registry