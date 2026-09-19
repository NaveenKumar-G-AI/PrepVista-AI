"""Replay-safe outbox adapter. No execution, AI calls or raw transcript copies."""
import json
from app.services.coding_contracts import digest
from app.services.coding_store import obj

ADAPTER_VERSION = 1


async def lock_projection_owner(conn, user_id):
    # KEY SHARE prevents account erasure while this transaction projects data,
    # but permits ordinary profile/quota updates. Serialize only projection work
    # with a separate advisory key, acquired after the parent-row lock.
    if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user_id): return False
    await conn.execute('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', 'unified-projection:' + str(user_id))
    return True


async def adapt(conn, event):
    user = event['user_id']
    # Also serializes source deletion against projection and receipt processing.
    if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user):
        return None
    if await conn.fetchval('SELECT 1 FROM unified_deletion_tombstones WHERE user_id=$1 AND source_module=$2 AND source_id=$3', user, event['source_module'], event['source_id']):
        return None
    if event['source_module'] == 'coding_validation':
        row = await conn.fetchrow('''SELECT j.*,a.content FROM coding_validation_jobs j
            JOIN coding_artifacts a ON a.id=j.artifact_id AND a.user_id=j.user_id
            WHERE j.user_id=$1 AND j.id=$2 AND j.state='COMPLETED' ''', user, event['source_id'])
        if not row: return None
        content = obj(row['content']); result = obj(row['result'])
        return {'id': str(row['id']), 'artifact_id': str(row['artifact_id']),
            'created_at': row['completed_at'].isoformat(), 'suite_id': row['suite_id'],
            'suite_sha256': row['suite_sha256'], 'qualification_id': row['qualification_id'],
            'runner_image': row['runner_image'], 'code_sha256': row['code_sha256'],
            'passed': result['passed'], 'total': result['total'],
            'correlation_id': digest({'challenge_id': content['challenge_id'], 'version': content.get('challenge_version'), 'language': content['language'], 'code': content['code']})}
    if event['source_module'] == 'coding':
        row = await conn.fetchrow('SELECT content,created_at FROM coding_artifacts WHERE user_id=$1 AND id=$2', user, event['source_id'])
        if not row: return None
        content = obj(row['content'])
        # Correlated saves of the same challenge/code remain one observation.
        value = {key: content.get(key) for key in ('challenge_id', 'challenge_version', 'language', 'assistance', 'passed', 'total', 'source_kind', 'observed_time_authority')}
        value['explanation'] = 'recorded' if content.get('explanation', '').strip() else ''
        value['correlation_id'] = digest({'challenge_id': content['challenge_id'], 'version': content.get('challenge_version'), 'language': content['language'], 'code': content['code']})
        claimed = content.get('observed_at')
        from datetime import datetime
        observed_at = min(datetime.fromisoformat(claimed), row['created_at']) if claimed else row['created_at']
        return {'id': str(event['source_id']), 'content': value, 'created_at': observed_at.isoformat(), 'received_at': row['created_at'].isoformat()}
    if event['source_module'] != 'interview':
        raise ValueError('Unsupported evidence module')
    row = await conn.fetchrow("SELECT runtime_state,finished_at FROM interview_sessions WHERE user_id=$1 AND id=$2 AND state='FINISHED'", user, event['source_id'])
    if not row or not row['finished_at']: return None
    runtime = obj(row['runtime_state']) or {}
    report = runtime.get('evidence_report_v2') or {}
    retry_limit = (obj(event['payload']) or {}).get('retry_id', 0)
    retries = await conn.fetch('''SELECT DISTINCT ON (question_id) question_id,comparison FROM interview_answer_retries
        WHERE user_id=$1 AND session_id=$2 AND id <= $3 ORDER BY question_id,id DESC''', user, event['source_id'], retry_limit)
    repaired = {r['question_id']: set((obj(r['comparison']) or {}).get('repaired_gaps', [])) for r in retries}
    return {'id': str(event['source_id']), 'created_at': row['finished_at'].isoformat(),
        'artifact_id': (runtime.get('orchestrator_v2', {}).get('artifact_context') or {}).get('id'),
        'report': {'evidence': [True] if report.get('evidence') else [],
            'top_risks': [{'gap': risk.get('gap')} for risk in report.get('top_risks', [])[:20]
                if risk.get('gap') not in repaired.get(risk.get('question_id'), set())],
            'retry_note': 'Repaired text signals remain part of the same interview, not independent demonstrations.' if retries else None}}


async def process_event(conn, event_id):
    # Lock profile before outbox: account deletion follows the same lock order.
    owner = await conn.fetchval('SELECT user_id FROM unified_evidence_events WHERE id=$1', event_id)
    if owner is None or not await lock_projection_owner(conn, owner): return None
    event = await conn.fetchrow('SELECT * FROM unified_evidence_events WHERE id=$1 FOR UPDATE', event_id)
    if not event or event['processed_at']: return None
    observation = await adapt(conn, event)
    if observation:
        await conn.execute('''INSERT INTO unified_observations(event_id,user_id,source_module,source_id,adapter_version,observation)
            VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(event_id) DO NOTHING''', event['id'], owner, event['source_module'], event['source_id'], ADAPTER_VERSION, json.dumps(observation))
    await conn.execute('UPDATE unified_evidence_events SET processed_at=NOW() WHERE id=$1', event_id)
    return owner


async def backfill(conn, limit=100):
    # Only committed finishes; original reports and their semantics are retained.
    return await conn.fetch('''INSERT INTO unified_evidence_events(user_id,source_module,source_id,payload)
        SELECT s.user_id,'interview',s.id,'{"authority":"INTERVIEW_TEXT_SIGNAL","backfill":true}'::jsonb
        FROM interview_sessions s WHERE s.state='FINISHED' AND s.finished_at IS NOT NULL
        AND (EXISTS(SELECT 1 FROM coding_workspaces w WHERE w.user_id=s.user_id) OR EXISTS(SELECT 1 FROM coding_artifacts a WHERE a.user_id=s.user_id))
        AND NOT EXISTS(SELECT 1 FROM unified_evidence_events e WHERE e.user_id=s.user_id AND e.source_module='interview' AND e.source_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM unified_deletion_tombstones d WHERE d.user_id=s.user_id AND d.source_module='interview' AND d.source_id=s.id)
        ORDER BY s.finished_at,s.id LIMIT $1 ON CONFLICT DO NOTHING RETURNING id''', limit)
