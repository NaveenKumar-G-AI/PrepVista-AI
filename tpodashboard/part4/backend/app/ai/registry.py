"""Provider registry: name-based lookup without importing adapter classes.

The rest of the application should obtain a provider via
`registry.get("gemini")`, never `from app.ai.providers.gemini import
GeminiProvider`. This is what makes the provider dependency inversion in
`docs/ai-providers.md` actually hold at the import-graph level, not just
in a docstring.
"""

from __future__ import annotations

from collections.abc import Callable

from app.ai.errors import ProviderNotRegisteredError
from app.ai.provider import ModelProvider
from app.core.config import Settings


class ProviderRegistry:
    """A name -> `ModelProvider` factory registry with lazy, cached construction."""

    def __init__(self) -> None:
        self._factories: dict[str, Callable[[], ModelProvider]] = {}
        self._instances: dict[str, ModelProvider] = {}

    def register(self, name: str, factory: Callable[[], ModelProvider]) -> None:
        """Register a factory for `name`. Overwrites any existing registration."""
        self._factories[name] = factory
        self._instances.pop(name, None)

    def get(self, name: str) -> ModelProvider:
        """Return the (lazily constructed, cached) provider registered as `name`.

        Raises `ProviderNotRegisteredError` for an unknown name -- callers
        get a clear error listing what *is* available rather than an
        opaque `KeyError`.
        """
        if name not in self._factories:
            raise ProviderNotRegisteredError(name, available=list(self._factories))
        if name not in self._instances:
            self._instances[name] = self._factories[name]()
        return self._instances[name]

    def available_providers(self) -> list[str]:
        return sorted(self._factories)

    async def aclose_all(self) -> None:
        """Close every provider instance that has been constructed so far."""
        for provider in self._instances.values():
            await provider.aclose()
        self._instances.clear()


def build_default_registry(settings: Settings) -> ProviderRegistry:
    """Build the standard registry (mock + all four real adapters) from `Settings`.

    Every provider is always registered by name, regardless of whether its
    API key is configured -- constructing an adapter is cheap and
    side-effect-free (see each adapter's `__init__`); a missing key only
    surfaces when you actually call `generate()`/`stream()` (as a clear
    `ConfigurationError`) or `health()` (as `misconfigured`). This lets
    `registry.available_providers()` always reflect the full set this
    codebase knows how to talk to, and keeps "is this provider configured"
    a `health()` question rather an import-time crash.
    """
    # Imported lazily so importing this module doesn't require every
    # provider SDK to be installed -- useful if a future deployment only
    # needs a subset of providers.
    from app.ai.providers.cerebras import CerebrasProvider
    from app.ai.providers.gemini import GeminiProvider
    from app.ai.providers.groq import GroqProvider
    from app.ai.providers.mock import MockModelProvider
    from app.ai.providers.openrouter import OpenRouterProvider

    registry = ProviderRegistry()
    registry.register("mock", lambda: MockModelProvider())
    registry.register(
        "gemini",
        lambda: GeminiProvider(
            api_key=settings.ai.gemini_api_key, timeout_seconds=settings.ai.request_timeout_seconds
        ),
    )
    registry.register(
        "groq",
        lambda: GroqProvider(
            api_key=settings.ai.groq_api_key, timeout_seconds=settings.ai.request_timeout_seconds
        ),
    )
    registry.register(
        "cerebras",
        lambda: CerebrasProvider(
            api_key=settings.ai.cerebras_api_key,
            timeout_seconds=settings.ai.request_timeout_seconds,
        ),
    )
    registry.register(
        "openrouter",
        lambda: OpenRouterProvider(
            api_key=settings.ai.openrouter_api_key,
            timeout_seconds=settings.ai.request_timeout_seconds,
        ),
    )
    return registry
