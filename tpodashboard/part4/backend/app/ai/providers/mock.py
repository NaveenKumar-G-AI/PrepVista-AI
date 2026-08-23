"""A deterministic, in-memory `ModelProvider` for tests.

Never makes a network call. Every future agent/orchestrator test should be
able to run entirely against this provider -- see `docs/ai-providers.md`
§Mock provider.

Scenario selection: set `request.metadata["mock_scenario"]` to one of the
`MockScenario` values to get specific, deterministic behavior (a tool call,
a simulated rate limit, a simulated timeout, ...). With no scenario set,
`generate()`/`stream()` return a short deterministic default response.
"""

from __future__ import annotations

import enum
from collections.abc import AsyncIterator

from app.ai.errors import (
    MalformedResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import (
    CompletedEvent,
    ErrorEvent,
    FinishReason,
    ModelRequest,
    ModelResponse,
    StreamEvent,
    TextDeltaEvent,
    ToolCall,
    ToolCallDeltaEvent,
    Usage,
    UsageEvent,
)


class MockScenario(enum.StrEnum):
    """Selectable via `request.metadata["mock_scenario"]`."""

    normal = "normal"
    long_response = "long_response"
    tool_call = "tool_call"
    rate_limit = "rate_limit"
    timeout = "timeout"
    unavailable = "unavailable"
    malformed = "malformed"


_DEFAULT_RESPONSE_TEXT = "This is a deterministic mock response."
_LONG_RESPONSE_TEXT = " ".join(["This is a long deterministic mock response."] * 50)
_MOCK_TOOL_CALL = ToolCall(id="mock-call-1", name="read_file", arguments={"path": "README.md"})


class MockModelProvider(ModelProvider):
    """Deterministic provider used by tests and, later, by agent development
    that shouldn't spend money or depend on network access.
    """

    name = "mock"

    def __init__(self, *, default_response_text: str = _DEFAULT_RESPONSE_TEXT) -> None:
        self._default_response_text = default_response_text

    def _scenario(self, request: ModelRequest) -> MockScenario:
        raw = request.metadata.get("mock_scenario", MockScenario.normal)
        return MockScenario(raw)

    async def generate(self, request: ModelRequest) -> ModelResponse:
        scenario = self._scenario(request)

        if scenario is MockScenario.rate_limit:
            raise RateLimitError(
                "Mock rate limit exceeded.", provider=self.name, model=request.model
            )
        if scenario is MockScenario.timeout:
            raise ProviderTimeoutError(
                "Mock request timed out.", provider=self.name, model=request.model
            )
        if scenario is MockScenario.unavailable:
            raise ProviderUnavailableError(
                "Mock provider is unavailable.", provider=self.name, model=request.model
            )
        if scenario is MockScenario.malformed:
            raise MalformedResponseError(
                "Mock provider returned an unparsable response.",
                provider=self.name,
                model=request.model,
            )

        if scenario is MockScenario.tool_call:
            return ModelResponse(
                content=None,
                provider=self.name,
                model=request.model,
                finish_reason=FinishReason.tool_calls,
                usage=Usage(input_tokens=12, output_tokens=8, total_tokens=20),
                tool_calls=[_MOCK_TOOL_CALL],
                request_id="mock-request-id",
            )

        text = (
            _LONG_RESPONSE_TEXT
            if scenario is MockScenario.long_response
            else self._default_response_text
        )
        return ModelResponse(
            content=text,
            provider=self.name,
            model=request.model,
            finish_reason=FinishReason.stop,
            usage=Usage(
                input_tokens=10,
                output_tokens=len(text.split()),
                total_tokens=10 + len(text.split()),
            ),
            request_id="mock-request-id",
        )

    async def stream(self, request: ModelRequest) -> AsyncIterator[StreamEvent]:
        scenario = self._scenario(request)

        if scenario in (
            MockScenario.rate_limit,
            MockScenario.timeout,
            MockScenario.unavailable,
            MockScenario.malformed,
        ):
            try:
                await self.generate(request)
            except (
                RateLimitError,
                ProviderTimeoutError,
                ProviderUnavailableError,
                MalformedResponseError,
            ) as exc:
                yield ErrorEvent(error=exc.to_info())
            return

        if scenario is MockScenario.tool_call:
            yield ToolCallDeltaEvent(index=0, id=_MOCK_TOOL_CALL.id, name=_MOCK_TOOL_CALL.name)
            yield ToolCallDeltaEvent(index=0, arguments_delta='{"path": "README.md"}')
            response = await self.generate(request)
            yield UsageEvent(usage=response.usage)
            yield CompletedEvent(response=response)
            return

        text = (
            _LONG_RESPONSE_TEXT
            if scenario is MockScenario.long_response
            else self._default_response_text
        )
        words = text.split(" ")
        for word in words:
            yield TextDeltaEvent(text=word + " ")

        response = await self.generate(request)
        yield UsageEvent(usage=response.usage)
        yield CompletedEvent(response=response)

    async def health(self) -> ProviderHealth:
        return ProviderHealth(status=ProviderHealthStatus.available, provider=self.name)
