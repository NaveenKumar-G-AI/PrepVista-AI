"""Institutional work links into personal missions; it never transfers artifacts."""
import json
from uuid import uuid4
from fastapi import HTTPException
from app.config import get_settings
from app.services.coding_contracts import digest
from app.services.coding_store import workspace

TASKS = {
    'CODING_PRACTICE': {'title': 'Implement and explain a coding problem', 'href': '/coding', 'completion': 'ARTIFACT_SAVED'},
    'PROJECT': {'title': 'Build and explain a notification project', 'href': '/coding/projects', 'completion': 'ARTIFACT_SAVED', 'required_challenge_id': 'notification-project'},
    'INTERVIEW': {'title': 'Complete a practice interview', 'href': '/interview/setup', 'completion': 'INTERVIEW_FINISHED'},
}


async def audit(conn, organization_id, actor_id, actor_role, action, entity_id):
    await conn.execute('''INSERT INTO audit_log(id,institution_id,actor_id,actor_role,action,entity_type,entity_id)
        VALUES($1,$2,$3,$4,$5,'unified_assignment',$6)''', uuid4(), organization_id, str(actor_id), actor_role, action, str(entity_id))


async def active_membership(conn, user_id, organization_id):
    return await conn.fetchval("""SELECT 1 FROM organization_students os JOIN organizations o ON o.id=os.organization_id
        WHERE os.user_id=$1 AND os.organization_id=$2 AND os.status='active' AND o.status='active' FOR SHARE OF os,o""", user_id, organization_id)


async def assignment_for_student(conn, user_id, assignment_id):
    row = await conn.fetchrow('''SELECT a.*,i.institution_id,i.name,i.objective,b.task_kind,l.mission_id,l.accepted_at,l.withdrawn_at
        FROM intervention_assignment a JOIN intervention i ON i.id=a.intervention_id
        JOIN unified_assignment_batches b ON b.intervention_id=i.id
        JOIN unified_assignment_links l ON l.assignment_id=a.id AND l.user_id=a.student_id
        WHERE a.id=$1 AND a.student_id=$2 FOR UPDATE OF a,l''', assignment_id, user_id)
    if not row: raise HTTPException(404, 'Assignment not found.')
    if not await active_membership(conn, user_id, row['institution_id']):
        raise HTTPException(403, 'Active organization membership is required for assigned work. Your personal work remains available.')
    return row


async def check_assignment_mission(conn, user_id, objective):
    if not objective.get('assignment_id'): return
    if not get_settings().UNIFIED_ASSIGNMENTS_ENABLED:
        raise HTTPException(409, 'Assigned work is paused. Continue as personal practice to save your work.')
    from uuid import UUID
    row = await assignment_for_student(conn, user_id, UUID(objective['assignment_id']))
    if row['status'] == 'CANCELLED' or row['withdrawn_at'] or not row['accepted_at']:
        raise HTTPException(409, 'This assignment is no longer active. You can continue as personal practice.')


async def create_batch(conn, org, request):
    value = request.model_dump(mode='json', exclude={'expected_owner_id', 'request_id'})
    value['student_ids'] = sorted(value['student_ids'])
    fingerprint = digest(value)
    # Serialize only this organization/request so a lost response cannot create a
    # second intervention. A retry returns the existing receipt without new writes.
    await conn.execute('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', f'assignment:{org.organization_id}:{request.request_id}')
    existing = await conn.fetchrow('SELECT * FROM unified_assignment_batches WHERE organization_id=$1 AND request_id=$2', org.organization_id, request.request_id)
    if existing:
        if existing['request_digest'] != fingerprint: raise HTTPException(409, 'Request ID belongs to another assignment.')
        return {'id': str(existing['intervention_id']), 'idempotent': True}
    for person in sorted(request.student_ids):
        if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', person) or not await active_membership(conn, person, org.organization_id):
            raise HTTPException(403, 'Every selected student must be an active member of your organization.')
    if not await conn.fetchval("SELECT id FROM placement_seasons WHERE id=$1 AND organization_id=$2 AND status='ACTIVE' FOR SHARE", request.season_id, org.organization_id):
        raise HTTPException(403, 'Choose an active season from your organization.')
    intervention_id = uuid4()
    await conn.execute('''INSERT INTO intervention(id,institution_id,season_id,name,type,objective,priority,created_by)
        VALUES($1,$2,$3,$4,'CUSTOM',$5,'MEDIUM',$6)''', intervention_id, org.organization_id, request.season_id, request.title, request.instructions, org.user_id)
    await conn.execute('''INSERT INTO unified_assignment_batches(intervention_id,organization_id,request_id,request_digest,task_kind)
        VALUES($1,$2,$3,$4,$5)''', intervention_id, org.organization_id, request.request_id, fingerprint, request.task_kind)
    for person in request.student_ids:
        assignment_id = uuid4()
        await conn.execute('''INSERT INTO intervention_assignment(id,intervention_id,student_id,assigned_by,reason,priority,due_date)
            VALUES($1,$2,$3,$4,$5,'MEDIUM',$6)''', assignment_id, intervention_id, person, org.user_id, request.instructions, request.due_at)
        await conn.execute('INSERT INTO unified_assignment_links(assignment_id,user_id) VALUES($1,$2)', assignment_id, person)
    await audit(conn, org.organization_id, org.user_id, org.admin_role, 'UNIFIED_ASSIGNMENT_CREATED', intervention_id)
    return {'id': str(intervention_id), 'idempotent': False}


async def accept(conn, user_id, assignment_id):
    if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user_id): raise HTTPException(404, 'Account not found.')
    await workspace(conn, user_id, lock=True)
    row = await assignment_for_student(conn, user_id, assignment_id)
    if row['status'] == 'CANCELLED' or row['withdrawn_at']: raise HTTPException(409, 'This assignment is no longer active.')
    if row['mission_id']: return {'mission_id': str(row['mission_id'])}
    objective = {**TASKS[row['task_kind']], 'title': row['name'], 'reason': row['objective'], 'origin': 'ORGANIZATION_ASSIGNMENT',
        'assignment_id': str(assignment_id), 'organization_id': str(row['institution_id']), 'policy_version': 'assignment-practice-v1',
        'estimated_minutes': 20, 'requires_explanation': row['task_kind'] != 'INTERVIEW'}
    mission_id = await conn.fetchval('''INSERT INTO practice_missions(user_id,mission_key,objective) VALUES($1,$2,$3::jsonb) RETURNING id''', user_id, 'assignment:' + str(assignment_id), json.dumps(objective))
    await conn.execute('UPDATE unified_assignment_links SET accepted_at=NOW(),mission_id=$2 WHERE assignment_id=$1', assignment_id, mission_id)
    await conn.execute("UPDATE intervention_assignment SET status='ACKNOWLEDGED',acknowledged_at=NOW() WHERE id=$1", assignment_id)
    await audit(conn, row['institution_id'], user_id, 'student', 'UNIFIED_ASSIGNMENT_ACCEPTED', assignment_id)
    return {'mission_id': str(mission_id)}
