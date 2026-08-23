"""Shared provider contract test suite (spec §Provider contract tests).

Every `ModelProvider` implementation is run against this exact set of test
methods, so behavior is guaranteed consistent across providers regardless
of the underlying SDK. Subclass `ProviderContractTests` in a
provider-specific test module and supply a `provider_factory` fixture: a
callable `scenario: str -> (provider, request)` where `scenario` is one of
`"success"`, `"tool_call"`, `"rate_limit"`, `"timeout"`, and `request` is a
minimal request already shaped correctly for that scenario (e.g. the Mock
provider encodes its scenario in `request.metadata`, while the other
providers encode it in which fake transport `provider` was constructed
with -- either way, the request returned is ready to use as-is).

Tests that care about request *shape* rather than scenario (system
message, multi-turn history) start from the "success" pair and adapt the
request via `model_copy`, so they still exercise whatever scenario-specific
wiring a given provider's fixture set up.
"""

from __future__ import annotations

import pytest

from app.ai.errors import ProviderTimeoutError, RateLimitError
from app.ai.provider import ModelProvider
from app.ai.types import FinishReason, Message, Role


class ProviderContractTests:
    """Mix into a per-provider test class; provides no fixtures of its own."""

    async def test_basic_generation(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")

        response = await provider.generate(request)

        assert response.content
        assert response.provider == provider.name

    async def test_system_message(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")
        request = request.model_copy(update={"system": "Be concise."})

        response = await provider.generate(request)

        assert response.content

    async def test_multiple_messages(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")
        request = request.model_copy(
            update={
                "messages": [
                    Message(role=Role.user, content="first"),
                    Message(role=Role.assistant, content="reply"),
                    Message(role=Role.user, content="second"),
                ]
            }
        )

        response = await provider.generate(request)

        assert response.content

    async def test_response_normalization(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")

        response = await provider.generate(request)

        assert isinstance(response.content, str)
        assert response.provider == provider.name
        assert response.model
        assert isinstance(response.finish_reason, FinishReason)

    async def test_usage_normalization(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")

        response = await provider.generate(request)

        # Usage is always present as an object; individual fields may be
        # None if a provider doesn't report them -- never fabricated.
        assert response.usage is not None

    async def test_tool_call_normalization(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("tool_call")

        response = await provider.generate(request)

        assert response.finish_reason == FinishReason.tool_calls
        assert len(response.tool_calls) >= 1
        assert response.tool_calls[0].name
        assert isinstance(response.tool_calls[0].arguments, dict)

    async def test_error_normalization_rate_limit(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("rate_limit")

        with pytest.raises(RateLimitError) as exc_info:
            await provider.generate(request)
        assert exc_info.value.provider == provider.name
        assert exc_info.value.retryable is True

    async def test_timeout(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("timeout")

        with pytest.raises(ProviderTimeoutError) as exc_info:
            await provider.generate(request)
        assert exc_info.value.retryable is True

    async def test_streaming(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")

        events = [event async for event in provider.stream(request)]

        assert events, "stream produced no events"
        assert events[-1].type == "completed"
        assert events[-1].response.provider == provider.name

    async def test_streaming_tool_call(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("tool_call")

        events = [event async for event in provider.stream(request)]

        assert events[-1].type == "completed"
        assert len(events[-1].response.tool_calls) >= 1

    async def test_streaming_error_yields_error_event(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("rate_limit")

        events = [event async for event in provider.stream(request)]

        assert events[-1].type == "error"
        assert events[-1].error.code == "rate_limit_error"

    async def test_health_returns_a_status(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, request = provider_factory("success")

        health = await provider.health()

        assert health.provider == provider.name
        assert health.status is not None

    def test_provider_is_a_model_provider(self, provider_factory) -> None:  # type: ignore[no-untyped-def]
        provider, _ = provider_factory("success")

        assert isinstance(provider, ModelProvider)
        assert isinstance(provider.name, str) and provider.name
