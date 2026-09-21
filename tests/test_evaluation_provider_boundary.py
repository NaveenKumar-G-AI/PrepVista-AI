"""Exercise real SDK serialization -> JSON -> rubric, without live credentials."""
import asyncio
import json
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from groq import AsyncGroq

from app.services import llm, evaluator_scoring
from app.services.prompts_eval import build_per_question_eval_prompt


ANSWER = 'I traced the API request, reproduced the database timeout, added an index and tested the same query again.'


def evaluation_payload(plan):
    fields = ['specificity_score', 'structure_score', 'communication_score']
    fields += ['question_match_score', 'technical_accuracy_score'] if plan == 'pro' else ['relevance_score', 'depth_score' if plan == 'career' else 'clarity_score']
    return {**{field: 1.5 for field in fields}, 'answer_status': 'Strong',
            'what_worked': 'You explained the change you made.',
            'what_was_missing': 'The actual before and after measurements were not provided.',
            'how_to_improve': 'Add the measured query time only if you recorded it.',
            'why_score': 'The answer describes a specific investigation with limited outcome evidence.'}


def install_transport(monkeypatch, handler):
    settings = SimpleNamespace(GROQ_API_KEY='test-only', GROQ_MODEL='question-model',
        GROQ_EVAL_MODEL='evaluation-model', OPENAI_API_KEY='must-not-be-used', DEFAULT_LLM_TIMEOUT=15,
        INTERVIEW_EVALUATION_TIMEOUT_SECONDS=35, INTERVIEW_EVALUATION_MAX_TOKENS=1800,
        BETTER_ANSWER_REWRITE_ENABLED=True)
    client = AsyncGroq(api_key='test-only', max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(llm, '_groq_client', client)
    monkeypatch.setattr(llm, 'get_settings', lambda: settings)
    monkeypatch.setattr(evaluator_scoring, 'get_settings', lambda: settings)
    fallback = AsyncMock(side_effect=AssertionError('OpenAI must not be called'))
    monkeypatch.setattr(llm, 'call_openai', fallback)
    return client, fallback


def response(content, reason='stop'):
    return httpx.Response(200, json={'id': 'fixture', 'object': 'chat.completion',
        'created': 1, 'model': 'evaluation-model', 'choices': [
            {'index': 0, 'finish_reason': reason, 'message': {'role': 'assistant', 'content': content}}]})


@pytest.mark.parametrize('plan', ['free', 'pro', 'career'])
def test_sdk_request_uses_evaluation_model_and_full_response_budget(monkeypatch, plan):
    requests = []
    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        assert body['model'] == 'evaluation-model'
        assert body['max_tokens'] == 1800
        assert body['response_format'] == {'type': 'json_object'}
        return response(json.dumps(evaluation_payload(plan)))
    client, fallback = install_transport(monkeypatch, handler)
    async def run():
        try:
            return await evaluator_scoring._evaluate_question_core(
                'How did you investigate the timeout?', ANSWER, ANSWER, '{}', 'technical_depth', plan, strict_evidence=True)
        finally:
            await client.close()
    result = asyncio.run(run())
    assert result['score'] == 7.5
    assert result['raw_answer'] == ANSWER
    assert len(requests) == 1  # No redundant rewrite or hidden provider fallback.
    fallback.assert_not_called()


@pytest.mark.parametrize('kind,expected', [
    ('timeout', 'EVALUATION_TIMEOUT'), (401, 'EVALUATION_AUTH_FAILED'),
    (429, 'EVALUATION_RATE_LIMITED'), (404, 'EVALUATION_MODEL_UNAVAILABLE'),
    (400, 'EVALUATION_REQUEST_REJECTED'), (503, 'EVALUATION_PROVIDER_FAILED'),
    ('truncated', 'EVALUATION_TRUNCATED'), ('json', 'EVALUATION_INVALID_JSON'),
    ('array', 'EVALUATION_INVALID_SCHEMA'), ('missing_scores', 'EVALUATION_INVALID_SCHEMA'),
    ('empty', 'EVALUATION_EMPTY_RESPONSE')])
def test_sdk_failures_remain_unavailable_with_safe_diagnostics(monkeypatch, kind, expected, capsys):
    count = 0
    def handler(request):
        nonlocal count
        count += 1
        if kind == 'timeout':
            raise httpx.ReadTimeout('private answer and credentials', request=request)
        if isinstance(kind, int):
            return httpx.Response(kind, json={'error': {'message': 'private answer and credentials'}})
        if kind == 'truncated':
            return response(json.dumps(evaluation_payload('career')), 'length')
        return response({'json': 'private answer and credentials {', 'array': '[]',
                         'missing_scores': '{}', 'empty': ''}[kind])
    client, fallback = install_transport(monkeypatch, handler)
    async def run():
        try:
            return await evaluator_scoring._evaluate_question_core(
                'How did you investigate the timeout?', ANSWER, ANSWER, '{}', 'technical_depth', 'career', strict_evidence=True)
        finally:
            await client.close()
    result = asyncio.run(run())
    assert result == {'evaluation_status': 'unavailable', 'error_code': expected}
    assert count == 1  # Queue retries, not layered SDK retries.
    assert 'private answer and credentials' not in capsys.readouterr().out
    fallback.assert_not_called()


@pytest.mark.parametrize('plan', ['free', 'pro', 'career'])
def test_prompt_contract_is_valid_json_without_duplicate_fields(plan):
    prompt = build_per_question_eval_prompt('What did you build?', ANSWER, '{}', 'project_ownership', plan)
    example = prompt.split('Return EXACTLY this JSON:')[1].strip()
    # Convert numeric/boolean placeholders, leaving quoted descriptive strings intact.
    example = example.replace('<0-2>', '1').replace('<true|false>', 'false')
    keys = []
    def unique(pairs):
        names = [key for key, _ in pairs]
        assert len(names) == len(set(names))
        keys.extend(names)
        return dict(pairs)
    json.loads(example, object_pairs_hook=unique)
    assert keys.count('specificity_score') == 1


def test_missing_provider_configuration_is_diagnostic(monkeypatch):
    monkeypatch.setattr(llm, 'get_settings', lambda: SimpleNamespace(GROQ_API_KEY=''))
    with pytest.raises(llm.LLMError, match='EVALUATION_NOT_CONFIGURED'):
        asyncio.run(llm.call_groq([]))
