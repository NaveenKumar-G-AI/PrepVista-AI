"""Pure historical snapshot replay. No DB connection, app config or grade writes."""
from datetime import datetime, timezone
import json
import re
from uuid import UUID

from app.services.coding_contracts import digest
from app.services.unified_readiness import project, project_v2

MAX_SNAPSHOT_BYTES = 2_000_000
POLICIES = {'practice-evidence-v1', 'practice-evidence-v2'}


def verify_record(record):
    """Return bounded findings; neither a content signature nor qualification."""
    result = {'snapshot_id': None, 'reproducible': False, 'issues': [], 'ledger_checked': False,
              'assessment_qualified': False, 'release_authorized': False}
    try:
        identifier = str(UUID(str(record['id'])))
        result['snapshot_id'] = identifier
        policy = record['policy_version']
        if policy not in POLICIES:
            result.update(reproducible=None, issues=['POLICY_VERSION_UNSUPPORTED'])
            return result
        payload = record['snapshot']
        if isinstance(payload, str):
            if len(payload.encode('utf-8')) > MAX_SNAPSHOT_BYTES: raise ValueError()
            payload = json.loads(payload)
        if not isinstance(payload, dict) or len(json.dumps(payload).encode()) > MAX_SNAPSHOT_BYTES: raise ValueError()
        inputs = payload['calculation_inputs']
        expected_keys = {'events', 'sessions', 'artifacts', 'as_of'} | ({'validations'} if policy.endswith('v2') else set())
        if not isinstance(inputs, dict) or set(inputs) != expected_keys: raise ValueError()
        for name in expected_keys - {'as_of'}:
            if not isinstance(inputs[name], list) or len(inputs[name]) > 500: raise ValueError()
        if not isinstance(inputs['as_of'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', inputs['as_of']): raise ValueError()
        when = datetime.fromisoformat(inputs['as_of']).replace(tzinfo=timezone.utc)
        events = inputs['events']
        if sum(len(inputs[name]) for name in ('artifacts', 'sessions', 'validations') if name in inputs) > len(events): raise ValueError()
        if len({e['id'] for e in events}) != len(events): raise ValueError()
        for event in events:
            if set(event) != {'id', 'adapter_version', 'source_version'}: raise ValueError()
            if any(type(event[key]) is not int or event[key] <= 0 for key in event): raise ValueError()
            if event['adapter_version'] != 1:
                result.update(reproducible=None, issues=['ADAPTER_VERSION_UNSUPPORTED'])
                return result
        window = payload['evidence_window']
        if (set(window) != {'limit', 'included', 'older_evidence_excluded'} or type(window['limit']) is not int
                or window['limit'] != 500 or type(window['included']) is not int or window['included'] != len(events)
                or type(window['older_evidence_excluded']) is not bool): raise ValueError()
        if not isinstance(record['role'], str) or not 1 <= len(record['role']) <= 160: raise ValueError()
        kwargs = {key: inputs[key] for key in ('events', 'sessions', 'artifacts')}
        if policy.endswith('v2'): kwargs['validations'] = inputs['validations']
        replay = (project_v2 if policy.endswith('v2') else project)(record['role'], **kwargs, as_of=when)
        fingerprint = digest({'policy': policy, 'role': record['role'], **kwargs, 'day': inputs['as_of']})
        result['input_digest_matches'] = fingerprint == record['input_digest']
        if not result['input_digest_matches']: result['issues'].append('INPUT_DIGEST_MISMATCH')
        if type(record['watermark']) is not int or record['watermark'] != replay['watermark']:
            result['issues'].append('WATERMARK_MISMATCH')
        replay.update(calculation_inputs=inputs, evidence_window=window)
        # Compare full payload, including authority/confidence labels, sources and
        # proposed mission, not just overall state or a subset of numeric fields.
        result['payload_matches'] = digest(replay) == digest(payload)
        if not result['payload_matches']: result['issues'].append('SNAPSHOT_PAYLOAD_MISMATCH')
        result['reproducible'] = not result['issues']
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        result['issues'].append('SNAPSHOT_INPUT_INVALID_OR_OVERSIZED')
    return result
