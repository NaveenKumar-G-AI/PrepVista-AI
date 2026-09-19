from copy import deepcopy
from hashlib import sha256
from types import SimpleNamespace
from uuid import uuid4
import asyncio
import pytest

from app.services.coding_validation import configured, validate_result, tick
from app.services.coding_validation_suites import suite_for


def config(**changes):
    return SimpleNamespace(CODING_TRUSTED_VALIDATION_ENABLED=True, CODING_RUNNER_URL='https://runner.example.invalid',
        CODING_RUNNER_TOKEN='x' * 40, CODING_RUNNER_QUALIFICATION_ID='review-fixture-v1',
        CODING_RUNNER_IMAGE='registry.invalid/runner@sha256:' + 'a' * 64, **changes)


def request_result():
    request = {'schema_version': 1, 'job_id': str(uuid4()), 'lease_token': str(uuid4()),
        'code_sha256': sha256(b'code').hexdigest(), 'suite_sha256': 'a' * 64,
        'runner_image': config().CODING_RUNNER_IMAGE, 'tests': [{'id': 'case-0'}, {'id': 'case-1'}]}
    result = {k: v for k, v in request.items() if k != 'tests'}
    result.update(passed=1, checks=[{'id': 'case-0', 'status': 'PASSED'}, {'id': 'case-1', 'status': 'WRONG_ANSWER'}])
    return request, result


def test_runner_configuration_cannot_enable_via_a_flag_alone():
    assert not configured(SimpleNamespace(CODING_TRUSTED_VALIDATION_ENABLED=True))
    assert configured(config())
    for field, invalid in [('CODING_RUNNER_URL', 'http://runner.invalid'), ('CODING_RUNNER_URL', 'https://user:pass@runner.invalid'),
        ('CODING_RUNNER_URL', 'https://runner.invalid/?redirect=secret'), ('CODING_RUNNER_TOKEN', 'short'),
        ('CODING_RUNNER_IMAGE', 'node:latest'), ('CODING_RUNNER_QUALIFICATION_ID', '')]:
        settings = config(); setattr(settings, field, invalid)
        assert not configured(settings)


@pytest.mark.parametrize('field', ['job_id', 'lease_token', 'code_sha256', 'suite_sha256', 'runner_image'])
def test_cross_job_stale_or_substituted_runner_receipts_are_rejected(field):
    request, result = request_result()
    assert validate_result(request, result) == result
    result[field] = 'other-value'
    with pytest.raises(ValueError): validate_result(request, result)


def test_runner_cannot_omit_checks_forge_counts_or_inject_extra_data():
    request, result = request_result()
    for mutation in ({'passed': 2}, {'passed': True}, {'checks': result['checks'][:1]},
            {'checks': list(reversed(result['checks']))}, {'raw_code': 'sensitive'}):
        with pytest.raises(ValueError): validate_result(request, {**result, **mutation})


def test_suites_are_versioned_isolated_copies_and_unsupported_languages_stay_unknown():
    content = {'challenge_id': 'search-insert-position', 'challenge_version': 1, 'language': 'javascript'}
    suite = suite_for(content); original = deepcopy(suite)
    suite['tests'].clear()
    assert suite_for(content) == original
    assert suite_for({**content, 'challenge_version': 2}) is None
    assert suite_for({**content, 'language': 'python'}) is None


def test_disabled_dispatcher_never_opens_database(monkeypatch):
    from app.services import coding_validation
    monkeypatch.setattr(coding_validation, 'get_settings', lambda: SimpleNamespace())
    def unexpected(): raise AssertionError('Database was opened')
    monkeypatch.setattr(coding_validation, 'DatabaseConnection', unexpected)
    assert asyncio.run(tick()) == {'enabled': False}


@pytest.mark.parametrize('mode', ['valid', 'redirect', 'oversize', 'forged'])
def test_remote_transport_is_fixed_bounded_and_checks_the_authenticated_receipt(monkeypatch, mode):
    import httpx
    from app.services import coding_validation
    request, result = request_result()
    settings = config()
    monkeypatch.setattr(coding_validation, 'get_settings', lambda: settings)
    calls = []
    def handler(outgoing):
        calls.append(outgoing)
        assert str(outgoing.url) == 'https://runner.example.invalid/v1/validate'
        assert outgoing.headers['authorization'] == 'Bearer ' + settings.CODING_RUNNER_TOKEN
        if mode == 'redirect': return httpx.Response(307, headers={'location': 'https://unrelated.invalid'})
        if mode == 'oversize': return httpx.Response(200, content=b'x' * 16001)
        return httpx.Response(200, json={**result, **({'job_id': str(uuid4())} if mode == 'forged' else {})})
    original = httpx.AsyncClient
    def client(**kwargs):
        assert kwargs['trust_env'] is False and kwargs['follow_redirects'] is False
        return original(**kwargs, transport=httpx.MockTransport(handler))
    monkeypatch.setattr(coding_validation.httpx, 'AsyncClient', client)
    if mode == 'valid': assert asyncio.run(coding_validation.run_remote(request)) == result
    else:
        with pytest.raises(ValueError): asyncio.run(coding_validation.run_remote(request))
    assert len(calls) == 1
