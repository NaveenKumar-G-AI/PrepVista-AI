"""Owner-scoped durable workspace commands. Caller owns transaction boundaries."""
import json
from uuid import uuid5, NAMESPACE_URL
from fastapi import HTTPException
from app.services.coding_contracts import WorkspaceState, ArtifactWrite, digest


def obj(value):
    return json.loads(value) if isinstance(value, str) else value


async def workspace(conn, user_id, *, lock=False):
    if lock and not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user_id):
        raise HTTPException(404, 'Account is no longer available.')
    await conn.execute('INSERT INTO coding_workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING', user_id)
    row = await conn.fetchrow('SELECT revision, state FROM coding_workspaces WHERE user_id=$1' + (' FOR UPDATE' if lock else ''), user_id)
    return {'revision': row['revision'], 'state': WorkspaceState.model_validate(obj(row['state'])).model_dump(mode='json')}


async def write_workspace(conn, user_id, revision, state, *, source_kind='PRACTICE_ATTEMPT'):
    current = await workspace(conn, user_id, lock=True)
    value = state.model_dump(mode='json')
    if value == current['state']:
        return current
    if current['revision'] != revision:
        raise HTTPException(409, detail={'message': 'Another device saved newer work. Export your local work before loading the server copy.', 'current': current})
    previous_ids = {attempt['id'] for attempt in current['state']['attempts']}
    for attempt in state.attempts:
        if attempt.id in previous_ids: continue
        receipt_id = uuid5(NAMESPACE_URL, f'prepvista:attempt:{user_id}:{attempt.id}')
        # Previously archived attempts remain immutable even after the rolling
        # workspace window drops them. Re-import cannot rewrite their content.
        if await conn.fetchval('SELECT 1 FROM coding_artifacts WHERE user_id=$1 AND request_id=$2', user_id, receipt_id): continue
        await artifact(conn, user_id, ArtifactWrite(expected_owner_id=user_id, request_id=receipt_id,
            challenge_id=attempt.challengeId, code=attempt.code,
            assistance='KNOWN_ASSISTED' if attempt.assisted else 'UNKNOWN', passed=attempt.passed, total=attempt.total),
            source_kind=source_kind, observed_at=attempt.at.isoformat())
    await conn.execute('UPDATE coding_workspaces SET state=$2::jsonb, revision=revision+1, updated_at=NOW() WHERE user_id=$1', user_id, json.dumps(value))
    return {'revision': revision + 1, 'state': value}


async def artifact(conn, user_id, request, *, source_kind='EXPLICIT_SAVE', observed_at=None):
    if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user_id):
        raise HTTPException(404, 'Account is no longer available.')
    from app.services.practice_missions import authorized_mission
    mission = await authorized_mission(conn, user_id, request.mission_id, 'ARTIFACT_SAVED')
    if request.parent_artifact_id:
        parent = await conn.fetchrow('SELECT * FROM coding_artifacts WHERE id=$1 AND user_id=$2', request.parent_artifact_id, user_id)
        if not parent:
            raise HTTPException(404, 'Original artifact not found.')
        original = obj(parent['content'])
        if (request.challenge_id, request.challenge_version, request.language) != (original['challenge_id'], original.get('challenge_version', 1), original['language']):
            raise HTTPException(409, 'A revision must preserve its original challenge and language.')
        if original.get('assistance') == 'KNOWN_ASSISTED':
            request = request.model_copy(update={'assistance': 'KNOWN_ASSISTED'})
    if mission:
        objective = obj(mission['objective'])
        if objective.get('required_challenge_id') and request.challenge_id != objective['required_challenge_id']:
            raise HTTPException(409, 'Save the project selected by this assignment.')
        if objective.get('requires_explanation') and not request.explanation.strip():
            raise HTTPException(422, 'This assignment requires an explanation of your implementation and checks.')
        required_parent = obj(mission['objective']).get('artifact_id')
        if required_parent and str(request.parent_artifact_id) != required_parent:
            raise HTTPException(409, 'Save a revision of the artifact selected by this mission.')
    content = request.model_dump(mode='json', exclude={'expected_owner_id', 'request_id'})
    content.update(source_kind=source_kind, observed_at=observed_at,
        observed_time_authority='CLIENT_CLAIMED' if observed_at else 'SERVER_RECEIPT_TIME')
    fingerprint = digest(content)
    row = await conn.fetchrow('''INSERT INTO coding_artifacts(user_id,request_id,digest,challenge_id,language,content)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id,request_id) DO NOTHING RETURNING *''',
        user_id, request.request_id, fingerprint, request.challenge_id, request.language, json.dumps(content))
    if not row:
        row = await conn.fetchrow('SELECT * FROM coding_artifacts WHERE user_id=$1 AND request_id=$2', user_id, request.request_id)
        if row['digest'] != fingerprint:
            raise HTTPException(409, 'This request ID already belongs to a different artifact.')
    # Only bounded metadata goes in the outbox. Code stays in the private source.
    await conn.execute('''INSERT INTO unified_evidence_events(user_id,source_module,source_id,payload)
        VALUES($1,'coding',$2,$3::jsonb) ON CONFLICT DO NOTHING''', user_id, row['id'], json.dumps({
            'authority': 'CLIENT_REPORTED', 'challenge_id': request.challenge_id,
            'assistance': request.assistance, 'passed': request.passed, 'total': request.total,
            'has_explanation': bool(request.explanation.strip()), 'language': request.language,
        }))
    if mission and mission['status'] != 'COMPLETED':
        await conn.execute("UPDATE practice_missions SET status='COMPLETED',completed_at=NOW(),completion_source_id=$3 WHERE id=$1 AND user_id=$2 AND status='LAUNCHED'", mission['id'], user_id, row['id'])
    return {'id': str(row['id']), 'created_at': row['created_at'].isoformat(), 'authority': 'CLIENT_REPORTED', 'content': content}
