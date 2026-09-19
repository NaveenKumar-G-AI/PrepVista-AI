"""Bounded institutional assignments with explicit student acceptance."""
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator
from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import get_current_user, require_org_admin, UserProfile, OrgAdminProfile
from app.routers.coding import private_response, check_owner
from app.routers.journey import require_journey
from app.services import unified_assignments as service
from app.middleware.rate_limiter import rate_limit_user

router = APIRouter(dependencies=[Depends(private_response)])


async def require_staff(org: OrgAdminProfile = Depends(require_org_admin())):
    if not get_settings().UNIFIED_ASSIGNMENTS_ENABLED:
        raise HTTPException(403, 'Institutional practice assignments are not enabled.')
    if org.admin_role not in ('org_admin', 'placement_officer'):
        raise HTTPException(403, 'Organization-wide assignment permission is required.')
    return org


class OwnerCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_owner_id: UUID


class AssignmentCreate(OwnerCommand):
    request_id: UUID
    season_id: UUID
    student_ids: list[UUID] = Field(min_length=1, max_length=50)
    task_kind: Literal['CODING_PRACTICE', 'PROJECT', 'INTERVIEW']
    title: str = Field(min_length=3, max_length=160)
    instructions: str = Field(min_length=3, max_length=3000)
    due_at: AwareDatetime | None = None

    @field_validator('title', 'instructions')
    @classmethod
    def not_blank(cls, value):
        if not value.strip(): raise ValueError('Enter meaningful assignment text.')
        return value.strip()

    @field_validator('student_ids')
    @classmethod
    def unique_students(cls, value):
        if len(set(value)) != len(value): raise ValueError('Select each student once.')
        return value


class AcceptAssignment(OwnerCommand):
    share_completion: Literal[True]


@router.get('/assignments/options')
async def options(q: str = Query('', max_length=100), org: OrgAdminProfile = Depends(require_staff)):
    settings = get_settings()
    ids = [value.strip() for value in settings.CODING_PILOT_PROFILE_IDS.split(',') if value.strip()]
    async with DatabaseConnection() as conn:
        seasons = await conn.fetch("SELECT id,name FROM placement_seasons WHERE organization_id=$1 AND status='ACTIVE' ORDER BY starts_on DESC LIMIT 50", org.organization_id)
        students = await conn.fetch('''SELECT DISTINCT p.id,COALESCE(to_jsonb(p)->>'full_name','Student') AS name
            FROM profiles p JOIN organization_students os ON os.user_id=p.id
            WHERE os.organization_id=$1 AND os.status='active' AND p.id::text=ANY($2::text[])
              AND (COALESCE(to_jsonb(p)->>'full_name','') ILIKE '%' || $3 || '%' OR p.id::text=$3)
            ORDER BY name,p.id LIMIT 201''', org.organization_id, ids, q)
    return {'seasons': [dict(r) for r in seasons], 'students': [dict(r) for r in students[:200]], 'more_students': len(students) > 200,
        'task_kinds': [{'id': key, **value} for key, value in service.TASKS.items()]}


@router.post('/assignments', status_code=201)
async def create(request: AssignmentCreate, org: OrgAdminProfile = Depends(require_staff)):
    if str(request.expected_owner_id) != str(org.user_id): raise HTTPException(409, 'Account changed. Reload before assigning work.')
    await rate_limit_user(org.user_id)
    settings = get_settings()
    pilots = {value.strip() for value in settings.CODING_PILOT_PROFILE_IDS.split(',') if value.strip()}
    if not (settings.CODING_WORKSPACE_ENABLED and settings.CODING_SERVER_SYNC_ENABLED and settings.UNIFIED_READINESS_VISIBLE) or any(str(person) not in pilots for person in request.student_ids):
        raise HTTPException(403, 'All selected students must have access to the unified practice pilot.')
    # Keep retries stable across the deadline; due dates are guidance, not a write cutoff.
    async with DatabaseConnection() as conn, conn.transaction():
        return await service.create_batch(conn, org, request)


@router.get('/assignments/staff')
async def staff_list(before: UUID | None = None, org: OrgAdminProfile = Depends(require_staff)):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch('''SELECT a.id,a.student_id,i.name AS title,b.task_kind,a.due_date,
            CASE WHEN l.withdrawn_at IS NOT NULL THEN 'WITHDRAWN' ELSE a.status::text END AS status,
            CASE WHEN l.accepted_at IS NOT NULL AND l.withdrawn_at IS NULL THEN a.completed_at END AS completed_at,
            COALESCE(to_jsonb(p)->>'full_name','Student') AS student_name
            FROM intervention_assignment a JOIN intervention i ON i.id=a.intervention_id
            JOIN unified_assignment_batches b ON b.intervention_id=i.id AND b.organization_id=i.institution_id
            JOIN unified_assignment_links l ON l.assignment_id=a.id
            JOIN profiles p ON p.id=a.student_id
            WHERE i.institution_id=$1 AND ($2::uuid IS NULL OR a.id < $2)
              AND EXISTS(SELECT 1 FROM organization_students os WHERE os.user_id=a.student_id AND os.organization_id=$1 AND os.status='active')
            ORDER BY a.id DESC LIMIT 101''', org.organization_id, before)
    return {'items': [dict(r) for r in rows[:100]], 'next_cursor': str(rows[99]['id']) if len(rows) > 100 else None}


