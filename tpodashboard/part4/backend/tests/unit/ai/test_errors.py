"""Tests for the normalized provider-independent exception hierarchy."""

from __future__ import annotations

from app.ai.errors import (
    AuthenticationError,
    ConfigurationError,
    InvalidRequestError,
    ModelNotFoundError,
    ProviderError,
    ProviderNotRegisteredError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    RateLimitError,
)


def test_provider_error_carries_diagnostic_metadata() -> None:
    error = ProviderError(
        "boom", provider="groq", model="llama-x", status_code=500, provider_request_id="req-1"
    )

    assert error.provider == "groq"
    assert error.model == "llama-x"
    assert error.status_code == 500
    assert error.provider_request_id == "req-1"
    assert str(error) == "boom"


def test_default_retryable_flags_match_error_semantics() -> None:
    assert RateLimitError("x", provider="p").retryable is True
    assert ProviderTimeoutError("x", provider="p").retryable is True
    assert ProviderUnavailableError("x", provider="p").retryable is True
    assert AuthenticationError("x", provider="p").retryable is False
    assert InvalidRequestError("x", provider="p").retryable is False
    assert ModelNotFoundError("x", provider="p").retryable is False


def test_retryable_flag_can_be_overridden_explicitly() -> None:
    error = AuthenticationError("x", provider="p", retryable=True)

    assert error.retryable is True


def test_to_info_produces_serializable_summary_without_leaking_extra_fields() -> None:
    error = RateLimitError("slow down", provider="groq", model="m", status_code=429)

    info = error.to_info()

    assert info.code == "rate_limit_error"
    assert info.message == "slow down"
    assert info.provider == "groq"
    assert info.status_code == 429
    assert info.retryable is True


def test_each_error_subclass_has_a_stable_machine_readable_code() -> None:
    codes = {
        AuthenticationError: "authentication_error",
        RateLimitError: "rate_limit_error",
        ProviderTimeoutError: "timeout_error",
        InvalidRequestError: "invalid_request_error",
        ModelNotFoundError: "model_not_found_error",
        ProviderUnavailableError: "provider_unavailable_error",
        ConfigurationError: "configuration_error",
    }
    for cls, expected_code in codes.items():
        assert cls("x", provider="p").code == expected_code


def test_provider_not_registered_error_lists_available_providers() -> None:
    error = ProviderNotRegisteredError("bogus", available=["mock", "groq"])

    assert "bogus" in str(error)
    assert "groq" in str(error)
    assert "mock" in str(error)
    assert error.name == "bogus"
    assert error.available == ["mock", "groq"]


def test_provider_not_registered_error_handles_empty_registry() -> None:
    error = ProviderNotRegisteredError("bogus", available=[])

    assert "(none registered)" in str(error)
