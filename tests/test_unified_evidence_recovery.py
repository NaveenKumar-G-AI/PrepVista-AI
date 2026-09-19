import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from uuid import uuid4

import pytest
from scripts import recover_unified_evidence as recovery


def candidate():
    now = datetime.now(timezone.utc)
    return {'schema_version': 1, 'request_id': str(uuid4()), 'target': 'staging-1',
        'target_sha256': 'a' * 64, 'ticket_ref': 'REPAIR-123', 'created_at': now.isoformat(),
        'expires_at': (now + timedelta(minutes=30)).isoformat(),
        'events': [{'id': 1, 'attempts': 5, 'fingerprint': 'b' * 64}]}


@pytest.mark.parametrize('ids', [[], [1, 1], [True], [-1], [0], ['1'], [2**63], list(range(1, 102))])
def test_recovery_selection_is_explicit_unique_and_bounded(ids):
    with pytest.raises(recovery.RecoveryError): recovery.event_ids(ids)


def test_recovery_manifest_is_strict_and_contains_no_execution_command():
    assert recovery.validate_manifest(candidate())
    changes = [{'schema_version': True}, {'extra': 'field'}, {'target': 'postgres://secret'},
        {'ticket_ref': 'student@example.com'}, {'target_sha256': 'x' * 64},
        {'events': [{'id': 1, 'attempts': 4, 'fingerprint': 'a' * 64}]},
        {'events': [{'id': True, 'attempts': 5, 'fingerprint': 'a' * 64}]},
        {'created_at': '2026-09-13T01:00:00'}, {'request_id': 'invalid'},
        {'events': [{'id': 1, 'attempts': 5, 'fingerprint': 'a' * 64, 'code': 'secret'}]}]
    for change in changes:
        with pytest.raises(recovery.RecoveryError): recovery.validate_manifest({**candidate(), **change})
    value = candidate()
    value['expires_at'] = (datetime.fromisoformat(value['created_at']) + timedelta(hours=1)).isoformat()
    with pytest.raises(recovery.RecoveryError): recovery.validate_manifest(value)


def test_recovery_ignores_ambient_application_dsn(monkeypatch):
    monkeypatch.delenv('UNIFIED_RECOVERY_DATABASE_URL', raising=False)
    monkeypatch.setenv('DATABASE_URL', 'postgresql://private:secret@real-host/live')
    async def forbidden(*args, **kwargs): raise AssertionError('Connection must not be opened')
    import asyncpg
    monkeypatch.setattr(asyncpg, 'connect', forbidden)
    with pytest.raises(recovery.RecoveryError, match='EXPLICIT_RECOVERY_DATABASE_URL_REQUIRED'):
        asyncio.run(recovery.run(SimpleNamespace(command='inspect', after_event_id=0)))


def test_manifest_digest_detects_edit_without_claiming_signature():
    value = candidate()
    assert recovery.digest(value) == recovery.digest(deepcopy(value))
    altered = deepcopy(value)
    altered['events'][0]['attempts'] = 6
    assert recovery.digest(value) != recovery.digest(altered)


def test_cli_rejects_raw_input_without_exposing_it(tmp_path):
    path = tmp_path / 'private.json'
    path.write_text('{"private":"do-not-log-student-code"}', encoding='utf-8')
    result = subprocess.run([sys.executable, '-m', 'scripts.recover_unified_evidence', 'apply', '--manifest', str(path), '--target', 'staging-1'],
        capture_output=True, text=True, cwd=Path(__file__).resolve().parents[1], env={k: v for k, v in os.environ.items() if k != 'UNIFIED_RECOVERY_DATABASE_URL'})
    assert result.returncode == 2 and 'INVALID_MANIFEST' in result.stdout
    assert 'do-not-log' not in result.stdout + result.stderr


def test_preview_refuses_overwriting_file_before_database_access(tmp_path, monkeypatch):
    path = tmp_path / 'manifest.json'
    path.write_text('keep this', encoding='utf-8')
    monkeypatch.delenv('UNIFIED_RECOVERY_DATABASE_URL', raising=False)
    with pytest.raises(recovery.RecoveryError, match='OUTPUT_ALREADY_EXISTS'):
        asyncio.run(recovery.run(SimpleNamespace(command='preview', event_ids=[1], output=str(path))))
    assert path.read_text(encoding='utf-8') == 'keep this'
