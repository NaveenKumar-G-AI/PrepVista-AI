import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.services.coding_contracts import digest
from app.services.readiness_snapshot_verification import verify_record
from app.services.unified_readiness import project, project_v2
from scripts import verify_readiness_snapshots as verifier


def sample(policy='practice-evidence-v2'):
    day = '2026-09-14'
    artifact = {'id': str(uuid4()), 'created_at': '2026-09-13T00:00:00+00:00',
        'content': {'challenge_id': 'task', 'passed': 0, 'total': 1, 'explanation': 'recorded'}}
    inputs = {'events': [{'id': 1, 'adapter_version': 1, 'source_version': 1}],
              'artifacts': [artifact], 'sessions': [], 'as_of': day}
    if policy.endswith('v2'): inputs['validations'] = []
    kwargs = {key: value for key, value in inputs.items() if key != 'as_of'}
    payload = (project_v2 if policy.endswith('v2') else project)('GENERAL_SWE', **kwargs, as_of=datetime(2026,9,14,tzinfo=timezone.utc))
    payload.update(calculation_inputs=inputs, evidence_window={'limit': 500, 'included': 1, 'older_evidence_excluded': False})
    return {'id': str(uuid4()), 'role': 'GENERAL_SWE', 'policy_version': policy, 'watermark': 1,
            'input_digest': digest({'policy': policy, 'role': 'GENERAL_SWE', **kwargs, 'day': day}), 'snapshot': payload}


@pytest.mark.parametrize('policy', ['practice-evidence-v1', 'practice-evidence-v2'])
def test_historical_replay_never_qualifies_assessment(policy):
    record = sample(policy)
    row = next(row for row in record['snapshot']['rows'] if row['key'] == 'correctness')
    assert row['state'] == 'DEVELOPING' and record['snapshot']['overall_state'] == 'MORE_EVIDENCE_NEEDED'
    result = verify_record(record)
    assert result['reproducible'] is True and result['issues'] == []
    assert not result['ledger_checked'] and not result['assessment_qualified'] and not result['release_authorized']
    assert record['snapshot']['calculation_inputs']['artifacts'][0]['id'] not in json.dumps(result)


@pytest.mark.parametrize('field,value', [('overall_state','DEMONSTRATED_IN_PRACTICE'), ('note','invented private note'),
                                       ('data_health','UNAVAILABLE'), ('policy_version','practice-evidence-v1')])
def test_replay_checks_full_saved_payload(field, value):
    record = sample()
    record['snapshot'][field] = value
    result = verify_record(record)
    assert not result['reproducible'] and 'SNAPSHOT_PAYLOAD_MISMATCH' in result['issues']
    assert 'invented private note' not in json.dumps(result)


def test_input_digest_and_watermark_are_independent_checks():
    record = sample()
    record['input_digest'] = 'f' * 64
    record['watermark'] = 2
    result = verify_record(record)
    assert set(result['issues']) == {'INPUT_DIGEST_MISMATCH', 'WATERMARK_MISMATCH'}


def test_unknown_policy_or_adapter_is_unavailable_instead_of_false_grade():
    record = sample()
    record['policy_version'] = 'future-private-policy'
    result = verify_record(record)
    assert result['reproducible'] is None and result['issues'] == ['POLICY_VERSION_UNSUPPORTED']
    assert 'future-private-policy' not in json.dumps(result)
    record = sample()
    record['snapshot']['calculation_inputs']['events'][0]['adapter_version'] = 2
    assert verify_record(record)['issues'] == ['ADAPTER_VERSION_UNSUPPORTED']


def test_version_two_replay_does_not_inherit_future_policy_label(monkeypatch):
    from app.services import unified_readiness
    record = sample()
    monkeypatch.setattr(unified_readiness, 'POLICY_VERSION', 'practice-evidence-v3')
    assert verify_record(record)['reproducible'] is True


def test_invalid_or_oversized_inputs_do_not_escape_into_reports():
    for mutation in ('missing', 'duplicate', 'boolean', 'window', 'date', 'large'):
        record = sample()
        inputs = record['snapshot']['calculation_inputs']
        if mutation == 'missing': del inputs['artifacts']
        elif mutation == 'duplicate': inputs['events'] *= 2
        elif mutation == 'boolean': inputs['events'][0]['id'] = True
        elif mutation == 'window': record['snapshot']['evidence_window']['included'] = 100
        elif mutation == 'date': inputs['as_of'] = '2026-09-14T13:00:00Z'
        else: record['snapshot']['private'] = 'private-student-source-' * 100000
        result = verify_record(record)
        assert not result['reproducible'] and 'SNAPSHOT_INPUT_INVALID_OR_OVERSIZED' in result['issues']
        assert 'private-student-source' not in json.dumps(result)


@pytest.mark.parametrize('ids', [[], ['invalid'], [str(uuid4())] * 2, [str(uuid4()) for _ in range(11)]])
def test_selection_requires_unique_bounded_exact_ids(ids):
    with pytest.raises(verifier.VerificationError): verifier.snapshot_ids(ids)


def test_offline_mode_never_connects_even_with_database_environment(tmp_path, monkeypatch):
    import asyncpg
    async def forbidden(*args, **kwargs): raise AssertionError('Unexpected connection')
    monkeypatch.setattr(asyncpg, 'connect', forbidden)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://private:secret@production/live')
    monkeypatch.setenv('UNIFIED_VERIFICATION_DATABASE_URL', 'postgresql://private:secret@production/live')
    path = tmp_path / 'fixture.json'
    path.write_text(json.dumps({'schema_version': 1, 'snapshots': [sample()]}), encoding='utf-8')
    report, code = asyncio.run(verifier.run(SimpleNamespace(snapshot_file=str(path), snapshot_ids=None)))
    assert code == 0 and report['checks_passed'] and not report['ledger_checked']
    assert 'secret' not in json.dumps(report)


def test_database_mode_requires_its_own_dsn(monkeypatch):
    monkeypatch.delenv('UNIFIED_VERIFICATION_DATABASE_URL', raising=False)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://private:secret@production/live')
    with pytest.raises(verifier.VerificationError, match='EXPLICIT_VERIFICATION_DATABASE_URL_REQUIRED'):
        asyncio.run(verifier.run(SimpleNamespace(snapshot_file=None, snapshot_ids=[str(uuid4())])))


def test_cli_reports_failure_without_logging_private_input(tmp_path):
    path = tmp_path / 'fixture.json'
    record = sample()
    record['snapshot']['rows'][0]['gap'] = 'private-content-must-not-leak'
    path.write_text(json.dumps({'schema_version': 1, 'snapshots': [record]}), encoding='utf-8')
    run = subprocess.run([sys.executable, '-m', 'scripts.verify_readiness_snapshots', '--snapshot-file', str(path)],
        capture_output=True, text=True, cwd=Path(__file__).resolve().parents[1], env=os.environ.copy())
    assert run.returncode == 2 and 'SNAPSHOT_PAYLOAD_MISMATCH' in run.stdout
    assert 'private-content-must-not-leak' not in run.stdout + run.stderr
