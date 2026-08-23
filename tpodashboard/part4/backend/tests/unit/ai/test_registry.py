"""Tests for `ProviderRegistry` and `build_default_registry`."""

from __future__ import annotations

import pytest

from app.ai.errors import ProviderNotRegisteredError
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.registry import ProviderRegistry, build_default_registry
from app.ai.types import ModelRequest, ModelResponse


class _StubProvider(ModelProvider):
    name = "stub"

    def __init__(self) -> None:
        self.closed = False

    async def generate(self, request: ModelRequest) -> ModelResponse:  # pragma: no cover - unused
        raise NotImplementedError

    async def stream(self, request: ModelRequest):  # type: ignore[no-untyped-def]  # pragma: no cover
        raise NotImplementedError
        yield  # pragma: no cover

    async def health(self) -> ProviderHealth:
        return ProviderHealth(status=ProviderHealthStatus.available, provider=self.name)

    async def aclose(self) -> None:
        self.closed = True


def test_get_unknown_provider_raises_clear_error() -> None:
    registry = ProviderRegistry()

    with pytest.raises(ProviderNotRegisteredError):
        registry.get("nonexistent")


def test_register_and_get_returns_the_same_cached_instance() -> None:
    registry = ProviderRegistry()
    registry.register("stub", _StubProvider)

    first = registry.get("stub")
    second = registry.get("stub")

    assert first is second


def test_construction_is_lazy_until_first_get() -> None:
    constructed = {"count": 0}

    def factory() -> _StubProvider:
        constructed["count"] += 1
        return _StubProvider()

    registry = ProviderRegistry()
    registry.register("stub", factory)
    assert constructed["count"] == 0

    registry.get("stub")
    assert constructed["count"] == 1


def test_re_registering_a_name_clears_the_cached_instance() -> None:
    registry = ProviderRegistry()
    registry.register("stub", _StubProvider)
    first = registry.get("stub")

    registry.register("stub", _StubProvider)
    second = registry.get("stub")

    assert first is not second


def test_available_providers_is_sorted() -> None:
    registry = ProviderRegistry()
    registry.register("zeta", _StubProvider)
    registry.register("alpha", _StubProvider)

    assert registry.available_providers() == ["alpha", "zeta"]


async def test_aclose_all_closes_every_constructed_instance_and_clears_cache() -> None:
    registry = ProviderRegistry()
    registry.register("stub", _StubProvider)
    instance = registry.get("stub")
    assert instance.closed is False

    await registry.aclose_all()

    assert instance.closed is True
    # a fresh get() after aclose_all constructs a new instance
    new_instance = registry.get("stub")
    assert new_instance is not instance


def test_build_default_registry_registers_mock_and_all_four_real_providers(settings) -> None:
    registry = build_default_registry(settings)

    assert registry.available_providers() == ["cerebras", "gemini", "groq", "mock", "openrouter"]


def test_build_default_registry_providers_construct_without_api_keys(settings) -> None:
    """Constructing a provider must never require its API key -- only
    calling generate()/stream()/health() should surface a missing key."""
    registry = build_default_registry(settings)

    for name in registry.available_providers():
        provider = registry.get(name)
        assert isinstance(provider, ModelProvider)
        assert provider.name == name
