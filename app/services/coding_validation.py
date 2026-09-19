"""Durable isolated-run reservations. This module never executes student code."""
import asyncio
from hashlib import sha256
import json
import re
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from typing import Literal

from app.config import get_settings
from app.database.connection import DatabaseConnection
from app.services.coding_store import obj
from app.services.coding_validation_suites import suite_for


class ValidationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expected_owner_id: UUID
    request_id: UUID


class Check(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    id: str = Field(max_length=40)
    status: Literal['PASSED', 'WRONG_ANSWER', 'RUNTIME_ERROR', 'TIME_LIMIT', 'OUTPUT_LIMIT']


class RunnerResult(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    schema_version: Literal[1]
    job_id: str
    lease_token: str
    code_sha256: str
    suite_sha256: str
    runner_image: str
    checks: list[Check] = Field(min_length=1, max_length=30)
    passed: StrictInt = Field(ge=0, le=30)


def configured(settings):
    try:
        endpoint = urlsplit(settings.CODING_RUNNER_URL)
        return bool(settings.CODING_TRUSTED_VALIDATION_ENABLED
            and endpoint.scheme == 'https' and endpoint.hostname and not endpoint.username
            and not endpoint.password and not endpoint.query and not endpoint.fragment
            and endpoint.path in ('', '/')
            and len(settings.CODING_RUNNER_TOKEN) >= 32
            and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,120}', settings.CODING_RUNNER_QUALIFICATION_ID)
            and re.fullmatch(r'[a-z0-9][a-z0-9._:/-]+@sha256:[a-f0-9]{64}', settings.CODING_RUNNER_IMAGE))
    except (AttributeError, ValueError):
        return False


def public_job(row):
    return {'id': str(row['id']), 'artifact_id': str(row['artifact_id']), 'state': row['state'],
            'qualification_id': row['qualification_id'], 'code_sha256': row['code_sha256'], 'suite_sha256': row['suite_sha256'],
            'suite_id': row['suite_id'], 'created_at': row['created_at'].isoformat(),
            'completed_at': row['completed_at'].isoformat() if row['completed_at'] else None,
            'result': obj(row['result']) if row['result'] else None,
            'note': 'Server checks cover this saved version and suite only. They do not establish authorship, unaided work or role readiness.'}


async def enqueue(conn, user_id, artifact_id, request_id):
    settings = get_settings()
    if not configured(settings):
        raise HTTPException(503, 'Isolated server validation is not available. Browser practice is preserved.')
    if not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', user_id):
        raise HTTPException(404, 'Account not found.')
    # Fixed shared lock serializes reservations across all application instances.
    await conn.execute('SELECT pg_advisory_xact_lock(73142092)')
    prior = await conn.fetchrow('SELECT * FROM coding_validation_jobs WHERE user_id=$1 AND request_id=$2', user_id, request_id)
    if prior:
        if prior['artifact_id'] != artifact_id:
            raise HTTPException(409, 'This request ID belongs to another artifact.')
        return public_job(prior)
    artifact = await conn.fetchrow('SELECT content FROM coding_artifacts WHERE user_id=$1 AND id=$2 FOR KEY SHARE', user_id, artifact_id)
    if not artifact:
        raise HTTPException(404, 'Artifact not found.')
    content = obj(artifact['content']); suite = suite_for(content)
    if suite is None:
        raise HTTPException(422, 'This task version or language does not have a server validation suite.')
    daily = await conn.fetchval("SELECT count(*) FROM coding_validation_jobs WHERE user_id=$1 AND created_at >= date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'", user_id)
    global_daily = await conn.fetchval("SELECT count(*) FROM coding_validation_jobs WHERE created_at >= date_trunc('day',NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'")
    busy = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM coding_validation_jobs WHERE user_id=$1 AND state IN ('QUEUED','RUNNING'))", user_id)
    if busy or daily >= settings.CODING_VALIDATION_DAILY_LIMIT or global_daily >= settings.CODING_VALIDATION_GLOBAL_DAILY_LIMIT:
        raise HTTPException(429, 'Server validation allowance is exhausted or a check is pending. No interview credit was used.')
    row = await conn.fetchrow('''INSERT INTO coding_validation_jobs(user_id,artifact_id,request_id,suite_id,suite_sha256,code_sha256,qualification_id,runner_image)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *''', user_id, artifact_id, request_id,
        suite['suite_id'], suite['suite_sha256'], sha256(content['code'].encode()).hexdigest(),
        settings.CODING_RUNNER_QUALIFICATION_ID, settings.CODING_RUNNER_IMAGE)
    return public_job(row)


