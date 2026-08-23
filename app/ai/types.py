"""
PrepVista AI — Provider-independent request/response types.
Ported from Part 4 of the TPO Dashboard AI Provider System.

Every provider adapter translates between these types and its own SDK.
Nothing outside app/ai/providers/ should ever construct or depend on
a provider-specific SDK object.
"""
from __future__ import annotations
import enum
from typing import Annotated, Any, Literal
from pydantic import BaseModel, Field


class Role(enum.StrEnum):
    system    = "system"
    user      = "user"
    assistant = "assistant"
    tool      = "tool"


class ToolCall(BaseModel):
    id:        str
    name:      str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolDefinition(BaseModel):
    name:         str
    description:  str
    input_schema: dict[str, Any]


class Message(BaseModel):
    role:         Role
    content:      str | None = None
    tool_calls:   list[ToolCall] | None = None
    tool_call_id: str | None = None
    name:         str | None = None


class ModelRequest(BaseModel):
    messages:          list[Message]
    system:            str | None = None
    model:             str
    temperature:       float | None = Field(default=None, ge=0.0, le=2.0)
    max_output_tokens: int | None = Field(default=None, gt=0)
    stop_sequences:    list[str] | None = None
    tools:             list[ToolDefinition] | None = None
    metadata:          dict[str, Any] = Field(default_factory=dict)
    timeout_seconds:   float | None = Field(default=None, gt=0)
    provider_options:  dict[str, Any] = Field(default_factory=dict)


class FinishReason(enum.StrEnum):
    stop           = "stop"
    length         = "length"
    tool_calls     = "tool_calls"
    content_filter = "content_filter"
    error          = "error"
    unknown        = "unknown"


class Usage(BaseModel):
    input_tokens:  int | None = None
    output_tokens: int | None = None
    total_tokens:  int | None = None

    @classmethod
    def unavailable(cls) -> "Usage":
        return cls(input_tokens=None, output_tokens=None, total_tokens=None)


class Cost(BaseModel):
    input_cost:  float | None = None
    output_cost: float | None = None
    total_cost:  float | None = None
    currency:    str = "USD"


class ModelResponse(BaseModel):
    content:       str | None
    provider:      str
    model:         str
    finish_reason: FinishReason
    usage:         Usage
    tool_calls:    list[ToolCall] = Field(default_factory=list)
    request_id:    str | None = None
    cost:          Cost | None = None
    metadata:      dict[str, Any] = Field(default_factory=dict)


class ProviderErrorInfo(BaseModel):
    code:                str
    message:             str
    provider:            str
    model:               str | None = None
    status_code:         int | None = None
    retryable:           bool = False
    provider_request_id: str | None = None


class TextDeltaEvent(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    text: str


class ToolCallDeltaEvent(BaseModel):
    type:             Literal["tool_call_delta"] = "tool_call_delta"
    index:            int
    id:               str | None = None
    name:             str | None = None
    arguments_delta:  str | None = None


class UsageEvent(BaseModel):
    type:  Literal["usage"] = "usage"
    usage: Usage


class CompletedEvent(BaseModel):
    type:     Literal["completed"] = "completed"
    response: ModelResponse


class ErrorEvent(BaseModel):
    type:  Literal["error"] = "error"
    error: ProviderErrorInfo


StreamEvent = Annotated[
    TextDeltaEvent | ToolCallDeltaEvent | UsageEvent | CompletedEvent | ErrorEvent,
    Field(discriminator="type"),
]