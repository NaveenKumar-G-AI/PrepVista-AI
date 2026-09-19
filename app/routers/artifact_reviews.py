"""Explicit per-artifact feedback consent. Never qualifies readiness evidence."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.dependencies import get_current_user, UserProfile
from app.routers.coding import check_owner, private_response, require_coding, require_sync, rate_limit_user
from app.services.coding_contracts import digest
from app.services.coding_store import obj

router = APIRouter(dependencies=[Depends(private_response)])
CONSENT = 'artifact-feedback-v1'


def reviewer_ids():
    values = set()
    for value in getattr(get_settings(), 'ARTIFACT_REVIEWER_PROFILE_IDS', '').split(','):
        try:
            identifier = UUID(value.strip())
            if str(identifier) == value.strip(): values.add(identifier)
        except ValueError:
            continue
    return sorted(values, key=str)[:50]


def require_enabled():
    if not getattr(get_settings(), 'ARTIFACT_REVIEW_ENABLED', False):
        raise HTTPException(403, 'Artifact feedback is not enabled.')


def require_reviewer(user):
    require_enabled()
    if UUID(str(user.id)) not in reviewer_ids():
        raise HTTPException(403, 'Artifact reviewer access is not available.')


class OwnerCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_owner_id: UUID


class ReviewRequest(OwnerCommand):
    artifact_id: UUID
    reviewer_id: UUID
    request_id: UUID
    consent_version: Literal['artifact-feedback-v1']
    share_saved_artifact: bool = Field(strict=True)

    @field_validator('share_saved_artifact')
    @classmethod
    def explicit_consent(cls, value):
        if value is not True: raise ValueError('Explicit artifact sharing consent is required')
        return value


class Feedback(OwnerCommand):
    rubric_version: Literal['artifact-feedback-v1']
    observations: dict[Literal['reasoning','correctness','debugging','ownership','communication','interview'],
        Literal['NOT_ASSESSED','OBSERVED_STRENGTH','OBSERVED_GAP','REVIEW_NEEDED']] = Field(min_length=1, max_length=6)
    feedback: str = Field(min_length=1, max_length=2000)


async def audit(conn, review_id, actor_id, action):
    await conn.execute('INSERT INTO artifact_review_audit(review_id,actor_id,action) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        review_id, UUID(str(actor_id)), action)


@router.get('/options')
async def options(user: UserProfile = Depends(get_current_user)):
    enabled = getattr(get_settings(), 'ARTIFACT_REVIEW_ENABLED', False)
    if not enabled: return {'enabled': False, 'reviewers': [], 'can_review': False, 'consent_version': CONSENT}
    await require_coding(user)
    await require_sync(user)
    async with DatabaseConnection() as conn:
        rows = await conn.fetch('SELECT id,full_name FROM profiles WHERE id=ANY($1::uuid[]) AND id<>$2 ORDER BY id', reviewer_ids(), UUID(str(user.id)))
    return {'enabled': True, 'reviewers': [{'id': str(row['id']), 'name': row['full_name'] or 'Artifact reviewer'} for row in rows],
        'can_review': UUID(str(user.id)) in reviewer_ids(), 'consent_version': CONSENT}


@router.post('', status_code=201)
async def create(request: ReviewRequest, user: UserProfile = Depends(require_sync)):
    require_enabled(); check_owner(request, user)
    await rate_limit_user(user.id)
    owner = UUID(str(user.id))
    if request.reviewer_id == owner or request.reviewer_id not in reviewer_ids():
        raise HTTPException(403, 'Choose an available reviewer other than yourself.')
    async with DatabaseConnection() as conn, conn.transaction():
        await conn.execute('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', f'artifact-review:{owner}')
        if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', owner):
            raise HTTPException(404, 'Account not found.')
        prior = await conn.fetchrow('SELECT * FROM artifact_review_requests WHERE user_id=$1 AND request_id=$2', owner, request.request_id)
        if prior:
            if (prior['artifact_id'], prior['reviewer_id']) != (request.artifact_id, request.reviewer_id):
                raise HTTPException(409, 'Request ID already used for different review consent.')
            return {'id': str(prior['id']), 'status': prior['status']}
        artifact = await conn.fetchrow('SELECT digest FROM coding_artifacts WHERE user_id=$1 AND id=$2 FOR SHARE', owner, request.artifact_id)
        if artifact is None: raise HTTPException(404, 'Saved artifact not found.')
        if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', request.reviewer_id):
            raise HTTPException(409, 'Reviewer is no longer available.')
        if await conn.fetchval("SELECT count(*) FROM artifact_review_requests WHERE user_id=$1 AND status='OPEN'", owner) >= 5:
            raise HTTPException(429, 'Complete or withdraw an open review before requesting another.')
        identifier = await conn.fetchval('''INSERT INTO artifact_review_requests(user_id,artifact_id,reviewer_id,request_id,artifact_digest,consent_version)
            VALUES($1,$2,$3,$4,$5,$6) RETURNING id''', owner, request.artifact_id, request.reviewer_id, request.request_id, artifact['digest'], CONSENT)
        await audit(conn, identifier, owner, 'CONSENT_GRANTED')
    return {'id': str(identifier), 'status': 'OPEN'}


@router.get('/mine')
async def mine(before: UUID | None = None, user: UserProfile = Depends(get_current_user)):
    async with DatabaseConnection() as conn:
        stamp = await conn.fetchval('SELECT created_at FROM artifact_review_requests WHERE user_id=$1 AND id=$2', UUID(str(user.id)), before) if before else None
        if before and stamp is None: raise HTTPException(404, 'Review history cursor not found.')
        rows = await conn.fetch('''SELECT r.id,r.artifact_id,r.status,r.created_at,r.withdrawn_at,r.consent_version,
            r.reviewer_id,f.content AS feedback FROM artifact_review_requests r LEFT JOIN artifact_review_feedback f ON f.review_id=r.id
            WHERE r.user_id=$1 AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2,$3::uuid))
            ORDER BY r.created_at DESC,r.id DESC LIMIT 51''', UUID(str(user.id)), stamp, before)
    return {'items': [{**dict(row), 'feedback': obj(row['feedback']) if row['feedback'] else None} for row in rows[:50]],
        'next_cursor': str(rows[49]['id']) if len(rows)>50 else None}


@router.post('/{review_id}/withdraw')
async def withdraw(review_id: UUID, request: OwnerCommand, user: UserProfile = Depends(get_current_user)):
    check_owner(request, user)
    async with DatabaseConnection() as conn, conn.transaction():
        row = await conn.fetchrow('SELECT status FROM artifact_review_requests WHERE id=$1 AND user_id=$2 FOR UPDATE', review_id, UUID(str(user.id)))
        if not row: raise HTTPException(404, 'Review request not found.')
        await conn.execute("UPDATE artifact_review_requests SET status='WITHDRAWN',withdrawn_at=COALESCE(withdrawn_at,NOW()) WHERE id=$1", review_id)
        await audit(conn, review_id, user.id, 'CONSENT_WITHDRAWN')
    return {'status': 'WITHDRAWN'}


@router.get('/inbox')
async def inbox(before: UUID | None = None, user: UserProfile = Depends(get_current_user)):
    require_reviewer(user)
    async with DatabaseConnection() as conn:
        stamp = await conn.fetchval('SELECT created_at FROM artifact_review_requests WHERE reviewer_id=$1 AND id=$2', UUID(str(user.id)), before) if before else None
        if before and stamp is None: raise HTTPException(404, 'Review inbox cursor not found.')
        rows = await conn.fetch('''SELECT id,status,created_at FROM artifact_review_requests WHERE reviewer_id=$1 AND status<>'WITHDRAWN'
            AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT 51''', UUID(str(user.id)), stamp, before)
    return {'items': [dict(row) for row in rows[:50]], 'next_cursor': str(rows[49]['id']) if len(rows)>50 else None}


@router.get('/{review_id}/artifact')
async def review_artifact(review_id: UUID, user: UserProfile = Depends(get_current_user)):
    require_reviewer(user)
    async with DatabaseConnection() as conn, conn.transaction():
        # The row lock serializes access with withdrawal. A prior download cannot
        # be recalled, but requests ordered after withdrawal cannot read the code.
        row = await conn.fetchrow('''SELECT r.status,r.artifact_digest,a.digest,a.content FROM artifact_review_requests r
            JOIN coding_artifacts a ON a.id=r.artifact_id AND a.user_id=r.user_id
            WHERE r.id=$1 AND r.reviewer_id=$2 AND r.status<>'WITHDRAWN' FOR SHARE OF r,a''', review_id, UUID(str(user.id)))
        if not row: raise HTTPException(404, 'Review consent or artifact is unavailable.')
        if row['artifact_digest'] != row['digest']: raise HTTPException(409, 'The shared artifact no longer matches its receipt.')
        content = obj(row['content'])
        return {'id': str(review_id), 'status': row['status'], 'rubric_version': CONSENT,
            'artifact': {key: content.get(key) for key in ('challenge_id','language','code','explanation','assistance')},
            'assessment_qualified': False}


@router.post('/{review_id}/feedback')
async def submit(review_id: UUID, request: Feedback, user: UserProfile = Depends(get_current_user)):
    require_reviewer(user); check_owner(request, user)
    await rate_limit_user(user.id)
    content = {**request.model_dump(mode='json', exclude={'expected_owner_id'}), 'assessment_qualified': False}
    fingerprint = digest(content)
    async with DatabaseConnection() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM artifact_review_requests WHERE id=$1 AND reviewer_id=$2 AND status<>'WITHDRAWN' FOR UPDATE", review_id, UUID(str(user.id)))
        if not row: raise HTTPException(404, 'Review consent is unavailable.')
        if row['artifact_digest'] != await conn.fetchval('SELECT digest FROM coding_artifacts WHERE id=$1 AND user_id=$2', row['artifact_id'], row['user_id']):
            raise HTTPException(409, 'The shared artifact no longer matches its receipt.')
        prior = await conn.fetchval('SELECT content_digest FROM artifact_review_feedback WHERE review_id=$1', review_id)
        if prior and prior != fingerprint: raise HTTPException(409, 'Feedback was already saved. Its receipt cannot be overwritten.')
        if not prior:
            import json
            await conn.execute('INSERT INTO artifact_review_feedback(review_id,reviewer_id,content,content_digest) VALUES($1,$2,$3::jsonb,$4)', review_id, UUID(str(user.id)), json.dumps(content), fingerprint)
            await conn.execute("UPDATE artifact_review_requests SET status='REVIEWED' WHERE id=$1", review_id)
            await audit(conn, review_id, user.id, 'FEEDBACK_SAVED')
    return {'status': 'REVIEWED', 'assessment_qualified': False}