async def claim(conn):
    settings = get_settings()
    if not configured(settings):
        return None
    await conn.execute('SELECT pg_advisory_xact_lock(73142092)')
    await conn.execute("UPDATE coding_validation_jobs SET state='UNAVAILABLE',completed_at=NOW() WHERE (state='RUNNING' AND lease_until < NOW()) OR (state='QUEUED' AND created_at < NOW()-INTERVAL '15 minutes')")
    if await conn.fetchval("SELECT count(*) FROM coding_validation_jobs WHERE state='RUNNING'") >= settings.CODING_VALIDATION_GLOBAL_CONCURRENCY:
        return None
    row = await conn.fetchrow("SELECT * FROM coding_validation_jobs WHERE state='QUEUED' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED")
    if not row:
        return None
    enrolled = str(row['user_id']) in {v.strip() for v in settings.CODING_PILOT_PROFILE_IDS.split(',')}
    valid = (enrolled and settings.CODING_WORKSPACE_ENABLED and settings.CODING_SERVER_SYNC_ENABLED
             and row['qualification_id'] == settings.CODING_RUNNER_QUALIFICATION_ID and row['runner_image'] == settings.CODING_RUNNER_IMAGE)
    content = obj(await conn.fetchval('SELECT content FROM coding_artifacts WHERE user_id=$1 AND id=$2', row['user_id'], row['artifact_id']))
    suite = suite_for(content or {})
    if not valid or not suite or suite['suite_sha256'] != row['suite_sha256'] or sha256(content['code'].encode()).hexdigest() != row['code_sha256']:
        await conn.execute("UPDATE coding_validation_jobs SET state='UNAVAILABLE',completed_at=NOW() WHERE id=$1", row['id'])
        return {'unavailable': True}
    lease = uuid4()
    await conn.execute("UPDATE coding_validation_jobs SET state='RUNNING',lease_token=$2,lease_until=NOW()+INTERVAL '45 seconds' WHERE id=$1", row['id'], lease)
    return {'schema_version': 1, 'job_id': str(row['id']), 'lease_token': str(lease),
            'code_sha256': row['code_sha256'], 'suite_sha256': row['suite_sha256'],
            'runner_image': row['runner_image'], 'code': content['code'], 'entry': suite['entry'], 'tests': suite['tests']}


def validate_result(request, raw):
    if not isinstance(raw, dict) or type(raw.get('schema_version')) is not int or raw['schema_version'] != 1:
        raise ValueError('Unsupported runner result version')
    result = RunnerResult.model_validate(raw).model_dump()
    for key in ('job_id', 'lease_token', 'code_sha256', 'suite_sha256', 'runner_image'):
        if result[key] != request[key]:
            raise ValueError('Runner result identity mismatch')
    if [c['id'] for c in result['checks']] != [c['id'] for c in request['tests']]:
        raise ValueError('Runner check set mismatch')
    if result['passed'] != sum(c['status'] == 'PASSED' for c in result['checks']):
        raise ValueError('Runner count mismatch')
    return result


async def run_remote(request):
    settings = get_settings()
    if not configured(settings):
        raise ValueError('Runner configuration unavailable')
    # A fixed operator-configured HTTPS origin; no redirects, env proxies or
    # client-supplied URL. Only code and tests reach the isolated runner gateway.
    async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False) as client:
        async with client.stream('POST', settings.CODING_RUNNER_URL.rstrip('/') + '/v1/validate',
                headers={'Authorization': 'Bearer ' + settings.CODING_RUNNER_TOKEN}, json=request) as response:
            if response.status_code != 200:
                raise ValueError('Runner unavailable')
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data.extend(chunk)
                if len(data) > 16000:
                    raise ValueError('Runner response too large')
            return validate_result(request, json.loads(data))


async def settle(conn, request, result):
    # Single-use lease: late/duplicate responses never overwrite acknowledged
    # results or recreate rows removed by artifact/account deletion.
    owner = await conn.fetchval('SELECT user_id FROM coding_validation_jobs WHERE id=$1', UUID(request['job_id']))
    if owner is None or not await conn.fetchval('SELECT id FROM profiles WHERE id=$1 FOR KEY SHARE', owner):
        return None
    if result is not None:
        result = validate_result(request, result)
    summary = None if result is None else {
        'authority': 'ISOLATED_SERVER_TEST', 'passed': result['passed'], 'total': len(result['checks']),
        'checks': result['checks'], 'code_sha256': result['code_sha256'],
        'suite_sha256': result['suite_sha256'], 'runner_image': result['runner_image']}
    return await conn.fetchval('''UPDATE coding_validation_jobs SET state=$3,result=$4::jsonb,completed_at=NOW()
        WHERE id=$1 AND lease_token=$2 AND state='RUNNING' AND lease_until >= NOW() RETURNING id''',
        UUID(request['job_id']), UUID(request['lease_token']), 'COMPLETED' if summary else 'UNAVAILABLE', json.dumps(summary) if summary else None)


async def tick():
    if not configured(get_settings()):
        return {'enabled': False}
    async with DatabaseConnection() as conn, conn.transaction():
        request = await claim(conn)
    if not request or request.get('unavailable'):
        return {'enabled': True, 'processed': 0}
    try:
        result = await asyncio.wait_for(run_remote(request), timeout=25)
    except Exception:
        result = None
    async with DatabaseConnection() as conn, conn.transaction():
        committed = await settle(conn, request, result)
    return {'enabled': True, 'processed': int(committed is not None), 'available': result is not None and committed is not None}
