"""Phase 2 coding access: reuse identity, expose no paid or trusted operations."""
from typing import Literal

from fastapi import APIRouter, Depends, Response, HTTPException
import json
from uuid import UUID
from pydantic import BaseModel, ConfigDict, ValidationError

from app.config import get_settings
from app.dependencies import UserProfile, get_current_user
from app.database.connection import DatabaseConnection
from app.services import coding_store as store
from app.services.coding_contracts import WorkspaceWrite, ImportPreview, ImportCommit, ArtifactWrite, WorkspaceState, merge_guest, digest
from app.middleware.rate_limiter import rate_limit_user
from app.services.coding_contracts import MentorRequest

async def private_response(response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['Vary'] = 'Authorization, Cookie'


router = APIRouter(dependencies=[Depends(private_response)])


class CodingAccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    student_profile_id: str
    enabled: bool
    execution_language: Literal["javascript"] = "javascript"
    result_authority: Literal["CLIENT_REPORTED"] = "CLIENT_REPORTED"
    persistence: Literal["BROWSER_TAB", "SERVER"] = "BROWSER_TAB"
    server_sync: bool = False
    ai_mentoring: bool = False
    ai_provider: str | None = None
    readiness_updates: bool = False
    guest_import: bool = False
    server_validation: bool = False
    interview_credits_consumed: Literal[0] = 0


@router.get("/access", response_model=CodingAccess)
async def coding_access(response: Response, user: UserProfile = Depends(get_current_user)):
    settings = get_settings()
    # Empty or '*' allowlists grant nobody. Compare canonical profile IDs, never
    # emails, client IDs, plan names or editable auth metadata.
    profiles = {value.strip() for value in settings.CODING_PILOT_PROFILE_IDS.split(",") if value.strip()}
    enabled = settings.CODING_WORKSPACE_ENABLED and str(user.id) in profiles
    sync = enabled and getattr(settings, 'CODING_SERVER_SYNC_ENABLED', False)
    from app.services.coding_validation import configured
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Authorization, Cookie"
    return CodingAccess(
        student_profile_id=str(user.id),
        enabled=enabled,
        persistence='SERVER' if sync else 'BROWSER_TAB',
        server_sync=sync,
        ai_mentoring=sync and getattr(settings, 'CODING_AI_ENABLED', False),
        ai_provider=getattr(settings, 'CODING_AI_PROVIDER', None) if sync and getattr(settings, 'CODING_AI_ENABLED', False) else None,
        readiness_updates=sync and getattr(settings, 'UNIFIED_READINESS_VISIBLE', False),
        guest_import=sync and getattr(settings, 'CODING_GUEST_IMPORT_ENABLED', False),
        server_validation=sync and configured(settings),
    )


async def require_coding(user: UserProfile = Depends(get_current_user)):
    access = await coding_access(Response(), user)
    if not access.enabled:
        raise HTTPException(403, 'Coding workspace is not enabled for this account.')
    return user


async def require_sync(user: UserProfile = Depends(require_coding)):
    if not get_settings().CODING_SERVER_SYNC_ENABLED:
        raise HTTPException(503, 'Server sync is not enabled. Your local work is preserved.')
    return user


def check_owner(request, user):
    if str(request.expected_owner_id) != str(user.id):
        raise HTTPException(409, 'Your account changed. This write belongs to the original account.')


from app.services.coding_validation import ValidationRequest


@router.post('/artifacts/{artifact_id}/validate', status_code=202)
async def request_validation(artifact_id: UUID, request: ValidationRequest, user: UserProfile = Depends(require_sync)):
    from app.services.coding_validation import enqueue
    check_owner(request, user)
    await rate_limit_user(user.id)
    async with DatabaseConnection() as conn, conn.transaction():
        return await enqueue(conn, user.id, artifact_id, request.request_id)


@router.get('/artifacts/{artifact_id}/validations')
async def validation_history(artifact_id: UUID, user: UserProfile = Depends(get_current_user)):
    from app.services.coding_validation import public_job
    from app.services.coding_validation_suites import suite_for
    async with DatabaseConnection() as conn:
        content = await conn.fetchval('SELECT content FROM coding_artifacts WHERE user_id=$1 AND id=$2', user.id, artifact_id)
        if content is None:
            raise HTTPException(404, 'Artifact not found.')
        rows = await conn.fetch('SELECT * FROM coding_validation_jobs WHERE user_id=$1 AND artifact_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20', user.id, artifact_id)
    suite = suite_for(store.obj(content))
    return {'items': [public_job(row) for row in rows], 'supported': suite is not None,
            'suite_id': suite['suite_id'] if suite else None, 'history_limit': 20}


@router.get('/validations')
async def all_validation_history(before: UUID | None = None, user: UserProfile = Depends(get_current_user)):
    from app.services.coding_validation import public_job
    async with DatabaseConnection() as conn:
        cursor = await conn.fetchval('SELECT created_at FROM coding_validation_jobs WHERE user_id=$1 AND id=$2', user.id, before) if before else None
        if before and cursor is None:
            raise HTTPException(404, 'History cursor unavailable. Return to the newest results.')
        rows = await conn.fetch('''SELECT * FROM coding_validation_jobs WHERE user_id=$1
            AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid))
            ORDER BY created_at DESC,id DESC LIMIT 51''', user.id, cursor, before)
    return {'items': [public_job(row) for row in rows[:50]], 'next_cursor': str(rows[49]['id']) if len(rows) > 50 else None}


@router.get('/validations/{job_id}')
async def validation_receipt(job_id: UUID, user: UserProfile = Depends(get_current_user)):
    from app.services.coding_validation import public_job
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow('SELECT * FROM coding_validation_jobs WHERE user_id=$1 AND id=$2', user.id, job_id)
        if not row:
            raise HTTPException(404, 'Validation result not found.')
    return public_job(row)


@router.get('/workspace')
async def get_workspace(response: Response, user: UserProfile = Depends(require_sync)):
    response.headers['Cache-Control'] = 'private, no-store'
    async with DatabaseConnection() as conn:
        return await store.workspace(conn, user.id)


@router.put('/workspace')
async def save_workspace(request: WorkspaceWrite, user: UserProfile = Depends(require_sync)):
    check_owner(request, user)
    await rate_limit_user(user.id)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            return await store.write_workspace(conn, user.id, request.revision, request.state)


@router.get('/recovery')
async def recovery(response: Response, before: UUID | None = None, user: UserProfile = Depends(get_current_user)):
    """Authenticated read/export survives a feature rollback; no new writes."""
    response.headers['Cache-Control'] = 'private, no-store'
    async with DatabaseConnection() as conn:
        if not await conn.fetchval("SELECT to_regclass('coding_workspaces')"):
            return {'state': None, 'artifacts': [], 'message': 'No server coding storage has been installed.'}
        row = await conn.fetchrow('SELECT state,revision FROM coding_workspaces WHERE user_id=$1', user.id)
        cursor = await conn.fetchrow('SELECT created_at,id FROM coding_artifacts WHERE user_id=$1 AND id=$2', user.id, before) if before else None
        if before and not cursor: raise HTTPException(404, 'Export cursor not found. Restart the export.')
        artifacts = await conn.fetch('SELECT id,content,created_at FROM coding_artifacts WHERE user_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT 201', user.id, cursor['created_at'] if cursor else None, before)
    next_cursor = str(artifacts[199]['id']) if len(artifacts) > 200 else None
    artifacts = artifacts[:200]
    return {'state': store.obj(row['state']) if row else None, 'revision': row['revision'] if row else 0,
            'artifacts': [{'id': str(a['id']), 'content': store.obj(a['content']), 'created_at': a['created_at'].isoformat()} for a in artifacts],
            'artifact_export_limit': 200, 'next_cursor': next_cursor}


@router.post('/imports/preview')
async def preview_import(request: ImportPreview, user: UserProfile = Depends(require_sync)):
    check_owner(request, user)
    if not get_settings().CODING_GUEST_IMPORT_ENABLED:
        raise HTTPException(403, 'Guest import is not enabled.')
    await rate_limit_user(user.id)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            current = await store.workspace(conn, user.id, lock=True)
            try:
                merged, report = merge_guest(WorkspaceState.model_validate(current['state']), request.state)
            except ValidationError:
                raise HTTPException(422, 'The combined workspace exceeds its storage limits. Select fewer items; no data was changed.') from None
            # Bound abandoned preview storage without deleting committed receipts.
            await conn.execute("DELETE FROM coding_imports WHERE user_id=$1 AND committed_at IS NULL AND created_at < NOW()-INTERVAL '1 day'", user.id)
            fingerprint = digest(request.state.model_dump(mode='json'))
            previous_preview = await conn.fetchval('SELECT id FROM coding_imports WHERE user_id=$1 AND digest=$2 AND base_revision=$3', user.id, fingerprint, current['revision'])
            if not previous_preview and await conn.fetchval("SELECT count(*) FROM coding_imports WHERE user_id=$1 AND committed_at IS NULL", user.id) >= 20:
                raise HTTPException(429, 'Too many pending previews. Complete an existing import or try again tomorrow.')
            row = await conn.fetchrow('''INSERT INTO coding_imports(user_id,digest,base_revision,merged_state,report)
                VALUES($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT(user_id,digest,base_revision)
                DO UPDATE SET digest=EXCLUDED.digest RETURNING id''', user.id, fingerprint, current['revision'], merged.model_dump_json(), json.dumps(report))
    return {'id': str(row['id']), 'report': report, 'base_revision': current['revision'], 'authority': 'CLIENT_REPORTED',
            'policy': 'Existing records win conflicts. No original browser data is deleted. Imported results cannot establish verified readiness.'}


@router.post('/imports/{import_id}/commit')
async def commit_import(import_id: UUID, request: ImportCommit, user: UserProfile = Depends(require_sync)):
    check_owner(request, user)
    if not get_settings().CODING_GUEST_IMPORT_ENABLED:
        raise HTTPException(403, 'Guest import is not enabled.')
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            # Same lock order as preview: workspace before import.
            current = await store.workspace(conn, user.id, lock=True)
            row = await conn.fetchrow('SELECT * FROM coding_imports WHERE id=$1 AND user_id=$2 FOR UPDATE', import_id, user.id)
            if not row:
                raise HTTPException(404, 'Import not found.')
            if row['committed_at']:
                return {**current, 'already_committed': True}
            result = await store.write_workspace(conn, user.id, row['base_revision'], WorkspaceState.model_validate(store.obj(row['merged_state'])), source_kind='GUEST_IMPORT')
            await conn.execute('UPDATE coding_imports SET committed_at=NOW() WHERE id=$1 AND user_id=$2', import_id, user.id)
            return result


@router.post('/artifacts')
async def save_artifact(request: ArtifactWrite, user: UserProfile = Depends(require_sync)):
    check_owner(request, user)
    if not request.code.strip(): raise HTTPException(422, 'Add code before saving an interview artifact.')
    await rate_limit_user(user.id)
    async with DatabaseConnection() as conn:
        async with conn.transaction():
            return await store.artifact(conn, user.id, request)


@router.get('/artifacts')
async def list_artifacts(user: UserProfile = Depends(require_sync)):
    async with DatabaseConnection() as conn:
        rows = await conn.fetch('SELECT id,challenge_id,language,created_at FROM coding_artifacts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', user.id)
    return [{'id': str(r['id']), 'challenge_id': r['challenge_id'], 'language': r['language'], 'created_at': r['created_at'].isoformat()} for r in rows]


@router.get('/artifacts/{artifact_id}')
async def get_artifact(artifact_id: UUID, user: UserProfile = Depends(require_sync)):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow('SELECT id,content,created_at FROM coding_artifacts WHERE id=$1 AND user_id=$2', artifact_id, user.id)
    if not row:
        raise HTTPException(404, 'Artifact not found.')
    return {'id': str(row['id']), 'content': store.obj(row['content']), 'created_at': row['created_at'].isoformat(), 'authority': 'CLIENT_REPORTED'}


@router.post('/mentor')
async def ask_mentor(request: MentorRequest, user: UserProfile = Depends(require_sync)):
    check_owner(request, user)
    await rate_limit_user(user.id)
    from app.services.coding_mentor import mentor
    return await mentor(user.id, request)


@router.get('/mentor/{request_id}')
async def mentor_status(request_id: UUID, user: UserProfile = Depends(require_sync)):
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow("SELECT CASE WHEN state='RESERVED' AND created_at < NOW()-INTERVAL '90 seconds' THEN 'EXPIRED' ELSE state END AS state,response,provider,model FROM coding_ai_requests WHERE user_id=$1 AND request_id=$2", user.id, request_id)
    if not row: raise HTTPException(404, 'Mentor request not found.')
    return {'state': row['state'], 'response': store.obj(row['response']) if row['state'] == 'COMPLETED' else None, 'provider': row['provider'], 'model': row['model']}
