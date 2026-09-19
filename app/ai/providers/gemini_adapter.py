"""Gemini REST adapter. Keys remain in headers, never URLs or client payloads."""
import re
import httpx
from app.ai.provider import ModelProvider, ProviderHealth, ProviderHealthStatus
from app.ai.types import ModelResponse, Usage, FinishReason, CompletedEvent
from app.ai.errors import ConfigurationError, ProviderUnavailableError


class GeminiAdapter(ModelProvider):
    name = 'gemini'

    def __init__(self, api_key):
        self._api_key = api_key

    async def generate(self, request):
        if not self._api_key or not re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}', request.model):
            raise ConfigurationError('Gemini key or model is not configured.', provider=self.name)
        body = {'contents': [{'role': 'model' if m.role.value == 'assistant' else 'user', 'parts': [{'text': m.content or ''}]} for m in request.messages],
                'generationConfig': {'maxOutputTokens': request.max_output_tokens or 1800, 'temperature': request.temperature if request.temperature is not None else 0.2, 'responseMimeType': 'application/json'}}
        if request.system:
            body['systemInstruction'] = {'parts': [{'text': request.system}]}
        try:
            async with httpx.AsyncClient(timeout=request.timeout_seconds or 30, follow_redirects=False) as client:
                response = await client.post(f'https://generativelanguage.googleapis.com/v1beta/models/{request.model}:generateContent', headers={'x-goog-api-key': self._api_key}, json=body)
                response.raise_for_status()
                data = response.json()
            candidate = data['candidates'][0]
            if candidate.get('finishReason') != 'STOP':
                raise ValueError('Incomplete response')
            content = ''.join(p.get('text', '') for p in candidate['content']['parts'])
            usage = data.get('usageMetadata', {})
            return ModelResponse(content=content, provider=self.name, model=request.model, finish_reason=FinishReason.stop,
                usage=Usage(input_tokens=usage.get('promptTokenCount'), output_tokens=usage.get('candidatesTokenCount'), total_tokens=usage.get('totalTokenCount')))
        except Exception:
            raise ProviderUnavailableError('Gemini could not complete the request.', provider=self.name) from None

    async def stream(self, request):
        yield CompletedEvent(response=await self.generate(request))

    async def health(self):
        return ProviderHealth(provider=self.name, status=ProviderHealthStatus.unknown if self._api_key else ProviderHealthStatus.misconfigured,
            detail='Configured; not probed.' if self._api_key else 'GEMINI_API_KEY is not configured.')
