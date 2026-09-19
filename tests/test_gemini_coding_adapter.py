import asyncio
import json
import pytest
import httpx
from app.ai.providers import gemini_adapter as module
from app.ai.types import ModelRequest, Message, Role
from app.ai.errors import ConfigurationError, ProviderUnavailableError


def request(model='gemini-test'):
    return ModelRequest(model=model, messages=[Message(role=Role.user, content='Help with this code')], max_output_tokens=100, temperature=0)


def test_gemini_is_explicitly_unavailable_without_a_key():
    async def run():
        provider = module.GeminiAdapter('')
        assert (await provider.health()).status == 'misconfigured'
        with pytest.raises(ConfigurationError): await provider.generate(request())
    asyncio.run(run())


def test_gemini_keeps_key_in_header_and_preserves_usage_and_zero_temperature(monkeypatch):
    original = httpx.AsyncClient
    def handler(incoming):
        assert 'test-secret' not in str(incoming.url)
        assert incoming.headers['x-goog-api-key'] == 'test-secret'
        assert json.loads(incoming.content)['generationConfig']['temperature'] == 0
        return httpx.Response(200, json={'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': '{"message":"Try a test","nextStep":"Check empty input"}'}]}}], 'usageMetadata': {'promptTokenCount': 20, 'candidatesTokenCount': 10, 'totalTokenCount': 30}})
    monkeypatch.setattr(module.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    result = asyncio.run(module.GeminiAdapter('test-secret').generate(request()))
    assert result.usage.total_tokens == 30
    assert result.provider == 'gemini'


def test_gemini_rejects_traversal_and_redacts_provider_errors(monkeypatch):
    async def run():
        provider = module.GeminiAdapter('test-secret')
        with pytest.raises(ConfigurationError): await provider.generate(request('../other?key=oops'))
        original = httpx.AsyncClient
        monkeypatch.setattr(module.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(lambda _: httpx.Response(500, text='test-secret private upstream error')), **kwargs))
        with pytest.raises(ProviderUnavailableError) as exc: await provider.generate(request())
        assert 'test-secret' not in str(exc.value)
        assert 'private upstream' not in str(exc.value)
    asyncio.run(run())
