"""Security tests (spec §Security testing).

Verifies: API keys are never logged, never appear in exception messages or
`repr()`, and provider adapters never require a key just to construct
(only to actually make a call) -- so a misconfigured provider fails at the
point of use with a clean error, not by leaking a key while trying to
report the problem.

Every fake key used below is obviously fake (`fake-...-not-a-real-key`),
per the spec's instruction to make test credentials unmistakably fake.
"""

from __future__ import annotations

import contextlib
import logging

import pytest
from pydantic import SecretStr

from app.ai.errors import ConfigurationError
from app.ai.providers.cerebras import CerebrasProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.groq import GroqProvider
from app.ai.providers.openrouter import OpenRouterProvider
from app.core.config import Settings

_FAKE_KEY = "fake-test-key-not-a-real-credential-000111222"


@pytest.mark.parametrize(
    "provider_cls", [GroqProvider, CerebrasProvider, OpenRouterProvider, GeminiProvider]
)
def test_configuration_error_message_never_contains_the_api_key(provider_cls) -> None:  # type: ignore[no-untyped-def]
    provider = provider_cls(api_key=None)

    with pytest.raises(ConfigurationError) as exc_info:
        provider._ensure_client()  # type: ignore[attr-defined]

    assert _FAKE_KEY not in str(exc_info.value)
    assert "sk-" not in str(exc_info.value)


@pytest.mark.parametrize(
    "provider_cls", [GroqProvider, CerebrasProvider, OpenRouterProvider, GeminiProvider]
)
def test_provider_repr_never_contains_the_api_key(provider_cls) -> None:  # type: ignore[no-untyped-def]
    provider = provider_cls(api_key=SecretStr(_FAKE_KEY))

    assert _FAKE_KEY not in repr(provider)
    assert _FAKE_KEY not in str(provider.__dict__)


def test_ai_settings_mask_provider_keys_in_repr() -> None:
    settings = Settings.model_validate(
        {
            "ai": {
                "GEMINI_API_KEY": _FAKE_KEY,
                "GROQ_API_KEY": _FAKE_KEY,
                "CEREBRAS_API_KEY": _FAKE_KEY,
                "OPENROUTER_API_KEY": _FAKE_KEY,
            }
        }
    )

    assert _FAKE_KEY not in repr(settings.ai)
    assert _FAKE_KEY not in str(settings.ai)


def test_configuration_error_does_not_log_the_api_key(caplog: pytest.LogCaptureFixture) -> None:
    provider = GroqProvider(api_key=None)

    with caplog.at_level(logging.DEBUG), contextlib.suppress(ConfigurationError):
        provider._ensure_client()  # type: ignore[attr-defined]

    for record in caplog.records:
        assert _FAKE_KEY not in record.getMessage()


def test_constructing_a_provider_does_not_require_an_api_key() -> None:
    """Constructing a provider (e.g. at registry build time) must never
    require credentials -- only calling generate()/stream()/health() with
    a missing key should raise, so an unconfigured provider doesn't crash
    application startup."""
    for provider_cls in (GroqProvider, CerebrasProvider, OpenRouterProvider, GeminiProvider):
        provider = provider_cls(api_key=None)
        assert provider.name
