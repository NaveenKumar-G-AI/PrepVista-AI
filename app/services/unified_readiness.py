"""Deterministic preparation snapshot. Missing evidence is never a zero score."""
import json
from datetime import datetime, timezone
from app.services.coding_contracts import digest
from app.services.coding_store import obj
from app.services.unified_evidence import lock_projection_owner

POLICY_VERSION = 'practice-evidence-v2'
ROWS = [
    ('reasoning', 'Problem understanding and reasoning', '/coding/diagnostic'),
    ('correctness', 'Programming and correctness', '/coding'),
    ('debugging', 'Debugging and validation', '/coding/debug'),
    ('ownership', 'Project ownership and decisions', '/coding/projects'),
    ('communication', 'Communication and explanation', '/coding/explain'),
    ('interview', 'Interview judgment and role preparation', '/interview/setup'),
]
ROLE_LABELS = {'GENERAL_SWE': 'Software engineer', 'software-engineer': 'Software engineer', 'backend-engineer': 'Backend engineer', 'frontend-engineer': 'Frontend engineer', 'full-stack-engineer': 'Full-stack engineer', 'ai-engineer': 'AI engineer', 'data-engineer': 'Data engineer', 'devops-engineer': 'DevOps engineer'}


def project(role, events, sessions, artifacts, *, as_of):
    rows = {key: {'key': key, 'label': label, 'state': 'NOT_MEASURED', 'confidence': 'none', 'freshness': 'CURRENT', 'sources': [], 'next_action': path, 'gap': 'Collect relevant evidence for this area.'} for key, label, path in ROWS}
    def add(key, source, gap, *, developing=False):
        row = rows[key]
        if any(s['module'] == source['module'] and s.get('correlation_id', s['id']) == source.get('correlation_id', source['id']) for s in row['sources']):
            return
        if source not in row['sources']:
            row['sources'].append(source)
        row['state'] = 'DEVELOPING' if developing or row['state'] == 'DEVELOPING' else 'INSUFFICIENT_EVIDENCE'
        row['confidence'] = 'limited'; row['gap'] = gap
    for artifact in artifacts:
        content = artifact['content']; link = f"/coding/artifacts/{artifact['id']}"
        source = {'id': artifact['id'], 'module': 'coding', 'authority': 'CLIENT_REPORTED', 'href': link, 'at': artifact['created_at'],
            'correlation_id': content.get('correlation_id', artifact['id']), 'time_authority': content.get('observed_time_authority', 'SERVER_RECEIPT_TIME')}
        if content.get('total') is not None:
            failed = content['passed'] < content['total']
            add('correctness', source, 'Resolve the failing practice checks.' if failed else 'Checks passed in the browser. Independent correctness validation is still missing.', developing=failed)
            if failed: add('debugging', source, 'Reproduce a failing case and explain the repair.', developing=True)
        if content.get('explanation', '').strip():
            add('reasoning', source, 'Review the explanation against the actual implementation and constraints.')
            add('ownership', source, 'Explain the saved implementation in an interview; possessing code alone does not establish authorship.')
    for session in sessions:
        source = {'id': session['id'], 'module': 'interview', 'authority': 'INTERVIEW_TEXT_SIGNAL', 'href': f"/report/{session['id']}", 'at': session['created_at']}
        report = session['report']
        evidence = report.get('evidence', [])
        if evidence:
            add('interview', source, 'Collect comparable role-specific examples. These are early text signals.')
            add('communication', source, 'Practise clear explanations supported by actual evidence; delivery is not inferred from text.')
        gaps = {item.get('gap') for item in report.get('top_risks', [])}
        if 'ownership' in gaps: add('ownership', source, 'State your personal responsibility and action.', developing=True)
        if 'reasoning' in gaps: add('reasoning', source, 'Explain why your choice fit the constraints.', developing=True)
        if 'verification' in gaps: add('debugging', source, 'Describe a reproducible verification step.', developing=True)
    for row in rows.values():
        dates = [datetime.fromisoformat(s['at'].replace('Z', '+00:00')) for s in row['sources']]
        if dates and (as_of - max(dates)).days > 90:
            row['freshness'] = 'STALE'; row['gap'] = 'Refresh this practice evidence; it is over 90 days old.'
        row['coverage'] = len({(s['module'], s['id']) for s in row['sources']})
    newest = artifacts[0] if artifacts else None
    mission = {'id': 'discover-coding', 'title': 'Choose a coding problem', 'reason': 'Gather an implementation and its practice results.', 'href': '/coding'}
    if newest:
        content = newest['content']; artifact_id = newest['id']
        linked = any(s.get('artifact_id') == artifact_id for s in sessions)
        if content.get('total') and content['passed'] < content['total']:
            mission = {'id': 'repair-' + artifact_id, 'title': 'Repair a failing practice check', 'reason': 'Your saved implementation still has failing browser checks.', 'href': f'/coding/debug?artifact_id={artifact_id}'}
        elif not content.get('explanation', '').strip():
            mission = {'id': 'explain-' + artifact_id, 'title': 'Explain your implementation', 'reason': 'Your saved artifact needs a decision and verification explanation.', 'href': f'/coding/explain?artifact_id={artifact_id}'}
        elif not linked:
            mission = {'id': 'defend-' + artifact_id, 'title': 'Defend your saved implementation', 'reason': 'Connect your implementation with evidence from a project-defense interview.', 'href': f'/interview/setup?artifact_id={artifact_id}&mode=project_defense'}
        else:
            linked_session = next(s for s in sessions if s.get('artifact_id') == artifact_id)
            mission = {'id': 'repair-answer-' + linked_session['id'], 'title': 'Review and repair an interview answer', 'reason': 'Use the evidence gaps in your report to choose a focused retry.', 'href': '/report/' + linked_session['id']}
    return {'schema_version': 1, 'policy_version': 'practice-evidence-v1', 'role': role,
        'role_label': ROLE_LABELS.get(role, role), 'role_policy_status': 'FOUNDATION_ONLY',
        'overall_state': 'MORE_EVIDENCE_NEEDED', 'rows': list(rows.values()), 'next_mission': mission,
        'note': 'This list describes practice evidence and missing coverage. It is not a hiring probability or proof of unaided performance. Role-specific assessment qualification remains required.',
        'data_health': 'CURRENT', 'as_of': as_of.date().isoformat(), 'watermark': max((e['id'] for e in events), default=0)}


