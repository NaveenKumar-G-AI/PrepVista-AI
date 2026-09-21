import httpx
import pytest

from app.services.ai.base import AIProviderError
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.groq_provider import GroqProvider
from app.services.ai.provider_factory import get_configured_provider


@pytest.fixture(autouse=True)
def _clear_ai_env(monkeypatch):
    for key in ("AI_PROVIDER", "ANTHROPIC_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(key, raising=False)


def test_no_credentials_configured_returns_none():
    assert get_configured_provider() is None


def test_priority_prefers_anthropic_over_groq_and_gemini(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    provider = get_configured_provider()
    assert provider.name == "anthropic"


def test_falls_back_to_groq_if_only_groq_configured(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    provider = get_configured_provider()
    assert provider.name == "groq"


def test_falls_back_to_gemini_if_only_gemini_configured(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "AIza-test")
    provider = get_configured_provider()
    assert provider.name == "gemini"


def test_explicit_override_forces_provider_choice(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("GEMINI_API_KEY", "AIza-test")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    provider = get_configured_provider()
    assert provider.name == "gemini"


def test_explicit_override_with_no_matching_key_returns_none(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "groq")  # forced, but GROQ_API_KEY not set
    assert get_configured_provider() is None


class _FakeResponse:
    def __init__(self, json_body: dict, status_code: int = 200):
        self._json_body = json_body
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json_body


def test_groq_provider_builds_openai_compatible_request_and_parses_response(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _FakeResponse({
            "choices": [{"message": {"content": '{"observations": ["ok"], "confidence": "HIGH"}'}}]
        })

    monkeypatch.setattr("app.services.ai.groq_provider.httpx.post", fake_post)
    provider = GroqProvider()
    monkeypatch.setattr(provider, "api_key", "gsk-fake")

    result = provider.complete_json("system prompt", {"challenge": {}, "evidence": {}, "submission": {}}, "{}")

    assert captured["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer gsk-fake"
    assert captured["json"]["messages"][0]["role"] == "system"
    assert result == {"observations": ["ok"], "confidence": "HIGH"}


def test_groq_provider_raises_on_malformed_response_shape(monkeypatch):
    def fake_post(url, headers=None, json=None, timeout=None):
        return _FakeResponse({"unexpected": "shape"})

    monkeypatch.setattr("app.services.ai.groq_provider.httpx.post", fake_post)
    provider = GroqProvider()
    monkeypatch.setattr(provider, "api_key", "gsk-fake")

    with pytest.raises(AIProviderError):
        provider.complete_json("system", {"challenge": {}, "evidence": {}, "submission": {}}, "{}")


def test_gemini_provider_builds_generatecontent_request_and_parses_response(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _FakeResponse({
            "candidates": [{"content": {"parts": [{"text": '{"observations": ["ok"]}'}]}}]
        })

    monkeypatch.setattr("app.services.ai.gemini_provider.httpx.post", fake_post)
    provider = GeminiProvider()
    monkeypatch.setattr(provider, "api_key", "AIza-fake")

    result = provider.complete_json("system prompt", {"challenge": {}, "evidence": {}, "submission": {}}, "{}")

    assert "generateContent" in captured["url"]
    assert captured["headers"]["x-goog-api-key"] == "AIza-fake"
    assert captured["json"]["system_instruction"]["parts"][0]["text"].startswith("system prompt")
    assert result == {"observations": ["ok"]}


def test_gemini_provider_raises_on_malformed_response_shape(monkeypatch):
    def fake_post(url, headers=None, json=None, timeout=None):
        return _FakeResponse({"unexpected": "shape"})

    monkeypatch.setattr("app.services.ai.gemini_provider.httpx.post", fake_post)
    provider = GeminiProvider()
    monkeypatch.setattr(provider, "api_key", "AIza-fake")

    with pytest.raises(AIProviderError):
        provider.complete_json("system", {"challenge": {}, "evidence": {}, "submission": {}}, "{}")


def test_groq_and_gemini_without_key_raise_before_any_network_call():
    with pytest.raises(AIProviderError):
        GroqProvider().complete_json("s", {}, "{}")
    with pytest.raises(AIProviderError):
        GeminiProvider().complete_json("s", {}, "{}")
