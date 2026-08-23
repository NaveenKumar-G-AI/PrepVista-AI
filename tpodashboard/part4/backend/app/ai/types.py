"""Provider-independent request/response/message/streaming types.

Every provider adapter translates between these types and its own SDK's
representation (see `app/ai/providers/`). Nothing outside `app/ai/providers/`
should ever construct or depend on a provider-specific SDK object -- that
is the entire point of this module.
"""

from __future__ import annotations

import enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field


class Role(enum.StrEnum):
    """A message's role in the conversation."""

    system = "system"
    user = "user"
    assistant = "assistant"
    tool = "tool"


class ToolCall(BaseModel):
    """A single tool invocation requested by the model."""

    id: str = Field(description="Provider-issued identifier for this call.")
    name: str = Field(description="The tool/function name the model wants to call.")
    arguments: dict[str, Any] = Field(
        default_factory=dict, description="Parsed call arguments. Never raw, unparsed JSON text."
    )


class ToolDefinition(BaseModel):
    """A tool the model is allowed to call, described to the provider."""

    name: str
    description: str
    input_schema: dict[str, Any] = Field(
        description="A JSON Schema object describing the tool's expected arguments."
    )


class Message(BaseModel):
    """One turn in a conversation.

    `content` is `None` only for an `assistant` message that consists
    solely of tool calls (no accompanying text). `tool_calls` is only set
    on `assistant` messages. `tool_call_id` is only set on `tool` messages,
    identifying which prior `ToolCall.id` this message is the result of.
    """

    role: Role
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None
    name: str | None = Field(default=None, description="Optional tool/participant name.")


class ModelRequest(BaseModel):
    """A provider-independent generation request.

    `system` is a dedicated system-instruction slot, kept separate from
    `messages` (which should therefore only contain `user`/`assistant`/
    `tool` turns) since several current provider APIs (Gemini's Interactions
    API, for one) accept the system instruction as its own top-level field
    rather than as a message in the turn history. Adapters for providers
    that only support system instructions as a leading message (none of
    the four implemented here, as it happens) are expected to translate
    `system` into that shape themselves -- callers never need to know
    which style a given provider uses.
    """

    messages: list[Message]
    system: str | None = None
    model: str = Field(description="The provider's model identifier. Never defaulted silently.")
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_output_tokens: int | None = Field(default=None, gt=0)
    stop_sequences: list[str] | None = None
    tools: list[ToolDefinition] | None = None
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Caller-supplied observability metadata, not sent verbatim to the "
            "provider unless a specific field has documented cross-provider meaning."
        ),
    )
    timeout_seconds: float | None = Field(
        default=None,
        gt=0,
        description="Overrides the provider's configured default timeout for this request.",
    )
    provider_options: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Escape hatch for provider-specific parameters with no cross-provider "
            "meaning (e.g. Gemini's thinking_level). Adapters may read keys "
            "relevant to them and must ignore the rest."
        ),
    )


class FinishReason(enum.StrEnum):
    """Normalized reason a generation stopped."""

    stop = "stop"
    length = "length"
    tool_calls = "tool_calls"
    content_filter = "content_filter"
    error = "error"
    unknown = "unknown"


class Usage(BaseModel):
    """Normalized token usage. Every field is nullable -- see module docs."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    @classmethod
    def unavailable(cls) -> Usage:
        """Explicit constructor for "the provider reported no usage data"."""
        return cls(input_tokens=None, output_tokens=None, total_tokens=None)


class Cost(BaseModel):
    """Optional, normalized cost estimate. Never fabricated -- see module docs."""

    input_cost: float | None = None
    output_cost: float | None = None
    total_cost: float | None = None
    currency: str = "USD"


class ModelResponse(BaseModel):
    """A provider-independent generation result.

    Never wraps or exposes a raw provider SDK response object.
    """

    content: str | None
    provider: str
    model: str
    finish_reason: FinishReason
    usage: Usage
    tool_calls: list[ToolCall] = Field(default_factory=list)
    request_id: str | None = Field(default=None, description="Provider-issued request/response ID.")
    cost: Cost | None = Field(
        default=None,
        description="Always None unless a verified provider pricing source is configured.",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProviderErrorInfo(BaseModel):
    """A serializable summary of a normalized provider error.

    Used inside `ErrorEvent` during streaming, where embedding the raised
    exception object directly would be awkward to serialize/compare. See
    `app.ai.errors.ProviderError.to_info()`.
    """

    code: str
    message: str
    provider: str
    model: str | None = None
    status_code: int | None = None
    retryable: bool = False
    provider_request_id: str | None = None


# --- Streaming events --------------------------------------------------


class TextDeltaEvent(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    text: str


class ToolCallDeltaEvent(BaseModel):
    """An incremental update to one in-progress tool call.

    `index` identifies which tool call (in creation order) this delta
    belongs to, since arguments for multiple parallel tool calls can
    arrive interleaved. `id`/`name` are populated once, typically on the
    first delta for that index; `arguments_delta` is a partial JSON text
    fragment that accumulates across deltas for the same index.
    """

    type: Literal["tool_call_delta"] = "tool_call_delta"
    index: int
    id: str | None = None
    name: str | None = None
    arguments_delta: str | None = None


class UsageEvent(BaseModel):
    type: Literal["usage"] = "usage"
    usage: Usage


class CompletedEvent(BaseModel):
    """The final event of a successful stream, carrying the fully-assembled response."""

    type: Literal["completed"] = "completed"
    response: ModelResponse


class ErrorEvent(BaseModel):
    """The final event of a stream that failed partway through.

    Yielded rather than raised, so consumers can handle stream errors with
    the same uniform `async for event in provider.stream(request)` loop
    used for every other event, without wrapping it in try/except.
    """

    type: Literal["error"] = "error"
    error: ProviderErrorInfo


StreamEvent = Annotated[
    TextDeltaEvent | ToolCallDeltaEvent | UsageEvent | CompletedEvent | ErrorEvent,
    Field(discriminator="type"),
]