def project_v2(role, events, sessions, artifacts, validations, *, as_of):
    """Add declared server checks; retain V1 replay and abstention semantics."""
    result = project(role, events, sessions, artifacts, as_of=as_of)
    result['policy_version'] = 'practice-evidence-v2'
    rows = {row['key']: row for row in result['rows']}
    seen = set()
    ordered = sorted(validations, key=lambda v: (v['created_at'], v['id']), reverse=True)
    for validation in ordered:
        # Re-running the same implementation and suite is one demonstration.
        key = (validation['correlation_id'], validation['suite_sha256'])
        if key in seen: continue
        seen.add(key)
        failed = validation['passed'] < validation['total']
        source = {'id': validation['id'], 'module': 'coding_validation', 'authority': 'ISOLATED_SERVER_TEST',
            'href': '/readiness/validations/' + validation['id'], 'at': validation['created_at'], 'time_authority': 'SERVER_RECEIPT_TIME',
            'correlation_id': validation['correlation_id'], 'suite_id': validation['suite_id'],
            'suite_sha256': validation['suite_sha256'], 'qualification_id': validation['qualification_id']}
        for name in ('correctness', 'debugging') if failed else ('correctness',):
            row = rows[name]; row['sources'].append(source)
            row['confidence'] = 'limited'
            if failed or row['state'] == 'DEVELOPING':
                row['state'] = 'DEVELOPING'
                row['gap'] = 'Review unresolved failing checks against their saved artifact and suite. Passing another suite does not erase those observations.'
            else:
                row['state'] = 'INSUFFICIENT_EVIDENCE'
                row['gap'] = 'Declared server checks passed. Broader task coverage and approved role assessment are still required; authorship and independence remain unknown.'
    for row in rows.values():
        row['coverage'] = len({('coding' if s['module'] in ('coding','coding_validation') else s['module'], s.get('correlation_id', s['id'])) for s in row['sources']})
        dates = [datetime.fromisoformat(s['at'].replace('Z', '+00:00')) for s in row['sources']]
        row['freshness'] = 'STALE' if dates and (as_of - max(dates)).days > 90 else 'CURRENT'
        if row['freshness'] == 'STALE': row['gap'] = 'Refresh this practice evidence; it is over 90 days old.'
    if (ordered and ordered[0]['passed'] < ordered[0]['total']
            and (not artifacts or ordered[0]['artifact_id'] == artifacts[0]['id'])):
        artifact_id = ordered[0]['artifact_id']
        result['next_mission'] = {'id': 'server-repair-' + ordered[0]['id'],
            'title': 'Repair a failing server check', 'reason': 'The saved implementation has unresolved failures in its declared server suite.',
            'href': f'/coding/debug?artifact_id={artifact_id}'}
    return result


