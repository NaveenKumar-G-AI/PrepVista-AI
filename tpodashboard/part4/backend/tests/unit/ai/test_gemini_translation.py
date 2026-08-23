"""Tests for `app.ai.providers.gemini`'s own translation logic -- Gemini's
wire format differs enough from the OpenAI-compatible providers that it
isn't covered by `test_openai_compatible.py`.
"""

from __future__ import annotations

from google.genai import types

from app.ai.errors import (
    AuthenticationError,
    ModelNotFoundError,
    ProviderTimeoutError,
    RateLimitError,
)
from app.ai.providers.gemini import classify_error, translate_request, translate_response
from app.ai.types import FinishReason, Message, ModelRequest, Role, ToolCall, ToolDefinition
from tests.unit.ai.fakes import (
    FakeAPITimeoutError,
    FakeGeminiAPIError,
    fake_candidate,
    fake_function_call,
    fake_gemini_content,
    fake_gemini_response,
    fake_part,
    fake_usage_metadata,
)

# --- translate_request -------------------------------------------------


def test_translate_request_uses_model_role_for_assistant_messages() -> None:
    request = ModelRequest(
        messages=[
            Message(role=Role.user, content="hi"),
            Message(role=Role.assistant, content="hello"),
        ],
        model="gemini-x",
    )

    kwargs = translate_request(request, types)

    assert kwargs["contents"][0].role == "user"
    assert kwargs["contents"][1].role == "model"


def test_translate_request_moves_system_field_into_config() -> None:
    request = ModelRequest(
        messages=[Message(role=Role.user, content="hi")], model="gemini-x", system="Be concise."
    )

    kwargs = translate_request(request, types)

    assert kwargs["config"].system_instruction == "Be concise."
    # the system prompt is not turned into a content turn
    assert len(kwargs["contents"]) == 1


def test_translate_request_promotes_leading_system_message_into_config() -> None:
    request = ModelRequest(
        messages=[
            Message(role=Role.system, content="Be concise."),
            Message(role=Role.user, content="hi"),
        ],
        model="gemini-x",
    )

    kwargs = translate_request(request, types)

    assert kwargs["config"].system_instruction == "Be concise."
    assert len(kwargs["contents"]) == 1


def test_translate_request_maps_generation_parameters() -> None:
    request = ModelRequest(
        messages=[Message(role=Role.user, content="hi")],
        model="gemini-x",
        temperature=0.3,
        max_output_tokens=256,
        stop_sequences=["END"],
    )

    kwargs = translate_request(request, types)

    assert kwargs["config"].temperature == 0.3
    assert kwargs["config"].max_output_tokens == 256
    assert kwargs["config"].stop_sequences == ["END"]


def test_translate_request_converts_tool_definitions_to_function_declarations() -> None:
    request = ModelRequest(
        messages=[Message(role=Role.user, content="hi")],
        model="gemini-x",
        tools=[
            ToolDefinition(
                name="read_file", description="Reads a file.", input_schema={"type": "object"}
            )
        ],
    )

    kwargs = translate_request(request, types)

    declarations = kwargs["config"].tools[0].function_declarations
    assert declarations[0].name == "read_file"
    assert declarations[0].description == "Reads a file."


def test_translate_request_serializes_assistant_tool_calls_as_function_call_parts() -> None:
    request = ModelRequest(
        messages=[
            Message(role=Role.user, content="read it"),
            Message(
                role=Role.assistant,
                content=None,
                tool_calls=[ToolCall(id="call-1", name="read_file", arguments={"path": "a.txt"})],
            ),
        ],
        model="gemini-x",
    )

    kwargs = translate_request(request, types)

    assistant_content = kwargs["contents"][1]
    assert assistant_content.role == "model"
    assert assistant_content.parts[0].function_call.name == "read_file"
    assert assistant_content.parts[0].function_call.args == {"path": "a.txt"}


def test_translate_request_with_no_optional_fields_omits_config() -> None:
    request = ModelRequest(messages=[Message(role=Role.user, content="hi")], model="gemini-x")

    kwargs = translate_request(request, types)

    assert "config" not in kwargs


# --- translate_response --------------------------------------------------


def test_translate_response_extracts_text_and_usage() -> None:
    response = fake_gemini_response(
        text="Hello there",
        candidates=[
            fake_candidate(
                fake_gemini_content([fake_part(text="Hello there")]), finish_reason="STOP"
            )
        ],
        usage_metadata=fake_usage_metadata(
            prompt_token_count=8, candidates_token_count=4, total_token_count=12
        ),
        model_version="gemini-x",
        response_id="resp-1",
    )

    result = translate_response(response, provider="gemini")

    assert result.content == "Hello there"
    assert result.provider == "gemini"
    assert result.model == "gemini-x"
    assert result.finish_reason == FinishReason.stop
    assert result.usage.input_tokens == 8
    assert result.usage.output_tokens == 4
    assert result.usage.total_tokens == 12
    assert result.request_id == "resp-1"


def test_translate_response_extracts_function_call_as_tool_call() -> None:
    call = fake_function_call("read_file", {"path": "a.txt"})
    response = fake_gemini_response(
        text=None, candidates=[fake_candidate(fake_gemini_content([fake_part(function_call=call)]))]
    )

    result = translate_response(response, provider="gemini")

    assert result.finish_reason == FinishReason.tool_calls
    assert result.tool_calls[0].name == "read_file"
    assert result.tool_calls[0].arguments == {"path": "a.txt"}


def test_translate_response_maps_safety_finish_reason_to_content_filter() -> None:
    response = fake_gemini_response(
        text=None, candidates=[fake_candidate(fake_gemini_content([]), finish_reason="SAFETY")]
    )

    result = translate_response(response, provider="gemini")

    assert result.finish_reason == FinishReason.content_filter


def test_translate_response_maps_max_tokens_finish_reason_to_length() -> None:
    response = fake_gemini_response(
        text="partial",
        candidates=[
            fake_candidate(
                fake_gemini_content([fake_part(text="partial")]), finish_reason="MAX_TOKENS"
            )
        ],
    )

    result = translate_response(response, provider="gemini")

    assert result.finish_reason == FinishReason.length


# --- classify_error --------------------------------------------------


def test_classify_error_maps_gemini_status_codes() -> None:
    assert isinstance(
        classify_error(FakeGeminiAPIError("x", code=401), provider="gemini", model="m"),
        AuthenticationError,
    )
    assert isinstance(
        classify_error(FakeGeminiAPIError("x", code=429), provider="gemini", model="m"),
        RateLimitError,
    )
    assert isinstance(
        classify_error(FakeGeminiAPIError("x", code=404), provider="gemini", model="m"),
        ModelNotFoundError,
    )


def test_classify_error_maps_timeout_by_class_name() -> None:
    error = classify_error(FakeAPITimeoutError("timed out"), provider="gemini", model="m")

    assert isinstance(error, ProviderTimeoutError)


def test_classify_error_preserves_message_and_status_code() -> None:
    error = classify_error(
        FakeGeminiAPIError("quota exceeded", code=429), provider="gemini", model="m"
    )

    assert str(error) == "quota exceeded"
    assert error.status_code == 429
