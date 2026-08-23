"""Tests for `MockModelProvider` -- every scenario it's required to simulate
(spec §Mock provider test scenarios): normal, long, tool call, rate limit,
timeout, unavailable, malformed, and both generate() and stream() paths.
"""

from __future__ import annotations

import pytest

from app.ai.errors import (
    MalformedResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.ai.provider import ProviderHealthStatus
from app.ai.providers.mock import MockModelProvider
from app.ai.types import FinishReason, Message, ModelRequest, Role


def _request(scenario: str | None = None) -> ModelRequest:
    metadata = {"mock_scenario": scenario} if scenario else {}
    return ModelRequest(
        messages=[Message(role=Role.user, content="hi")], model="mock-model", metadata=metadata
    )


async def test_normal_scenario_returns_deterministic_text() -> None:
    provider = MockModelProvider()

    response = await provider.generate(_request())

    assert response.content == "This is a deterministic mock response."
    assert response.provider == "mock"
    assert response.finish_reason == FinishReason.stop


async def test_generate_is_deterministic_across_calls() -> None:
    provider = MockModelProvider()

    first = await provider.generate(_request())
    second = await provider.generate(_request())

    assert first.content == second.content
    assert first.usage == second.usage


async def test_custom_default_response_text() -> None:
    provider = MockModelProvider(default_response_text="Custom canned reply.")

    response = await provider.generate(_request())

    assert response.content == "Custom canned reply."


async def test_long_response_scenario() -> None:
    provider = MockModelProvider()

    response = await provider.generate(_request("long_response"))

    assert response.content is not None
    assert len(response.content) > 200


async def test_tool_call_scenario_generate() -> None:
    provider = MockModelProvider()

    response = await provider.generate(_request("tool_call"))

    assert response.finish_reason == FinishReason.tool_calls
    assert response.content is None
    assert len(response.tool_calls) == 1
    assert response.tool_calls[0].name == "read_file"


async def test_rate_limit_scenario_raises_rate_limit_error() -> None:
    provider = MockModelProvider()

    with pytest.raises(RateLimitError):
        await provider.generate(_request("rate_limit"))


async def test_timeout_scenario_raises_timeout_error() -> None:
    provider = MockModelProvider()

    with pytest.raises(ProviderTimeoutError):
        await provider.generate(_request("timeout"))


async def test_unavailable_scenario_raises_unavailable_error() -> None:
    provider = MockModelProvider()

    with pytest.raises(ProviderUnavailableError):
        await provider.generate(_request("unavailable"))


async def test_malformed_scenario_raises_malformed_response_error() -> None:
    provider = MockModelProvider()

    with pytest.raises(MalformedResponseError):
        await provider.generate(_request("malformed"))


# --- streaming ---------------------------------------------------------


async def test_stream_normal_scenario_yields_text_deltas_then_completed() -> None:
    provider = MockModelProvider()

    events = [event async for event in provider.stream(_request())]

    assert events[0].type == "text_delta"
    assert events[-1].type == "completed"
    assert events[-1].response.content == "This is a deterministic mock response."


async def test_stream_tool_call_scenario_yields_tool_call_deltas() -> None:
    provider = MockModelProvider()

    events = [event async for event in provider.stream(_request("tool_call"))]

    types = [event.type for event in events]
    assert "tool_call_delta" in types
    assert types[-1] == "completed"


@pytest.mark.parametrize("scenario", ["rate_limit", "timeout", "unavailable", "malformed"])
async def test_stream_error_scenarios_yield_error_event_not_raise(scenario: str) -> None:
    provider = MockModelProvider()

    events = [event async for event in provider.stream(_request(scenario))]

    assert len(events) == 1
    assert events[0].type == "error"


# --- health / lifecycle --------------------------------------------------


async def test_health_is_always_available() -> None:
    provider = MockModelProvider()

    health = await provider.health()

    assert health.status == ProviderHealthStatus.available
    assert health.provider == "mock"


async def test_aclose_is_a_safe_noop() -> None:
    provider = MockModelProvider()

    await provider.aclose()
    await provider.aclose()  # safe to call twice