def normalized_inputs(records):
    """Canonical ordering shared by snapshot writes and read-only ledger audits."""
    records = sorted(records, key=lambda r: r['event_id'], reverse=True)
    events = [{'id': r['event_id'], 'adapter_version': r['adapter_version'], 'source_version': r['source_version']} for r in records]
    artifacts = [obj(r['observation']) for r in records if r['source_module'] == 'coding']
    validations = [obj(r['observation']) for r in records if r['source_module'] == 'coding_validation']
    sessions_by_id = {}
    for record in sorted(records, key=lambda r: r['source_version']):
        if record['source_module'] == 'interview':
            observation = obj(record['observation'])
            sessions_by_id[observation['id']] = observation
    sessions = list(sessions_by_id.values())
    artifacts.sort(key=lambda a: datetime.fromisoformat(a['created_at']), reverse=True)
    return {'events': events, 'artifacts': artifacts, 'sessions': sessions, 'validations': validations}


async def snapshot(conn, user_id):
    if not await lock_projection_owner(conn, user_id):
        return None
    state = await conn.fetchval('SELECT state FROM coding_workspaces WHERE user_id=$1', user_id)
    role = (obj(state) or {}).get('role', 'GENERAL_SWE')
    records = await conn.fetch('SELECT o.event_id,o.source_module,o.adapter_version,o.observation,e.source_version FROM unified_observations o JOIN unified_evidence_events e ON e.id=o.event_id WHERE o.user_id=$1 ORDER BY o.event_id DESC LIMIT 500', user_id)
    inputs = normalized_inputs(records)
    events, artifacts, sessions, validations = (inputs[key] for key in ('events', 'artifacts', 'sessions', 'validations'))
    now = datetime.now(timezone.utc)
    # Day bucket makes freshness reproducible while avoiding a new snapshot on every GET.
    calculation_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
    result = project_v2(role, events, sessions, artifacts, validations, as_of=calculation_time)
    result['evidence_window'] = {'limit': 500, 'included': len(records), 'older_evidence_excluded': await conn.fetchval('SELECT count(*) > 500 FROM unified_observations WHERE user_id=$1', user_id)}
    # Inputs contain only normalized metadata, never code or answer transcripts.
    # A historical snapshot can be reproduced with its original adapter/policy.
    result['calculation_inputs'] = {'events': events, 'artifacts': artifacts, 'sessions': sessions, 'validations': validations, 'as_of': now.date().isoformat()}
    fingerprint = digest({'policy': POLICY_VERSION, 'role': role, 'events': events, 'artifacts': artifacts, 'sessions': sessions, 'validations': validations, 'day': now.date().isoformat()})
    row = await conn.fetchrow('''INSERT INTO unified_readiness_snapshots(user_id,role,policy_version,input_digest,watermark,snapshot)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id,role,policy_version,input_digest)
        DO UPDATE SET input_digest=EXCLUDED.input_digest RETURNING id,snapshot,created_at''', user_id, role, POLICY_VERSION, fingerprint, result['watermark'], json.dumps(result))
    return {**obj(row['snapshot']), 'id': str(row['id']), 'created_at': row['created_at'].isoformat()}


async def current_snapshot(conn, user_id):
    state = await conn.fetchval('SELECT state FROM coding_workspaces WHERE user_id=$1', user_id)
    role = (obj(state) or {}).get('role', 'GENERAL_SWE')
    row = await conn.fetchrow('SELECT id,snapshot,created_at FROM unified_readiness_snapshots WHERE user_id=$1 AND role=$2 AND policy_version=$3 ORDER BY created_at DESC LIMIT 1', user_id, role, POLICY_VERSION)
    pending = await conn.fetchval('SELECT EXISTS(SELECT 1 FROM unified_evidence_events WHERE user_id=$1 AND processed_at IS NULL)', user_id)
    quarantined = await conn.fetchval('SELECT EXISTS(SELECT 1 FROM unified_evidence_events WHERE user_id=$1 AND processed_at IS NULL AND attempts >= 5)', user_id)
    if row:
        result = {**obj(row['snapshot']), 'id': str(row['id']), 'created_at': row['created_at'].isoformat()}
        latest_event = await conn.fetchval('SELECT COALESCE(MAX(event_id),0) FROM unified_observations WHERE user_id=$1', user_id)
        pending = pending or latest_event > result.get('watermark', 0)
        result['data_health'] = 'UNAVAILABLE' if quarantined else 'PENDING' if pending else 'STALE' if (datetime.now(timezone.utc) - row['created_at']).total_seconds() > 86400 else 'CURRENT'
        result.pop('calculation_inputs', None)
        return result
    result = project_v2(role, [], [], [], [], as_of=datetime.now(timezone.utc))
    result.update(id=None, data_health='UNAVAILABLE' if quarantined else 'PENDING', note='Your first practice summary is waiting for evidence processing. No performance conclusion is available yet.')
    return result
