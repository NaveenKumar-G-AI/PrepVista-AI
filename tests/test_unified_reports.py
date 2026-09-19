from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from uuid import uuid4

import pytest
from app.services.unified_readiness import project
from app.services.unified_reports import export_snapshot, report_document


def test_report_is_deterministic_private_and_preserves_measurement_limits():
    saved = project('backend-engineer', [], [], [{
        'id': str(uuid4()), 'created_at': '2026-09-12T00:00:00+00:00',
        'content': {'passed': 1, 'total': 1, 'explanation': 'private answer', 'observed_time_authority': 'CLIENT_CLAIMED'},
    }], as_of=datetime(2026, 9, 13, tzinfo=timezone.utc))
    saved['calculation_inputs'] = {'code': 'secret-code', 'transcript': 'secret-transcript'}
    saved['email'] = 'private@example.invalid'
    saved['rows'][1]['sources'][0]['provider_prompt'] = 'secret-prompt'
    original = deepcopy(saved)
    sid = uuid4()
    exported = export_snapshot(sid, saved, 'json')
    assert exported == export_snapshot(sid, saved, 'json')
    assert original == saved
    doc = json.loads(exported['content'])
    assert doc['summary']['overall_state'] == 'MORE_EVIDENCE_NEEDED'
    assert doc['summary']['rows'][1]['sources'][0]['authority'] == 'CLIENT_REPORTED'
    assert doc['summary']['rows'][1]['sources'][0]['time_authority'] == 'CLIENT_CLAIMED'
    assert doc['summary']['role_policy_status'] == 'FOUNDATION_ONLY'
    assert not any(value in exported['content'] for value in ('secret-', 'private answer', 'private@example', 'calculation_inputs', 'next_mission'))
    checksum = doc.pop('content_sha256')
    canonical = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    assert checksum == sha256(canonical.encode('utf-8')).hexdigest()


def test_html_report_escapes_values_and_has_no_active_or_remote_content():
    saved = project('GENERAL_SWE', [], [], [], as_of=datetime.now(timezone.utc))
    malicious = '<script>alert(1)</script><img src="https://attacker.invalid">'
    saved['role_label'] = 'বাংলা ' + malicious
    saved['rows'][0]['gap'] = malicious
    saved['rows'][0]['sources'] = [{'id': malicious, 'module': malicious, 'authority': malicious, 'at': malicious, 'href': 'javascript:alert(1)'}]
    exported = export_snapshot(uuid4(), saved, 'html')
    assert '<script' not in exported['content'] and '<img' not in exported['content']
    assert 'javascript:' not in exported['content'] and 'href=' not in exported['content']
    assert '&lt;script&gt;' in exported['content'] and 'বাংলা' in exported['content']
    assert "default-src 'none'" in exported['content']
    assert 'Canonical document SHA-256' in exported['content']


def test_unknown_snapshot_version_cannot_be_silently_reinterpreted():
    with pytest.raises(ValueError, match='Unsupported readiness snapshot version'):
        report_document(uuid4(), {'schema_version': 2, 'rows': []})
