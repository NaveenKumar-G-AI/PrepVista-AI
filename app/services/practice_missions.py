"""One persisted recommendation coordinator. A launch is never completion."""
from fastapi import HTTPException
from app.services.coding_contracts import digest
from app.services.coding_store import obj
import json


async def choose(conn, user_id, summary):
    primary = summary['next_mission']
    candidates = [primary, {'id': 'discover-coding', 'title': 'Choose a coding problem', 'reason': 'Save an implementation and explain how you checked it.', 'href': '/coding'},
        {'id': 'build-project', 'title': 'Build and explain a project', 'reason': 'Save a project artifact with a decision and verification explanation.', 'href': '/coding/projects'}]
    for candidate in candidates:
        objective = {**candidate, 'role': summary['role'], 'policy_version': summary['policy_version'],
            'origin_watermark': summary['watermark'], 'completion': 'ANSWER_RETRIED' if candidate['href'].startswith('/report/') else 'INTERVIEW_FINISHED' if candidate['href'].startswith('/interview') else 'ARTIFACT_SAVED',
            'estimated_minutes': 20 if candidate['href'].startswith('/interview') else 15}
        from urllib.parse import parse_qs, urlparse
        artifact_id = parse_qs(urlparse(candidate['href']).query).get('artifact_id', [None])[0]
        if artifact_id: objective['artifact_id'] = artifact_id
        if candidate['href'].startswith('/report/'): objective['session_id'] = candidate['href'].split('/')[2]
        # Stable under projection replay; a new source or target creates a new mission.
        key = digest({'role': summary['role'], 'policy': summary['policy_version'], 'id': candidate['id']})
        row = await conn.fetchrow('''INSERT INTO practice_missions(user_id,mission_key,objective) VALUES($1,$2,$3::jsonb)
            ON CONFLICT(user_id,mission_key) DO UPDATE SET mission_key=EXCLUDED.mission_key RETURNING *''', user_id, key, json.dumps(objective))
        if row['status'] in ('COMPLETED', 'DISMISSED'): continue
        if row['status'] == 'DEFERRED' and await conn.fetchval('SELECT $1::timestamptz > NOW()', row['defer_until']): continue
        if row['status'] == 'DEFERRED':
            await conn.execute("UPDATE practice_missions SET status='OPEN',defer_until=NULL WHERE id=$1 AND user_id=$2", row['id'], user_id)
            row = {**dict(row), 'status': 'OPEN'}
        return {**obj(row['objective']), 'id': str(row['id']), 'status': row['status']}
    return None


async def authorized_mission(conn, user_id, mission_id, completion):
    if not mission_id: return None
    row = await conn.fetchrow('SELECT * FROM practice_missions WHERE id=$1 AND user_id=$2 FOR UPDATE', mission_id, user_id)
    if not row: raise HTTPException(404, 'Mission not found.')
    from app.services.unified_assignments import check_assignment_mission
    await check_assignment_mission(conn, user_id, obj(row['objective']))
    if row['status'] not in ('LAUNCHED', 'COMPLETED') or obj(row['objective'])['completion'] != completion:
        raise HTTPException(409, 'Launch the applicable mission before linking this activity.')
    return row