@router.post('/assignments/{assignment_id}/cancel')
async def cancel(assignment_id: UUID, request: OwnerCommand, org: OrgAdminProfile = Depends(require_staff)):
    if str(request.expected_owner_id) != str(org.user_id): raise HTTPException(409, 'Account changed.')
    async with DatabaseConnection() as conn, conn.transaction():
        row = await conn.fetchrow('''SELECT a.id,a.status FROM intervention_assignment a JOIN intervention i ON i.id=a.intervention_id
            JOIN unified_assignment_batches b ON b.intervention_id=i.id
            WHERE a.id=$1 AND i.institution_id=$2 FOR UPDATE OF a''', assignment_id, org.organization_id)
        if not row: raise HTTPException(404, 'Assignment not found.')
        if row['status'] == 'COMPLETED': raise HTTPException(409, 'Completed assignments cannot be cancelled by staff.')
        await conn.execute("UPDATE intervention_assignment SET status='CANCELLED' WHERE id=$1", assignment_id)
        if row['status'] != 'CANCELLED':
            await service.audit(conn, org.organization_id, org.user_id, org.admin_role, 'UNIFIED_ASSIGNMENT_CANCELLED', assignment_id)
    return {'status': 'CANCELLED'}


@router.get('/assignments/mine')
async def mine(before: UUID | None = None, user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        if not await conn.fetchval("SELECT to_regclass('unified_assignment_links')"): return {'items': [], 'next_cursor': None}
        rows = await conn.fetch('''SELECT a.id,a.status,a.due_date,a.completed_at,i.name AS title,i.objective AS instructions,
            o.name AS organization_name,b.task_kind,l.accepted_at,l.withdrawn_at,l.mission_id,m.status AS mission_status,
            o.status='active' AND EXISTS(SELECT 1 FROM organization_students os WHERE os.user_id=$1 AND os.organization_id=o.id AND os.status='active') AS active_membership
            FROM intervention_assignment a JOIN intervention i ON i.id=a.intervention_id
            JOIN organizations o ON o.id=i.institution_id JOIN unified_assignment_batches b ON b.intervention_id=i.id
            JOIN unified_assignment_links l ON l.assignment_id=a.id AND l.user_id=a.student_id
            LEFT JOIN practice_missions m ON m.id=l.mission_id AND m.user_id=l.user_id
            WHERE a.student_id=$1 AND ($2::uuid IS NULL OR a.id < $2) ORDER BY a.id DESC LIMIT 101''', user.id, before)
    return {'items': [dict(r) for r in rows[:100]], 'next_cursor': str(rows[99]['id']) if len(rows) > 100 else None,
        'enabled': get_settings().UNIFIED_ASSIGNMENTS_ENABLED}


@router.post('/assignments/{assignment_id}/accept')
async def accept(assignment_id: UUID, request: AcceptAssignment, user: UserProfile = Depends(require_journey)):
    check_owner(request, user)
    if not get_settings().UNIFIED_ASSIGNMENTS_ENABLED: raise HTTPException(403, 'Assignments are paused.')
    async with DatabaseConnection() as conn, conn.transaction(): return await service.accept(conn, user.id, assignment_id)


@router.post('/assignments/{assignment_id}/withdraw')
async def withdraw(assignment_id: UUID, request: OwnerCommand, user: UserProfile = Depends(get_current_user)):
    check_owner(request, user)
    # A student can revoke status sharing even after leaving the org or a flag rollback.
    async with DatabaseConnection() as conn, conn.transaction():
        row = await conn.fetchrow('''SELECT a.id,i.institution_id,l.withdrawn_at FROM intervention_assignment a JOIN unified_assignment_links l ON l.assignment_id=a.id
            JOIN intervention i ON i.id=a.intervention_id
            WHERE a.id=$1 AND a.student_id=$2 FOR UPDATE OF a,l''', assignment_id, user.id)
        if not row: raise HTTPException(404, 'Assignment not found.')
        await conn.execute('UPDATE unified_assignment_links SET withdrawn_at=COALESCE(withdrawn_at,NOW()) WHERE assignment_id=$1', assignment_id)
        await conn.execute("UPDATE intervention_assignment SET status='CANCELLED' WHERE id=$1", assignment_id)
        if not row['withdrawn_at']:
            await service.audit(conn, row['institution_id'], user.id, 'student', 'UNIFIED_ASSIGNMENT_WITHDRAWN', assignment_id)
    return {'status': 'WITHDRAWN', 'personal_work_preserved': True}
