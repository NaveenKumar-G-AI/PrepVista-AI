"""
PrepVista AI — LLM Service
Abstraction over Groq (primary) and OpenAI (fallback) with automatic failover.
"""

import asyncio
import json
import structlog
from groq import AsyncGroq
from openai import AsyncOpenAI
from app.config import get_settings

logger = structlog.get_logger("prepvista.llm")

# ── Lazy-init clients ────────────────────────────────
_groq_client: AsyncGroq | None = None
_openai_client: AsyncOpenAI | None = None


class LLMError(RuntimeError):
    """A safe diagnostic; never include prompts, provider bodies or credentials."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def llm_error_code(error: Exception) -> str:
    if isinstance(error, LLMError):
        return error.code
    if isinstance(error, (TimeoutError, asyncio.TimeoutError)) or type(error).__name__ == 'APITimeoutError':
        return 'EVALUATION_TIMEOUT'
    status = getattr(error, 'status_code', None)
    if status in (401, 403):
        return 'EVALUATION_AUTH_FAILED'
    if status == 429:
        return 'EVALUATION_RATE_LIMITED'
    if status == 404:
        return 'EVALUATION_MODEL_UNAVAILABLE'
    if status in (400, 422):
        return 'EVALUATION_REQUEST_REJECTED'
    return 'EVALUATION_PROVIDER_FAILED'


def _completion_text(response) -> str:
    if not response.choices:
        raise LLMError('EVALUATION_EMPTY_RESPONSE')
    choice = response.choices[0]
    if choice.finish_reason == 'length':
        raise LLMError('EVALUATION_TRUNCATED')
    content = choice.message.content
    if not isinstance(content, str) or not content.strip():
        raise LLMError('EVALUATION_EMPTY_RESPONSE')
    return content.strip()


def _get_groq() -> AsyncGroq:
    global _groq_client
    if not _groq_client:
        # The application owns bounded retries; do not multiply them in the SDK.
        _groq_client = AsyncGroq(api_key=get_settings().GROQ_API_KEY, max_retries=0)
    return _groq_client


def _get_openai() -> AsyncOpenAI:
    global _openai_client
    if not _openai_client:
        _openai_client = AsyncOpenAI(api_key=get_settings().OPENAI_API_KEY)
    return _openai_client


async def call_groq(
    messages: list[dict],
    temperature: float = 0.4,
    json_mode: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    timeout: float = 15.0,
) -> str:
    """Call Groq API (primary provider)."""
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        raise LLMError('EVALUATION_NOT_CONFIGURED')
    kwargs = {
        "model": model or settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    client = _get_groq()
    response = await asyncio.wait_for(
        client.chat.completions.create(**kwargs),
        timeout=timeout,
    )
    return _completion_text(response)


async def call_openai(
    messages: list[dict],
    temperature: float = 0.4,
    json_mode: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    timeout: float = 20.0,
) -> str:
    """Call OpenAI API (fallback provider)."""
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OpenAI API key not configured for fallback.")

    kwargs = {
        "model": model or settings.OPENAI_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    client = _get_openai()
    response = await asyncio.wait_for(
        client.chat.completions.create(**kwargs),
        timeout=timeout,
    )
    return _completion_text(response)


async def call_llm(
    messages: list[dict],
    temperature: float = 0.4,
    json_mode: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    retries: int = 2,
    timeout: float | None = None,
    fallback_timeout: float | None = None,
    retry_delay: float = 0.35,
    allow_provider_fallback: bool = True,
) -> str:
    """
    Call LLM with automatic Groq → OpenAI fallback.
    Retries on transient failures before falling back.
    """
    settings = get_settings()

    # Try Groq first
    primary_timeout = timeout or settings.DEFAULT_LLM_TIMEOUT
    backup_timeout = fallback_timeout or max(primary_timeout, 12.0)

    failure_code = 'EVALUATION_PROVIDER_FAILED'
    for attempt in range(max(1, retries)):
        try:
            result = await call_groq(messages, temperature, json_mode, model, max_tokens, primary_timeout)
            return result
        except Exception as e:
            failure_code = llm_error_code(e)
            logger.warning("groq_call_failed", attempt=attempt + 1, error_code=failure_code)
            if failure_code in {'EVALUATION_NOT_CONFIGURED', 'EVALUATION_AUTH_FAILED', 'EVALUATION_MODEL_UNAVAILABLE', 'EVALUATION_REQUEST_REJECTED'}:
                break
            if attempt < retries - 1:
                import random
                jittered_delay = retry_delay * (2 ** attempt) + random.uniform(0, 0.3)
                await asyncio.sleep(jittered_delay)

    # Fallback to OpenAI
    if allow_provider_fallback and settings.OPENAI_API_KEY:
        try:
            logger.info("falling_back_to_openai")
            result = await call_openai(
                messages,
                temperature,
                json_mode,
                None,  # A Groq model ID is not an OpenAI model ID.
                max_tokens,
                backup_timeout,
            )
            return result
        except Exception as e:
            failure_code = llm_error_code(e)
            logger.error("openai_fallback_failed", error_code=failure_code)

    raise LLMError(failure_code)


async def call_llm_json(
    messages: list[dict],
    temperature: float = 0.3,
    model: str | None = None,
    max_tokens: int | None = None,
    retries: int = 2,
    timeout: float | None = None,
    fallback_timeout: float | None = None,
    retry_delay: float = 0.35,
    allow_provider_fallback: bool = True,
) -> dict:
    """Call LLM and parse the response as JSON."""
    raw = await call_llm(
        messages,
        temperature,
        json_mode=True,
        model=model,
        max_tokens=max_tokens,
        retries=retries,
        timeout=timeout,
        fallback_timeout=fallback_timeout,
        retry_delay=retry_delay,
        allow_provider_fallback=allow_provider_fallback,
    )
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("llm_json_parse_error", error_code='EVALUATION_INVALID_JSON')
        # Try to extract JSON from the response
        import re
        json_match = re.search(r'\{[\s\S]*\}', raw)
        try:
            if not json_match:
                raise ValueError('No JSON object')
            result = json.loads(json_match.group())
        except ValueError:
            raise LLMError('EVALUATION_INVALID_JSON') from None
    if not isinstance(result, dict):
        raise LLMError('EVALUATION_INVALID_SCHEMA')
    return result
