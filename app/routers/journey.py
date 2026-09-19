"""One student preparation view, with explicit institutional sharing."""
import json
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict
from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import get_current_user, require_org_admin, UserProfile, OrgAdminProfile
from app.routers.coding import require_sync, private_response, check_owner
from app.services.coding_store import obj, workspace
from app.services.unified_readiness import current_snapshot, POLICY_VERSION
from app.services.practice_missions import choose

router = APIRouter(dependencies=[Depends(private_response)])


async def require_journey(user: UserProfile = Depends(require_sync)):
    if not get_settings().UNIFIED_READINESS_VISIBLE:
        raise HTTPException(403, 'The unified practice journey is not enabled yet.')
    return user


@router.get('/current')
async def current(response: Response, user: UserProfile = Depends(require_journey)):
    response.headers['Cache-Control'] = 'private, no-store'
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            await workspace(conn, user.id)
            result = await current_snapshot(conn, user.id)
            result['next_mission'] = await choose(conn, user.id, result)
            return result


@router.get('/snapshots')
async def snapshot_history(before: UUID | None = None, user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        cursor_time = None
        if before:
            cursor_time = await conn.fetchval('SELECT created_at FROM unified_readiness_snapshots WHERE user_id=$1 AND id=$2', user.id, before)
            if cursor_time is None:
                raise HTTPException(404, 'This history page is unavailable. Return to the newest snapshots.')
        rows = await conn.fetch('''SELECT id,role,policy_version,created_at,
            snapshot->>'role_label' AS role_label,snapshot->>'overall_state' AS overall_state,
            snapshot->>'as_of' AS as_of,snapshot->>'role_policy_status' AS role_policy_status
            FROM unified_readiness_snapshots WHERE user_id=$1
            AND ($2::timestamptz IS NULL OR (created_at,id) < ($2,$3::uuid))
            ORDER BY created_at DESC,id DESC LIMIT 51''', user.id, cursor_time, before)
    return {'items': [dict(row) for row in rows[:50]],
            'next_cursor': str(rows[49]['id']) if len(rows) > 50 else None}


@router.get('/snapshots/{snapshot_id}')
async def get_snapshot(snapshot_id: UUID, user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow('SELECT id,snapshot FROM unified_readiness_snapshots WHERE user_id=$1 AND id=$2', user.id, snapshot_id)
        if not row: raise HTTPException(404, 'Snapshot not found.')
    result = {**obj(row['snapshot']), 'id': str(row['id'])}
    result.pop('calculation_inputs', None)
    return result


@router.get('/snapshots/{snapshot_id}/export')
async def export_report(snapshot_id: UUID, format: Literal['json', 'html'] = 'json',
                        user: UserProfile = Depends(get_current_user)):
    # Recovery/export access survives feature rollback. Never regenerate a
    # historical assessment using today's policy or use institution permissions.
    from app.services.unified_reports import export_snapshot
    async with DatabaseConnection() as conn:
        saved = await conn.fetchval('SELECT snapshot FROM unified_readiness_snapshots WHERE user_id=$1 AND id=$2', user.id, snapshot_id)
        if saved is None:
            raise HTTPException(404, 'Snapshot not found.')
    try:
        return export_snapshot(snapshot_id, obj(saved), format)
    except (ValueError, KeyError, TypeError):
        raise HTTPException(409, 'This saved snapshot needs a compatible report renderer.') from None


class MissionDecision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_owner_id: UUID
    decision: str
    note: str = ''


@router.post('/missions/{mission_id}/decision')
async def mission_decision(mission_id: UUID, request: MissionDecision, user: UserProfile = Depends(require_journey)):
    check_owner(request, user)
    if request.decision not in ('defer', 'dismiss', 'resume') or len(request.note) > 500:
        raise HTTPException(422, 'Choose defer, dismiss or resume with a note of at most 500 characters.')
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow('''UPDATE practice_missions SET status=$3,decision_note=$4,
            defer_until=CASE WHEN $3='DEFERRED' THEN NOW()+INTERVAL '1 day' ELSE NULL END
            WHERE id=$1 AND user_id=$2 AND status <> 'COMPLETED' RETURNING status''', mission_id, user.id, {'defer': 'DEFERRED', 'dismiss': 'DISMISSED', 'resume': 'OPEN'}[request.decision], request.note)
    if not row: raise HTTPException(404, 'An active mission was not found.')
    return {'status': row['status']}


class MissionLaunch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_owner_id: UUID


@router.get('/missions/{mission_id}')
async def mission_context(mission_id: UUID, user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow('SELECT objective,status FROM practice_missions WHERE id=$1 AND user_id=$2', mission_id, user.id)
        if not row: raise HTTPException(404, 'Mission not found.')
        objective = obj(row['objective'])
        return {'id': str(mission_id), 'title': objective['title'], 'reason': objective['reason'],
            'origin': objective.get('origin', 'PERSONAL_PRACTICE'), 'status': row['status'],
            'completion': objective['completion']}


@router.post('/missions/{mission_id}/launch')
async def launch_mission(mission_id: UUID, request: MissionLaunch, user: UserProfile = Depends(require_journey)):
    check_owner(request, user)
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow('SELECT objective,status FROM practice_missions WHERE user_id=$1 AND id=$2', user.id, mission_id)
    if not row: raise HTTPException(404, 'Mission not found.')
    objective = obj(row['objective'])
    if objective['completion'] == 'ANSWER_RETRIED':
        async with DatabaseConnection() as conn:
            session = await conn.fetchval("SELECT id FROM interview_sessions WHERE user_id=$1 AND id=$2 AND state='FINISHED'", user.id, UUID(objective['session_id']))
            if not session: raise HTTPException(404, 'The completed interview is unavailable.')
            if not user.premium_override and user.effective_plan == 'free':
                latest = await conn.fetchval("SELECT id FROM interview_sessions WHERE user_id=$1 AND state='FINISHED' ORDER BY finished_at DESC NULLS LAST LIMIT 1", user.id)
                if latest != session: raise HTTPException(403, 'Historical interview practice requires an applicable plan.')
    if objective['completion'] == 'INTERVIEW_FINISHED':
        from app.services.quota import enforce_quota
        await enforce_quota(user)  # Read/check existing allowance; launch spends no credit.
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            from app.services.unified_assignments import check_assignment_mission
            if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user.id):
                raise HTTPException(404, 'Account not found.')
            locked = await conn.fetchrow('SELECT objective FROM practice_missions WHERE id=$1 AND user_id=$2 FOR UPDATE', mission_id, user.id)
            if not locked: raise HTTPException(404, 'Mission not found.')
            objective = obj(locked['objective'])
            await check_assignment_mission(conn, user.id, objective)
            if objective.get('artifact_id') and not await conn.fetchval('SELECT 1 FROM coding_artifacts WHERE user_id=$1 AND id=$2', user.id, UUID(objective['artifact_id'])):
                raise HTTPException(404, 'This mission artifact was removed.')
            status = await conn.fetchval("UPDATE practice_missions SET status='LAUNCHED',launched_at=COALESCE(launched_at,NOW()) WHERE user_id=$1 AND id=$2 AND status IN ('OPEN','LAUNCHED') RETURNING status", user.id, mission_id)
            if not status: raise HTTPException(409, 'Resume this mission before launching, or choose another activity.')
    href = objective['href']
    return {'href': href + ('&' if '?' in href else '?') + 'mission_id=' + str(mission_id), 'status': status, 'completion': objective['completion']}


class Sharing(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_owner_id: UUID
    organization_id: UUID
    enabled: bool


@router.get('/sharing')
async def sharing_options(user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        if not await conn.fetchval("SELECT to_regclass('unified_sharing')"):
            return []
        rows = await conn.fetch('''SELECT o.id,o.name,COALESCE(sh.enabled,FALSE) AS enabled,
            EXISTS(SELECT 1 FROM organization_students os WHERE os.user_id=$1 AND os.organization_id=o.id AND os.status='active') AND o.status='active' AS can_share
            FROM organizations o LEFT JOIN unified_sharing sh ON sh.organization_id=o.id AND sh.user_id=$1
            WHERE sh.user_id=$1 OR EXISTS(SELECT 1 FROM organization_students os WHERE os.user_id=$1 AND os.organization_id=o.id AND os.status='active')''', user.id)
    return [{'id': str(r['id']), 'name': r['name'], 'enabled': r['enabled'], 'can_share': r['can_share']} for r in rows]


@router.put('/sharing')
async def sharing(request: Sharing, user: UserProfile = Depends(get_current_user)):
    check_owner(request, user)
    if request.enabled:
        from app.routers.coding import require_coding
        await require_coding(user)
        await require_sync(user)
        await require_journey(user)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            # Revocation is always permitted, even after leaving an organization.
            if request.enabled and not await conn.fetchval("SELECT 1 FROM organization_students os JOIN organizations o ON o.id=os.organization_id WHERE os.user_id=$1 AND os.organization_id=$2 AND os.status='active' AND o.status='active' FOR SHARE OF os,o", user.id, request.organization_id):
                raise HTTPException(403, 'Active membership is required to share a summary.')
            if not request.enabled:
                await conn.execute('UPDATE unified_sharing SET enabled=FALSE,updated_at=NOW() WHERE user_id=$1 AND organization_id=$2', user.id, request.organization_id)
                return {'enabled': False, 'scope': 'aggregate practice summary only; no code or transcripts'}
            await conn.execute('''INSERT INTO unified_sharing(user_id,organization_id,enabled) VALUES($1,$2,$3)
                ON CONFLICT(user_id,organization_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_at=NOW()''', user.id, request.organization_id, request.enabled)
    return {'enabled': request.enabled, 'scope': 'aggregate practice summary only; no code or transcripts'}


@router.get('/cohort')
async def cohort(org: OrgAdminProfile = Depends(require_org_admin())):
    if not get_settings().UNIFIED_TPO_VISIBLE:
        raise HTTPException(403, 'Unified organization reporting is not enabled.')
    # Until department scopes have explicit support, do not broaden a dept admin.
    if org.admin_role not in ('org_admin', 'placement_officer'):
        raise HTTPException(403, 'This view requires organization-wide reporting permission.')
    async with DatabaseConnection() as conn:
        rows = await conn.fetch('''SELECT DISTINCT ON (s.user_id) s.user_id,s.snapshot
            FROM unified_readiness_snapshots s JOIN unified_sharing sh ON sh.user_id=s.user_id
            JOIN organization_students os ON os.user_id=s.user_id AND os.organization_id=sh.organization_id
            WHERE sh.organization_id=$1 AND sh.enabled AND os.status='active' AND s.policy_version=$2
              AND s.role=COALESCE((SELECT w.state->>'role' FROM coding_workspaces w WHERE w.user_id=s.user_id),'GENERAL_SWE')
            ORDER BY s.user_id,s.created_at DESC''', org.organization_id, POLICY_VERSION)
    if len(rows) < 5:
        return {'suppressed': True, 'message': 'At least five actively enrolled students must share a summary before an aggregate is shown.'}
    counts = {}
    for row in rows:
        for area in obj(row['snapshot'])['rows']:
            key = area['key']; counts.setdefault(key, {})
            counts[key][area['state']] = counts[key].get(area['state'], 0) + 1
    # No filters or individual drill-down that could reveal small subgroups.
    # Suppress an entire row if any nonzero cell is small. Hiding only one cell
    # would allow it to be recovered by subtracting others from the total.
    safe_counts = {key: (None if any(value < 5 for value in values.values()) else values) for key, values in counts.items()}
    return {'suppressed': False, 'participants': len(rows), 'areas': safe_counts, 'note': 'Consenting students only. Small category counts are suppressed. Practice evidence does not predict placement.'}
