"""Real PostgreSQL integration tests. Run through tools/integration-db/npm test.

Each test uses a new schema in an explicitly named local test database. No
application DATABASE_URL is read and no existing schema is dropped.
"""
import asyncio
import json
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app.dependencies import get_current_user, get_org_admin
from app.routers import coding, journey, interview_practice, journey_assignments
from app.routers import artifact_reviews
from app.services import coding_store, coding_mentor, unified_assignments, coding_validation
from app.services.coding_contracts import WorkspaceState, ArtifactWrite, MentorRequest
from app.services.unified_readiness import snapshot
from app.services.unified_evidence import process_event, backfill, lock_projection_owner

URL = os.getenv('CODING_TEST_DATABASE_URL', '')
pytestmark = pytest.mark.skipif(not URL, reason='Explicit local coding test database required')


@pytest.fixture
def database(monkeypatch, request):
    from urllib.parse import urlparse
    parsed = urlparse(URL)
    assert parsed.hostname in ('127.0.0.1', 'localhost') and parsed.path == '/prepvista_integration_test'
    schema = 'coding_test_' + uuid4().hex
    users = [uuid4(), uuid4()]
    orgs = [uuid4(), uuid4()]
    pre_integration = getattr(request, 'param', None) == 'pre_integration'

    class Connection:
        async def __aenter__(self):
            self.conn = await asyncpg.connect(URL, server_settings={'search_path': schema + ',public'})
            return self.conn
        async def __aexit__(self, *args):
            await self.conn.close()

    async def setup():
        conn = await asyncpg.connect(URL)
        try:
            await conn.execute(f'CREATE SCHEMA {schema}')
            await conn.execute(f'SET search_path TO {schema},public')
            await conn.execute('''CREATE TABLE profiles(id UUID PRIMARY KEY,full_name TEXT DEFAULT 'Fixture reviewer');
                CREATE TABLE organizations(id UUID PRIMARY KEY, status TEXT DEFAULT 'active', name TEXT DEFAULT 'Test institution');
                CREATE TABLE organization_students(user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, organization_id UUID REFERENCES organizations(id),status TEXT);
                CREATE TABLE interview_sessions(id UUID PRIMARY KEY,user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,state TEXT,runtime_state JSONB,finished_at TIMESTAMPTZ);''')
            await conn.execute(Path('app/database/migrations/037_interview_coaching_v2.sql').read_text())
            if not pre_integration:
                await conn.execute(Path('app/database/migrations/038_unified_coding.sql').read_text())
            # Reuse the actual legacy intervention DDL with isolated enum schemas.
            import re
            legacy = Path('app/database/migrations/029_training_readiness.sql').read_text()
            for name in ('intervention_type', 'priority', 'intervention_assignment_status'):
                statement = re.search(r'CREATE TYPE "public"\."' + name + r'" AS ENUM\([^;]+;', legacy).group(0)
                await conn.execute(statement.replace('"public".', ''))
            for name in ('intervention', 'intervention_assignment', 'audit_log'):
                statement = re.search(r'CREATE TABLE "' + name + r'" \([\s\S]+?\n\);', legacy).group(0)
                await conn.execute(statement.replace('"public".', ''))
            await conn.execute('''ALTER TABLE intervention ADD FOREIGN KEY(institution_id) REFERENCES organizations(id) ON DELETE CASCADE;
                ALTER TABLE intervention_assignment ADD FOREIGN KEY(intervention_id) REFERENCES intervention(id) ON DELETE CASCADE;
                ALTER TABLE intervention_assignment ADD FOREIGN KEY(student_id) REFERENCES profiles(id) ON DELETE CASCADE;
                CREATE TABLE placement_seasons(id UUID PRIMARY KEY,organization_id UUID REFERENCES organizations(id),status TEXT DEFAULT 'ACTIVE',name TEXT DEFAULT 'Test season',starts_on DATE DEFAULT CURRENT_DATE);''')
            if not pre_integration:
                await conn.execute(Path('app/database/migrations/039_unified_assignments.sql').read_text())
                await conn.execute(Path('app/database/migrations/040_coding_validation.sql').read_text())
                await conn.execute(Path('app/database/migrations/041_unified_evidence_recovery.sql').read_text())
                await conn.execute(Path('app/database/migrations/042_artifact_review_consent.sql').read_text())
            await conn.executemany('INSERT INTO profiles(id) VALUES($1)', [(u,) for u in users])
            await conn.executemany('INSERT INTO organizations(id) VALUES($1)', [(o,) for o in orgs])
            await conn.execute("INSERT INTO organization_students VALUES($1,$2,'active')", users[0], orgs[0])
        finally:
            await conn.close()
    asyncio.run(setup())
    settings = SimpleNamespace(CODING_WORKSPACE_ENABLED=True, CODING_PILOT_PROFILE_IDS=','.join(map(str, users)), CODING_SERVER_SYNC_ENABLED=True,
        CODING_GUEST_IMPORT_ENABLED=True, CODING_AI_ENABLED=True, UNIFIED_READINESS_VISIBLE=True, UNIFIED_TPO_VISIBLE=False, UNIFIED_ASSIGNMENTS_ENABLED=True,
        CODING_AI_DAILY_LIMIT=2, CODING_AI_GLOBAL_DAILY_LIMIT=5, CODING_AI_GLOBAL_CONCURRENCY=2, CODING_AI_PROVIDER='mock', CODING_AI_MODEL='test')
    async def no_rate_limit(*args): pass
    for module in (coding, journey, coding_mentor, journey_assignments):
        monkeypatch.setattr(module, 'DatabaseConnection', Connection)
        monkeypatch.setattr(module, 'get_settings', lambda: settings)
    monkeypatch.setattr(unified_assignments, 'get_settings', lambda: settings)
    monkeypatch.setattr(coding_validation, 'get_settings', lambda: settings)
    monkeypatch.setattr(coding_validation, 'DatabaseConnection', Connection)
    monkeypatch.setattr(coding, 'rate_limit_user', no_rate_limit)
    monkeypatch.setattr(journey_assignments, 'rate_limit_user', no_rate_limit)
    monkeypatch.setattr(artifact_reviews, 'get_settings', lambda: settings)
    monkeypatch.setattr(artifact_reviews, 'DatabaseConnection', Connection)
    monkeypatch.setattr(artifact_reviews, 'rate_limit_user', no_rate_limit)
    monkeypatch.setattr(interview_practice, 'DatabaseConnection', Connection)
    monkeypatch.setattr(interview_practice, 'rate_limit_user', no_rate_limit)
    return SimpleNamespace(connect=Connection, users=users, orgs=orgs, settings=settings, schema=schema)


@pytest.fixture
def http(database):
    app = FastAPI()
    app.include_router(coding.router, prefix='/coding')
    app.include_router(journey.router, prefix='/journey')
    app.include_router(journey_assignments.router, prefix='/journey')
    app.include_router(artifact_reviews.router, prefix='/artifact-reviews')
    app.include_router(interview_practice.router, prefix='/interviews')
    user = SimpleNamespace(id=str(database.users[0]), premium_override=False, effective_plan='career')
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_org_admin] = lambda: SimpleNamespace(is_active=True, admin_role='org_admin', organization_id=str(database.orgs[0]), user_id=user.id)
    with TestClient(app) as client:
        yield client, user


def assignment_request(database, http, **changes):
    _, user = http
    season = uuid4()
    async def seed():
        async with database.connect() as conn:
            await conn.execute('INSERT INTO placement_seasons(id,organization_id) VALUES($1,$2)', season, database.orgs[0])
    asyncio.run(seed())
    return {'expected_owner_id': user.id, 'request_id': str(uuid4()), 'season_id': str(season),
        'student_ids': [user.id], 'task_kind': 'PROJECT', 'title': 'Explain notification retries',
        'instructions': 'Build the notification project and explain your tests.', **changes}


def test_assignments_reuse_interventions_and_complete_only_from_accepted_work(database, http):
    client, user = http
    payload = assignment_request(database, http)
    created = client.post('/journey/assignments', json=payload)
    assert created.status_code == 201, created.text
    assert client.post('/journey/assignments', json=payload).json()['id'] == created.json()['id']
    assert client.post('/journey/assignments', json={**payload, 'title': 'Changed payload'}).status_code == 409
    assignment = client.get('/journey/assignments/mine').json()['items'][0]
    path = '/journey/assignments/' + assignment['id']
    assert assignment['mission_id'] is None
    assert client.post(path + '/accept', json={'expected_owner_id': user.id, 'share_completion': False}).status_code == 422
    consent = {'expected_owner_id': user.id, 'share_completion': True}
    accepted = client.post(path + '/accept', json=consent)
    mission = accepted.json()['mission_id']
    context = client.get('/journey/missions/' + mission).json()
    assert context['origin'] == 'ORGANIZATION_ASSIGNMENT' and 'code' not in context
    assert client.post(path + '/accept', json=consent).json()['mission_id'] == mission
    assert client.post('/journey/missions/' + mission + '/launch', json={'expected_owner_id': user.id}).status_code == 200
    assert client.get('/journey/assignments/staff').json()['items'][0]['status'] == 'ACKNOWLEDGED'
    save = {'expected_owner_id': user.id, 'request_id': str(uuid4()), 'mission_id': mission, 'challenge_id': 'notification-project', 'code': 'function deliver() { return 1; }'}
    assert client.post('/coding/artifacts', json=save).status_code == 422
    save['explanation'] = 'I checked duplicate delivery using the same idempotency key.'
    assert client.post('/coding/artifacts', json={**save, 'challenge_id': 'unrelated-task'}).status_code == 409
    artifact = client.post('/coding/artifacts', json=save)
    assert artifact.status_code == 200, artifact.text
    staff = client.get('/journey/assignments/staff').json()['items'][0]
    assert staff['status'] == 'COMPLETED'
    assert not {'code', 'content', 'mission_id', 'completion_source_id', 'snapshot', 'explanation'} & set(staff)
    assert artifact.json()['id'] not in json.dumps(staff)
    async def check():
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM intervention') == 1
            assert await conn.fetchval('SELECT count(*) FROM intervention_assignment') == 1
            assert await conn.fetchval('SELECT count(*) FROM audit_log') == 2
            assert await conn.fetchval('SELECT count(*) FROM unified_sharing') == 0
    asyncio.run(check())


def test_assignment_scope_guards_reject_foreign_students_seasons_and_staff(database, http):
    client, user = http
    payload = assignment_request(database, http)
    assert client.post('/journey/assignments', json={**payload, 'student_ids': [str(database.users[1])]}).status_code == 403
    assert client.post('/journey/assignments', json={**payload, 'season_id': str(uuid4())}).status_code == 403
    assert client.post('/journey/assignments', json={**payload, 'expected_owner_id': str(database.users[1])}).status_code == 409
    assert client.post('/journey/assignments', json={**payload, 'student_ids': [user.id, user.id]}).status_code == 422
    client.post('/journey/assignments', json=payload)
    assignment = client.get('/journey/assignments/mine').json()['items'][0]['id']
    own_mission = client.post(f'/journey/assignments/{assignment}/accept', json={'expected_owner_id': user.id, 'share_completion': True}).json()['mission_id']
    user.id = str(database.users[1])
    assert client.get('/journey/missions/' + own_mission).status_code == 404
    assert client.get('/journey/assignments/mine').json()['items'] == []
    assert client.post(f'/journey/assignments/{assignment}/accept', json={'expected_owner_id': user.id, 'share_completion': True}).status_code == 404
    client.app.dependency_overrides[get_org_admin] = lambda: SimpleNamespace(is_active=True, admin_role='department_admin', organization_id=str(database.orgs[0]), user_id=user.id)
    assert client.get('/journey/assignments/options').status_code == 403
    client.app.dependency_overrides[get_org_admin] = lambda: SimpleNamespace(is_active=True, admin_role='org_admin', organization_id=str(database.orgs[1]), user_id=user.id)
    assert client.get('/journey/assignments/staff').json()['items'] == []
    assert client.post(f'/journey/assignments/{assignment}/cancel', json={'expected_owner_id': user.id}).status_code == 404


def test_assignment_withdrawal_and_cancel_preserve_personal_artifacts(database, http):
    client, user = http
    client.post('/journey/assignments', json=assignment_request(database, http))
    assignment = client.get('/journey/assignments/mine').json()['items'][0]['id']
    mission = client.post(f'/journey/assignments/{assignment}/accept', json={'expected_owner_id': user.id, 'share_completion': True}).json()['mission_id']
    client.post('/journey/missions/' + mission + '/launch', json={'expected_owner_id': user.id})
    assert client.post(f'/journey/assignments/{assignment}/cancel', json={'expected_owner_id': user.id}).status_code == 200
    save = {'expected_owner_id': user.id, 'request_id': str(uuid4()), 'mission_id': mission, 'challenge_id': 'notification-project', 'code': 'private work', 'explanation': 'my tests'}
    assert client.post('/coding/artifacts', json=save).status_code == 409
    assert client.post('/coding/artifacts', json={**save, 'mission_id': None}).status_code == 200
    database.settings.UNIFIED_ASSIGNMENTS_ENABLED = False
    assert client.get('/journey/assignments/mine').json()['items']
    assert client.post(f'/journey/assignments/{assignment}/withdraw', json={'expected_owner_id': user.id}).status_code == 200
    assert client.get('/coding/recovery').json()['artifacts']


def test_assignment_membership_revocation_blocks_launch_and_submission(database, http):
    client, user = http
    client.post('/journey/assignments', json=assignment_request(database, http))
    assignment = client.get('/journey/assignments/mine').json()['items'][0]['id']
    mission = client.post(f'/journey/assignments/{assignment}/accept', json={'expected_owner_id': user.id, 'share_completion': True}).json()['mission_id']
    client.post('/journey/missions/' + mission + '/launch', json={'expected_owner_id': user.id})
    async def revoke():
        async with database.connect() as conn:
            await conn.execute("UPDATE organization_students SET status='inactive' WHERE user_id=$1", database.users[0])
    asyncio.run(revoke())
    assert client.post('/journey/missions/' + mission + '/launch', json={'expected_owner_id': user.id}).status_code == 403
    assert client.post('/coding/artifacts', json={'expected_owner_id': user.id, 'request_id': str(uuid4()), 'mission_id': mission, 'challenge_id': 'notification-project', 'code': 'saved code', 'explanation': 'tests'}).status_code == 403
    assert client.get('/journey/assignments/staff').json()['items'] == []
    assert client.post(f'/journey/assignments/{assignment}/withdraw', json={'expected_owner_id': user.id}).status_code == 200


def test_interview_assignment_finishes_atomically_without_sharing_private_context(database, http):
    client, user = http
    client.post('/journey/assignments', json=assignment_request(database, http, task_kind='INTERVIEW'))
    assignment = client.get('/journey/assignments/mine').json()['items'][0]['id']
    mission = client.post(f'/journey/assignments/{assignment}/accept', json={'expected_owner_id': user.id, 'share_completion': True}).json()['mission_id']
    session = uuid4()
    async def finish():
        async with database.connect() as conn, conn.transaction():
            await conn.execute("UPDATE practice_missions SET status='LAUNCHED' WHERE id=$1", UUID(mission))
            await conn.execute("INSERT INTO interview_sessions(id,user_id,state,runtime_state) VALUES($1,$2,'ACTIVE',$3::jsonb)", session, database.users[0], json.dumps({'orchestrator_v2': {'mission_id': mission}, 'private_transcript': 'private interview content'}))
            await conn.execute("UPDATE interview_sessions SET state='FINISHED',finished_at=NOW() WHERE id=$1", session)
    asyncio.run(finish())
    staff = client.get('/journey/assignments/staff').json()['items'][0]
    assert staff['status'] == 'COMPLETED'
    assert 'private interview content' not in json.dumps(staff) and str(session) not in json.dumps(staff)
    async def erase():
        async with database.connect() as conn, conn.transaction():
            await conn.execute('DELETE FROM interview_sessions WHERE id=$1', session)
    asyncio.run(erase())
    staff = client.get('/journey/assignments/staff').json()['items'][0]
    assert staff['status'] == 'CANCELLED' and staff['completed_at'] is None


def validation_settings(database):
    from tests.test_coding_validation import config
    for key, value in vars(config()).items():
        setattr(database.settings, key, value)
    database.settings.CODING_VALIDATION_DAILY_LIMIT = 2
    database.settings.CODING_VALIDATION_GLOBAL_DAILY_LIMIT = 4
    database.settings.CODING_VALIDATION_GLOBAL_CONCURRENCY = 1


def validation_artifact(http, **changes):
    client, user = http
    result = client.post('/coding/artifacts', json={'expected_owner_id': user.id, 'request_id': str(uuid4()),
        'challenge_id': 'search-insert-position', 'challenge_version': 1, 'language': 'javascript',
        'code': 'function search_insert_position(nums, target) { return 0; }', **changes})
    assert result.status_code == 200
    return result.json()['id']


def validation_result(request):
    return {key: request[key] for key in ('schema_version','job_id','lease_token','code_sha256','suite_sha256','runner_image')} | {
        'passed': len(request['tests']), 'checks': [{'id': test['id'], 'status': 'PASSED'} for test in request['tests']]}


def test_validation_owner_scope_idempotency_and_no_browser_trust_upgrade(database, http):
    validation_settings(database)
    client, user = http
    artifact = validation_artifact(http)
    path = '/coding/artifacts/' + artifact + '/validate'
    payload = {'expected_owner_id': user.id, 'request_id': str(uuid4())}
    response = client.post(path, json=payload)
    assert response.status_code == 202
    assert response.json()['state'] == 'QUEUED'
    assert client.post(path, json=payload).json()['id'] == response.json()['id']
    receipt = '/coding/validations/' + response.json()['id']
    assert client.get(receipt).status_code == 200
    assert client.post(path, json={**payload, 'passed': 10}).status_code == 422
    assert client.post(path, json={**payload, 'request_id': str(uuid4())}).status_code == 429
    assert client.get('/coding/artifacts/' + artifact).json()['authority'] == 'CLIENT_REPORTED'
    assert client.get('/coding/access').json()['interview_credits_consumed'] == 0
    user.id = str(database.users[1])
    assert client.get(receipt).status_code == 404
    assert client.post(path, json={**payload, 'expected_owner_id': user.id}).status_code == 404
    assert client.get('/coding/artifacts/' + artifact + '/validations').status_code == 404
    assert client.post(path, json=payload).status_code == 409


def test_validation_receipt_settles_once_survives_flags_and_cannot_resurrect_erased_source(database, http):
    validation_settings(database)
    client, user = http
    artifact = validation_artifact(http)
    path = '/coding/artifacts/' + artifact
    client.post(path + '/validate', json={'expected_owner_id': user.id, 'request_id': str(uuid4())})
    async def complete():
        async with database.connect() as conn:
            async with conn.transaction(): request = await coding_validation.claim(conn)
            result = validation_result(request)
            with pytest.raises(ValueError):
                async with conn.transaction():
                    await coding_validation.settle(conn, request, {**result, 'lease_token': str(uuid4())})
            async with conn.transaction(): assert await coding_validation.settle(conn, request, result)
            async with conn.transaction(): assert await coding_validation.settle(conn, request, result) is None
            assert await conn.fetchval('SELECT count(*) FROM coding_validation_jobs') == 1
            assert await conn.fetchval("SELECT count(*) FROM unified_evidence_events WHERE source_module='coding_validation'") == 1
            events = await conn.fetch('SELECT id FROM unified_evidence_events ORDER BY id')
            async with conn.transaction():
                for event in events: await process_event(conn, event['id'])
                first = await snapshot(conn, database.users[0])
                assert first['id'] == (await snapshot(conn, database.users[0]))['id']
                correctness = next(row for row in first['rows'] if row['key'] == 'correctness')
                assert correctness['coverage'] == 1
                assert correctness['sources'][0]['authority'] == 'ISOLATED_SERVER_TEST'
                assert first['overall_state'] == 'MORE_EVIDENCE_NEEDED'
            return request, result
    request, result = asyncio.run(complete())
    database.settings.CODING_TRUSTED_VALIDATION_ENABLED = False
    database.settings.CODING_WORKSPACE_ENABLED = False
    history = client.get(path + '/validations')
    assert len(client.get('/coding/validations').json()['items']) == 1
    assert history.status_code == 200 and 'no-store' in history.headers['cache-control']
    assert history.json()['items'][0]['result']['authority'] == 'ISOLATED_SERVER_TEST'
    assert 'lease_token' not in history.text and 'expected' not in history.text
    async def erase():
        async with database.connect() as conn, conn.transaction():
            await conn.execute('DELETE FROM coding_artifacts WHERE id=$1', UUID(artifact))
            assert await coding_validation.settle(conn, request, result) is None
            assert await conn.fetchval('SELECT count(*) FROM coding_validation_jobs') == 0
            assert await conn.fetchval("SELECT count(*) FROM unified_evidence_events WHERE source_module='coding_validation'") == 0
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots') == 0
    asyncio.run(erase())
    assert client.get(path + '/validations').status_code == 404


def test_validation_expiry_failure_and_configuration_changes_never_become_failed_student_scores(database, http, monkeypatch):
    validation_settings(database)
    client, user = http
    artifact = validation_artifact(http)
    path = '/coding/artifacts/' + artifact
    client.post(path + '/validate', json={'expected_owner_id': user.id, 'request_id': str(uuid4())})
    async def expire():
        async with database.connect() as conn:
            async with conn.transaction(): request = await coding_validation.claim(conn)
            await conn.execute("UPDATE coding_validation_jobs SET lease_until=NOW()-INTERVAL '1 second'")
            async with conn.transaction():
                assert await coding_validation.settle(conn, request, validation_result(request)) is None
                assert await coding_validation.claim(conn) is None
    asyncio.run(expire())
    assert client.get(path + '/validations').json()['items'][0]['state'] == 'UNAVAILABLE'
    client.post(path + '/validate', json={'expected_owner_id': user.id, 'request_id': str(uuid4())})
    async def unavailable(request): raise RuntimeError('private driver error')
    monkeypatch.setattr(coding_validation, 'run_remote', unavailable)
    assert asyncio.run(coding_validation.tick())['available'] is False
    jobs = client.get(path + '/validations').json()['items']
    assert all(job['state'] == 'UNAVAILABLE' and job['result'] is None for job in jobs)
    assert client.post(path + '/validate', json={'expected_owner_id': user.id, 'request_id': str(uuid4())}).status_code == 429


def test_validation_unsupported_tasks_and_browser_rls_are_enforced(database, http):
    validation_settings(database)
    client, user = http
    unsupported = validation_artifact(http, language='python')
    payload = {'expected_owner_id': user.id, 'request_id': str(uuid4())}
    assert client.post('/coding/artifacts/' + unsupported + '/validate', json=payload).status_code == 422
    artifact = validation_artifact(http)
    client.post('/coding/artifacts/' + artifact + '/validate', json=payload)
    async def check():
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM coding_validation_jobs') == 1
            role = 'validation_browser_' + uuid4().hex
            await conn.execute(f'CREATE ROLE {role} NOLOGIN')
            await conn.execute(f'GRANT USAGE ON SCHEMA {database.schema} TO {role}')
            await conn.execute(f'GRANT SELECT,INSERT,UPDATE,DELETE ON coding_validation_jobs TO {role}')
            try:
                await conn.execute(f'SET ROLE {role}')
                assert await conn.fetchval('SELECT count(*) FROM coding_validation_jobs') == 0
                assert await conn.execute("UPDATE coding_validation_jobs SET state='UNAVAILABLE'") == 'UPDATE 0'
            finally: await conn.execute('RESET ROLE')
    asyncio.run(check())


def test_validation_global_reservations_are_atomic_across_accounts(database, http):
    validation_settings(database)
    database.settings.CODING_VALIDATION_GLOBAL_DAILY_LIMIT = 1
    _, user = http
    first = UUID(validation_artifact(http))
    user.id = str(database.users[1]); second = UUID(validation_artifact(http))
    async def reserve(owner, artifact):
        try:
            async with database.connect() as conn, conn.transaction():
                await coding_validation.enqueue(conn, owner, artifact, uuid4())
            return 202
        except HTTPException as error: return error.status_code
    async def run():
        outcomes = await asyncio.gather(reserve(database.users[0], first), reserve(database.users[1], second))
        assert sorted(outcomes) == [202, 429]
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM coding_validation_jobs') == 1
    asyncio.run(run())


def test_validation_dispatch_abstains_when_pilot_or_qualified_image_changes(database, http):
    validation_settings(database)
    client, user = http
    artifact = validation_artifact(http)
    path = '/coding/artifacts/' + artifact + '/validate'
    client.post(path, json={'expected_owner_id': user.id, 'request_id': str(uuid4())})
    database.settings.CODING_RUNNER_QUALIFICATION_ID = 'replacement-review-v2'
    async def reject_changed_qualification():
        async with database.connect() as conn, conn.transaction():
            assert await coding_validation.claim(conn) == {'unavailable': True}
            assert await conn.fetchval('SELECT result FROM coding_validation_jobs') is None
    asyncio.run(reject_changed_qualification())
    client.post(path, json={'expected_owner_id': user.id, 'request_id': str(uuid4())})
    database.settings.CODING_PILOT_PROFILE_IDS = ''
    asyncio.run(reject_changed_qualification())
    assert all(j['state'] == 'UNAVAILABLE' for j in client.get('/coding/validations').json()['items'])


def test_artifact_mission_preserves_source_and_checks_parent_owner(database, http):
    client, user = http
    owner = user.id
    original = client.post('/coding/artifacts', json={'expected_owner_id': owner, 'request_id': str(uuid4()), 'challenge_id': 'repair-task', 'code': 'return 0', 'passed': 0, 'total': 1, 'assistance': 'KNOWN_ASSISTED'}).json()
    async def project_original():
        async with database.connect() as conn, conn.transaction():
            event = await conn.fetchval('SELECT id FROM unified_evidence_events WHERE source_id=$1', UUID(original['id']))
            await process_event(conn, event)
            await snapshot(conn, database.users[0])
    asyncio.run(project_original())
    mission = client.get('/journey/current').json()['next_mission']
    assert 'artifact_id=' + original['id'] in mission['href']
    assert client.post('/journey/missions/' + mission['id'] + '/launch', json={'expected_owner_id': owner}).status_code == 200
    payload = {'expected_owner_id': owner, 'request_id': str(uuid4()), 'mission_id': mission['id'], 'challenge_id': 'repair-task', 'code': 'return 1'}
    assert client.post('/coding/artifacts', json=payload).status_code == 409
    payload['parent_artifact_id'] = original['id']
    assert client.post('/coding/artifacts', json={**payload, 'language': 'python'}).status_code == 409
    saved = client.post('/coding/artifacts', json=payload)
    assert saved.status_code == 200
    assert saved.json()['content']['assistance'] == 'KNOWN_ASSISTED'
    assert saved.json()['content']['passed'] is None  # Old test results do not certify edited code.
    assert client.get('/coding/artifacts/' + original['id']).json()['content']['code'] == 'return 0'
    user.id = str(database.users[1])
    assert client.post('/coding/artifacts', json={**payload, 'expected_owner_id': user.id, 'mission_id': None}).status_code == 404


def test_owner_isolation_revision_and_lost_ack(database, http):
    client, user = http
    state = WorkspaceState(drafts={'task:javascript': 'secret first draft'}).model_dump(mode='json')
    request = {'expected_owner_id': user.id, 'revision': 0, 'state': state}
    assert client.put('/coding/workspace', json=request).json()['revision'] == 1
    assert client.put('/coding/workspace', json=request).json()['revision'] == 1  # Lost acknowledgement.
    request['state']['drafts']['task:javascript'] = 'conflicting device'
    conflict = client.put('/coding/workspace', json=request)
    assert conflict.status_code == 409
    assert conflict.json()['detail']['current']['state']['drafts']['task:javascript'] == 'secret first draft'
    user.id = str(database.users[1])
    assert client.get('/coding/workspace').json()['state']['drafts'] == {}
    assert client.put('/coding/workspace', json=request).status_code == 409


def test_guest_preview_commit_and_duplicate_preserve_original(database, http):
    client, user = http
    guest = WorkspaceState(drafts={'guest:javascript': 'return 42'}).model_dump(mode='json')
    preview = client.post('/coding/imports/preview', json={'expected_owner_id': user.id, 'state': guest})
    assert preview.status_code == 200
    assert client.get('/coding/workspace').json()['state']['drafts'] == {}
    path = '/coding/imports/' + preview.json()['id'] + '/commit'
    assert client.post(path, json={'expected_owner_id': user.id, 'ownership_confirmed': False}).status_code == 422
    payload = {'expected_owner_id': user.id, 'ownership_confirmed': True}
    assert client.post(path, json=payload).json()['revision'] == 1
    assert client.post(path, json=payload).json()['already_committed']
    user.id = str(database.users[1])
    assert client.post(path, json={**payload, 'expected_owner_id': user.id}).status_code == 404


def test_artifact_idempotency_and_trust_boundary(database, http):
    client, user = http
    payload = {'expected_owner_id': user.id, 'request_id': str(uuid4()), 'challenge_id': 'task', 'code': 'return 42', 'passed': 1, 'total': 1}
    first = client.post('/coding/artifacts', json=payload)
    assert first.status_code == 200
    assert first.json()['authority'] == 'CLIENT_REPORTED'
    assert client.post('/coding/artifacts', json=payload).json()['id'] == first.json()['id']
    assert client.post('/coding/artifacts', json={**payload, 'authority': 'SERVER_VERIFIED'}).status_code == 422
    assert client.post('/coding/artifacts', json={**payload, 'code': 'changed'}).status_code == 409
    user.id = str(database.users[1])
    assert client.get('/coding/artifacts/' + first.json()['id']).status_code == 404
    assert client.get('/coding/artifacts').json() == []


def test_concurrent_draft_writes_only_one_wins(database):
    async def run():
        async def write(code):
            async with database.connect() as conn:
                async with conn.transaction():
                    try:
                        return await coding_store.write_workspace(conn, database.users[0], 0, WorkspaceState(drafts={'a': code}))
                    except HTTPException as exc:
                        return exc.status_code
        results = await asyncio.gather(write('first'), write('second'))
        assert sum(isinstance(r, dict) for r in results) == 1
        assert 409 in results
    asyncio.run(run())


def test_outbox_atomicity_replay_and_account_deletion(database):
    async def run():
        async with database.connect() as conn:
            user = database.users[0]
            sid = uuid4()
            await coding_store.workspace(conn, user)
            await conn.execute("INSERT INTO interview_sessions VALUES($1,$2,'ACTIVE','{}',NULL)", sid, user)
            with pytest.raises(RuntimeError):
                async with conn.transaction():
                    await conn.execute("UPDATE interview_sessions SET state='FINISHED',finished_at=NOW() WHERE id=$1", sid)
                    raise RuntimeError('Simulated transaction crash')
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 0
            await conn.execute("UPDATE interview_sessions SET state='FINISHED',finished_at=NOW() WHERE id=$1", sid)
            await conn.execute("UPDATE interview_sessions SET state='FINISHED' WHERE id=$1", sid)
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 1
            async with conn.transaction():
                await process_event(conn, await conn.fetchval('SELECT id FROM unified_evidence_events'))
            first = await snapshot(conn, user)
            replay = await snapshot(conn, user)
            assert first == replay
            await conn.execute('DELETE FROM profiles WHERE id=$1', user)
            for table in ('coding_workspaces', 'coding_artifacts', 'unified_evidence_events', 'unified_readiness_snapshots'):
                assert await conn.fetchval(f'SELECT count(*) FROM {table}') == 0
    asyncio.run(run())


def test_projection_deduplicates_replay_and_erasure_cannot_resurrect(database):
    async def run():
        async with database.connect() as conn:
            user = database.users[0]
            request = ArtifactWrite(expected_owner_id=user, request_id=uuid4(), challenge_id='task', code='private code', explanation='private explanation', passed=1, total=1)
            first = await coding_store.artifact(conn, user, request)
            await coding_store.artifact(conn, user, request.model_copy(update={'request_id': uuid4()}))
            ids = await conn.fetch('SELECT id FROM unified_evidence_events ORDER BY id')
            for row in ids:
                async with conn.transaction(): await process_event(conn, row['id'])
            async with conn.transaction(): assert await process_event(conn, ids[0]['id']) is None
            result = await snapshot(conn, user)
            correctness = next(row for row in result['rows'] if row['key'] == 'correctness')
            assert correctness['coverage'] == 1
            assert correctness['state'] == 'INSUFFICIENT_EVIDENCE'
            assert 'private code' not in json.dumps(result)
            assert 'private explanation' not in json.dumps(result)
            await conn.execute('DELETE FROM coding_artifacts WHERE id=$1', UUID(first['id']))
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots') == 0
            assert await conn.fetchval('SELECT count(*) FROM unified_deletion_tombstones') == 1
            assert await conn.fetchval('SELECT count(*) FROM unified_observations') == 1
            assert await backfill(conn) == []
            async with conn.transaction(): assert await process_event(conn, ids[0]['id']) is None
    asyncio.run(run())


def test_preflight_reads_real_schema_without_repairing_ledger_or_processing_events(database, http):
    from scripts.unified_release_preflight import inventory, inspect_database
    client, user = http
    client.post('/coding/artifacts', json={'expected_owner_id': user.id, 'request_id': str(uuid4()), 'challenge_id': 'preflight', 'code': 'private-student-code'})
    local = inventory()
    async def run():
        async with database.connect() as conn:
            await conn.execute('CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT)')
            await conn.executemany('INSERT INTO schema_migrations VALUES($1,$2)', list(local.items()))
            result = await inspect_database(conn, local, database.schema)
            assert result['issues'] == [], result
            assert result['queue']['pending'] == 1
            assert 'private-student-code' not in json.dumps(result)
            await conn.execute("UPDATE schema_migrations SET checksum=NULL WHERE version='038_unified_coding'")
            await conn.execute('ALTER TABLE coding_artifacts DISABLE TRIGGER unified_coding_erasure')
            await conn.execute('ALTER TABLE coding_workspaces DISABLE ROW LEVEL SECURITY')
            await conn.execute('CREATE POLICY broad_browser_access ON coding_artifacts FOR SELECT USING(true)')
            await conn.execute('ALTER TABLE unified_evidence_events ALTER COLUMN source_version TYPE INTEGER')
            await conn.execute('UPDATE unified_evidence_events SET attempts=5')
            result = await inspect_database(conn, local, database.schema)
            assert {'CHECKSUM_UNVERIFIED', 'TRIGGER_MISSING_OR_DISABLED', 'RLS_DISABLED', 'QUARANTINED_EVIDENCE', 'DATABASE_POLICY_REVIEW_REQUIRED', 'COLUMN_TYPE_MISMATCH'} <= {item['code'] for item in result['issues']}
            assert await conn.fetchval("SELECT checksum FROM schema_migrations WHERE version='038_unified_coding'") is None
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events WHERE processed_at IS NULL AND attempts=5') == 1
            # PostgreSQL itself rejects a write even if a future inspection helper
            # accidentally introduces one. Exercise it through the checker.
            class AccidentalWriter:
                def __getattr__(self, key): return getattr(conn, key)
                async def fetch(self, *args, **kwargs):
                    await conn.execute("UPDATE schema_migrations SET checksum='forbidden'")
                    return await conn.fetch(*args, **kwargs)
            with pytest.raises(asyncpg.ReadOnlySQLTransactionError):
                await inspect_database(AccidentalWriter(), local, database.schema)
    asyncio.run(run())


def test_rls_denies_browser_role(database, http):
    client, _ = http
    assert client.post('/journey/assignments', json=assignment_request(database, http)).status_code == 201
    async def run():
        async with database.connect() as conn:
            role = 'browser_' + uuid4().hex
            await coding_store.workspace(conn, database.users[0])
            await conn.execute(f'CREATE ROLE {role} NOLOGIN')
            await conn.execute(f'GRANT USAGE ON SCHEMA {database.schema} TO {role}')
            await conn.execute(f'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA {database.schema} TO {role}')
            protected = ('intervention', 'intervention_assignment', 'audit_log', 'unified_assignment_batches', 'unified_assignment_links')
            for table in protected:
                assert await conn.fetchval('SELECT count(*) FROM ' + table) > 0
            try:
                await conn.execute(f'SET ROLE {role}')
                assert await conn.fetchval('SELECT count(*) FROM coding_workspaces') == 0
                for table in protected:
                    assert await conn.fetchval('SELECT count(*) FROM ' + table) == 0
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await conn.execute('INSERT INTO coding_workspaces(user_id) VALUES($1)', database.users[1])
            finally:
                await conn.execute('RESET ROLE')
    asyncio.run(run())


def test_mentor_concurrency_budget_and_idempotency(database, monkeypatch):
    calls = []
    async def generate(request):
        calls.append(request)
        await asyncio.sleep(.1)
        return SimpleNamespace(content=json.dumps({'message': 'Try a boundary case.', 'nextStep': 'Test an empty input.'}), finish_reason='stop')
    monkeypatch.setattr(coding_mentor, 'get_registry', lambda: SimpleNamespace(get=lambda _: SimpleNamespace(generate=generate)))
    async def run():
        user = database.users[0]
        def request(): return MentorRequest(expected_owner_id=user, request_id=uuid4(), mode='hint', question='Help me reason')
        first = request()
        results = await asyncio.gather(coding_mentor.mentor(user, first), coding_mentor.mentor(user, request()), return_exceptions=True)
        assert sum(isinstance(r, dict) for r in results) == 1
        assert any(isinstance(r, HTTPException) and r.status_code == 429 for r in results)
        async with database.connect() as conn:
            completed = await conn.fetchrow("SELECT request_id FROM coding_ai_requests WHERE state='COMPLETED'")
        # Replay the request that won the concurrency race.
        replay = first.model_copy(update={'request_id': completed['request_id']})
        assert (await coding_mentor.mentor(user, replay))['message'] == 'Try a boundary case.'
        assert len(calls) == 1
        await coding_mentor.mentor(user, request())
        with pytest.raises(HTTPException) as exc:
            await coding_mentor.mentor(user, request())
        assert exc.value.status_code == 429
        assert len(calls) == 2
    asyncio.run(run())


def test_mission_launch_is_not_completion_but_saved_artifact_is(database, http):
    client, user = http
    current = client.get('/journey/current')
    assert current.status_code == 200
    assert current.json()['data_health'] == 'PENDING'
    mission = current.json()['next_mission']
    assert mission['completion'] == 'ARTIFACT_SAVED'
    payload = {'expected_owner_id': user.id}
    launched = client.post('/journey/missions/' + mission['id'] + '/launch', json=payload)
    assert launched.json()['status'] == 'LAUNCHED'
    assert 'mission_id=' in launched.json()['href']
    saved = client.post('/coding/artifacts', json={**payload, 'request_id': str(uuid4()), 'mission_id': mission['id'], 'challenge_id': 'first-task', 'code': 'return 1'})
    assert saved.status_code == 200
    async def status():
        async with database.connect() as conn:
            return await conn.fetchval('SELECT status FROM practice_missions WHERE id=$1', UUID(mission['id']))
    assert asyncio.run(status()) == 'COMPLETED'
    user.id = str(database.users[1])
    assert client.post('/journey/missions/' + mission['id'] + '/launch', json={'expected_owner_id': user.id}).status_code == 404


def test_sharing_membership_small_cohorts_and_revocation_during_rollback(database, http):
    client, user = http
    payload = {'expected_owner_id': user.id, 'organization_id': str(database.orgs[0]), 'enabled': True}
    assert client.put('/journey/sharing', json={**payload, 'organization_id': str(database.orgs[1])}).status_code == 403
    assert client.put('/journey/sharing', json=payload).status_code == 200
    assert client.get('/journey/sharing').json()[0]['enabled'] is True
    database.settings.UNIFIED_TPO_VISIBLE = True
    result = client.get('/journey/cohort')
    assert result.json()['suppressed'] is True
    assert result.headers['cache-control'] == 'private, no-store'
    database.settings.CODING_WORKSPACE_ENABLED = False
    database.settings.UNIFIED_READINESS_VISIBLE = False
    assert client.put('/journey/sharing', json={**payload, 'enabled': False}).status_code == 200
    assert client.get('/journey/sharing').json()[0]['enabled'] is False


def test_cohort_suppresses_small_cells_and_enforces_staff_scope(database, http):
    client, _ = http
    from app.services.unified_readiness import POLICY_VERSION
    participants = [uuid4() for _ in range(6)]
    async def seed():
        async with database.connect() as conn, conn.transaction():
            for index, person in enumerate(participants):
                await conn.execute('INSERT INTO profiles(id) VALUES($1)', person)
                await conn.execute("INSERT INTO organization_students VALUES($1,$2,'active')", person, database.orgs[0])
                await coding_store.workspace(conn, person)
                await conn.execute('INSERT INTO unified_sharing(user_id,organization_id,enabled) VALUES($1,$2,TRUE)', person, database.orgs[0])
                value = {'rows': [{'key': 'correctness', 'state': 'DEVELOPING' if index == 0 else 'NOT_MEASURED'}, {'key': 'reasoning', 'state': 'NOT_MEASURED'}]}
                await conn.execute('''INSERT INTO unified_readiness_snapshots(user_id,role,policy_version,input_digest,watermark,snapshot)
                    VALUES($1,'GENERAL_SWE',$2,'test-input',0,$3::jsonb)''', person, POLICY_VERSION, json.dumps(value))
    asyncio.run(seed())
    database.settings.UNIFIED_TPO_VISIBLE = True
    response = client.get('/journey/cohort').json()
    assert response['participants'] == 6
    assert response['areas']['correctness'] is None  # Suppress the whole 5+1 row.
    assert response['areas']['reasoning'] == {'NOT_MEASURED': 6}
    assert all(str(person) not in json.dumps(response) for person in participants)
    client.app.dependency_overrides[get_org_admin] = lambda: SimpleNamespace(is_active=True, admin_role='department_admin', organization_id=str(database.orgs[0]))
    assert client.get('/journey/cohort').status_code == 403
    client.app.dependency_overrides[get_org_admin] = lambda: SimpleNamespace(is_active=False, admin_role='org_admin', organization_id=str(database.orgs[0]))
    assert client.get('/journey/cohort').status_code == 403
    client.app.dependency_overrides[get_org_admin] = lambda: SimpleNamespace(is_active=True, admin_role='org_admin', organization_id=str(database.orgs[1]))
    assert client.get('/journey/cohort').json()['suppressed'] is True


def test_recovery_survives_feature_rollback(database, http):
    client, user = http
    state = WorkspaceState(drafts={'a': 'acknowledged work'}).model_dump(mode='json')
    assert client.put('/coding/workspace', json={'expected_owner_id': user.id, 'revision': 0, 'state': state}).status_code == 200
    async def saved_snapshot():
        async with database.connect() as conn, conn.transaction():
            return await snapshot(conn, database.users[0])
    saved = asyncio.run(saved_snapshot())
    database.settings.CODING_WORKSPACE_ENABLED = False
    database.settings.CODING_SERVER_SYNC_ENABLED = False
    assert client.get('/coding/workspace').status_code == 403
    recovery = client.get('/coding/recovery')
    assert recovery.status_code == 200
    assert recovery.json()['state']['drafts']['a'] == 'acknowledged work'
    assert client.get('/journey/snapshots/' + saved['id']).status_code == 200
    user.id = str(database.users[1])
    assert client.get('/coding/recovery').json()['state'] is None
    assert client.get('/journey/snapshots/' + saved['id']).status_code == 404


def test_report_export_uses_owned_immutable_snapshot_and_survives_rollback(database, http):
    client, user = http
    async def save():
        async with database.connect() as conn, conn.transaction():
            return await snapshot(conn, database.users[0])
    saved = asyncio.run(save())
    path = '/journey/snapshots/' + saved['id']
    before = client.get(path + '/export').json()
    assert json.loads(before['content'])['summary']['policy_version'] == saved['policy_version']
    assert 'calculation_inputs' not in client.get(path).json()
    database.settings.CODING_WORKSPACE_ENABLED = False
    database.settings.UNIFIED_READINESS_VISIBLE = False
    response = client.get(path + '/export')
    assert response.status_code == 200 and response.json() == before
    assert 'no-store' in response.headers['cache-control']
    assert client.get(path + '/export?format=html').json()['media_type'] == 'text/html'
    assert client.get(path + '/export?format=pdf').status_code == 422
    user.id = str(database.users[1])
    assert client.get(path + '/export').status_code == 404
    user.id = str(database.users[0])
    async def erase():
        async with database.connect() as conn:
            await conn.execute('DELETE FROM profiles WHERE id=$1', database.users[0])
    asyncio.run(erase())
    assert client.get(path + '/export').status_code == 404


def test_snapshot_history_paginates_ties_and_retains_original_roles_without_cross_account_data(database, http):
    from datetime import datetime, timezone
    from app.services.unified_readiness import project
    client, user = http
    when = datetime(2026, 9, 12, tzinfo=timezone.utc)
    ids = [uuid4() for _ in range(53)]
    async def seed():
        async with database.connect() as conn:
            for index, sid in enumerate(ids):
                saved = project('backend-engineer' if index % 2 else 'GENERAL_SWE', [], [], [], as_of=when)
                await conn.execute('''INSERT INTO unified_readiness_snapshots(id,user_id,role,policy_version,input_digest,watermark,snapshot,created_at)
                    VALUES($1,$2,$3,$4,$5,0,$6::jsonb,$7)''', sid, database.users[0], saved['role'], saved['policy_version'], str(index), json.dumps(saved), when)
    asyncio.run(seed())
    database.settings.CODING_WORKSPACE_ENABLED = False
    first = client.get('/journey/snapshots').json()
    assert len(first['items']) == 50
    assert {item['role'] for item in first['items']} == {'GENERAL_SWE', 'backend-engineer'}
    assert not any('snapshot' in item or 'user_id' in item for item in first['items'])
    second = client.get('/journey/snapshots?before=' + first['next_cursor']).json()
    assert len(second['items']) == 3 and second['next_cursor'] is None
    assert [item['id'] for item in first['items'] + second['items']] == [str(sid) for sid in sorted(ids, reverse=True)]
    user.id = str(database.users[1])
    assert client.get('/journey/snapshots').json()['items'] == []
    assert client.get('/journey/snapshots?before=' + first['next_cursor']).status_code == 404


def test_synced_attempts_are_archived_beyond_the_rolling_window(database, http):
    client, user = http
    attempt = {'id': 'browser-attempt', 'challengeId': 'task', 'at': '2020-01-01T00:00:00Z', 'passed': 0, 'total': 1, 'assisted': False, 'languageIssue': True, 'code': ''}
    state = WorkspaceState(attempts=[attempt]).model_dump(mode='json')
    payload = {'expected_owner_id': user.id, 'revision': 0, 'state': state}
    assert client.put('/coding/workspace', json=payload).status_code == 200
    artifacts = client.get('/coding/artifacts').json()
    assert len(artifacts) == 1
    content = client.get('/coding/artifacts/' + artifacts[0]['id']).json()['content']
    assert content['code'] == ''  # Empty failed submissions are not fabricated into code.
    assert content['source_kind'] == 'PRACTICE_ATTEMPT'
    assert content['observed_time_authority'] == 'CLIENT_CLAIMED'
    assert content['assistance'] == 'UNKNOWN'
    payload['revision'] = 1; payload['state']['attempts'] = []
    assert client.put('/coding/workspace', json=payload).status_code == 200
    assert len(client.get('/coding/artifacts').json()) == 1
    payload['revision'] = 2; payload['state']['attempts'] = [attempt]
    assert client.put('/coding/workspace', json=payload).status_code == 200
    assert len(client.get('/coding/artifacts').json()) == 1


def test_saved_retry_completes_mission_and_remains_one_interview_observation(database, http):
    client, user = http
    sid = uuid4()
    artifact = client.post('/coding/artifacts', json={'expected_owner_id': user.id, 'request_id': str(uuid4()), 'challenge_id': 'task', 'code': 'return 1', 'explanation': 'My implementation', 'passed': 1, 'total': 1}).json()
    runtime = {'orchestrator_v2': {'questions': [{'id': 'q-1', 'family': 'project'}], 'evidence': [{'question_id': 'q-1', 'gaps': ['ownership'], 'signals': []}], 'artifact_context': {'id': artifact['id']}},
        'evidence_report_v2': {'evidence': [True], 'top_risks': [{'gap': 'ownership', 'question_id': 'q-1'}]}}
    async def seed():
        async with database.connect() as conn:
            await conn.execute("INSERT INTO interview_sessions VALUES($1,$2,'ACTIVE',$3::jsonb,NULL)", sid, database.users[0], json.dumps(runtime))
            await conn.execute("UPDATE interview_sessions SET state='FINISHED',finished_at=NOW() WHERE id=$1", sid)
            for row in await conn.fetch('SELECT id FROM unified_evidence_events ORDER BY id'):
                async with conn.transaction(): await process_event(conn, row['id'])
            return await snapshot(conn, database.users[0])
    initial = asyncio.run(seed())
    assert next(r for r in initial['rows'] if r['key'] == 'ownership')['state'] == 'DEVELOPING'
    mission = client.get('/journey/current').json()['next_mission']
    assert mission['completion'] == 'ANSWER_RETRIED'
    assert client.post('/journey/missions/' + mission['id'] + '/launch', json={'expected_owner_id': user.id}).status_code == 200
    payload = {'expected_owner_id': user.id, 'mission_id': mission['id'], 'question_id': 'q-1', 'client_request_id': 'retry-once', 'answer': 'I implemented the cache because repeated reads were slow. I tested invalidation and measured latency before and after.'}
    retry = client.post(f'/interviews/{sid}/retry-answer', json=payload)
    assert retry.status_code == 200
    assert 'ownership' in retry.json()['repaired_gaps']
    assert client.post(f'/interviews/{sid}/retry-answer', json=payload).json() == retry.json()
    async def verify():
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM interview_answer_retries') == 1
            assert await conn.fetchval('SELECT status FROM practice_missions WHERE id=$1', UUID(mission['id'])) == 'COMPLETED'
            for row in await conn.fetch('SELECT id FROM unified_evidence_events ORDER BY id DESC'):
                async with conn.transaction(): await process_event(conn, row['id'])
            result = await snapshot(conn, database.users[0])
            rows = {r['key']: r for r in result['rows']}
            assert rows['ownership']['state'] == 'INSUFFICIENT_EVIDENCE'
            assert rows['communication']['coverage'] == 1
            assert result['overall_state'] == 'MORE_EVIDENCE_NEEDED'
            await conn.execute('DELETE FROM interview_answer_retries WHERE session_id=$1', sid)
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots') == 0
            assert await conn.fetchval("SELECT count(*) FROM unified_evidence_events WHERE source_module='interview'") == 0
    asyncio.run(verify())


def test_projection_guard_does_not_block_ordinary_profile_updates(database):
    async def run():
        async with database.connect() as projection, database.connect() as writer:
            await writer.execute('ALTER TABLE profiles ADD COLUMN quota_test_counter INTEGER DEFAULT 0')
            async with projection.transaction():
                assert await lock_projection_owner(projection, database.users[0])
                await writer.execute("SET lock_timeout='250ms'")
                await writer.execute('UPDATE profiles SET quota_test_counter=quota_test_counter+1 WHERE id=$1', database.users[0])
                assert await writer.fetchval('SELECT quota_test_counter FROM profiles WHERE id=$1', database.users[0]) == 1
    asyncio.run(run())


def test_worker_quarantines_corrupt_sources_without_losing_events(database, monkeypatch):
    from app.services import unified_evidence_worker as worker
    database.settings.UNIFIED_EVIDENCE_ENABLED = True
    monkeypatch.setattr(worker, 'DatabaseConnection', database.connect)
    monkeypatch.setattr(worker, 'get_settings', lambda: database.settings)
    async def run():
        async with database.connect() as conn:
            request = ArtifactWrite(expected_owner_id=database.users[0], request_id=uuid4(), challenge_id='task', code='return 1')
            saved = await coding_store.artifact(conn, database.users[0], request)
            # Simulate source corruption outside the validated API contract.
            await conn.execute("UPDATE coding_artifacts SET content='{}'::jsonb WHERE id=$1", UUID(saved['id']))
        for _ in range(5):
            result = await worker.tick()
            assert result['failed'] == 1
            async with database.connect() as conn:
                await conn.execute('UPDATE unified_evidence_events SET retry_after=NOW()')
        result = await worker.tick()
        assert result['quarantined'] == 1 and result['processed'] == 0
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 1
            assert await conn.fetchval('SELECT count(*) FROM unified_observations') == 0
    asyncio.run(run())


async def seed_migration_ledger(conn, inventory):
    # Synthetic pre-integration ledger for tool behavior. This is not evidence
    # that the production-shaped 001-037 sequence was rehearsed in these tests.
    await conn.execute('CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,checksum TEXT,applied_at TIMESTAMPTZ DEFAULT NOW())')
    await conn.executemany('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',
        [(version, checksum) for version, checksum in inventory.items() if int(version.split('_')[0]) <= 37])


@pytest.mark.parametrize('database', ['pre_integration'], indirect=True)
def test_explicit_migration_plan_is_read_only_and_applies_actual_integration_batch(database):
    from scripts import apply_unified_schema as schema
    async def run():
        async with database.connect() as conn:
            local, sql = schema.local_plan_inputs()
            await seed_migration_ledger(conn, local)
            plan = await schema.plan_database(conn, local, 'local-fixture', schema.VERSIONS[-1])
            assert plan['plan_ready'] and plan['pending_versions'] == list(schema.VERSIONS)
            assert await conn.fetchval("SELECT to_regclass('coding_workspaces')") is None
            assert await conn.fetchval('SELECT count(*) FROM schema_migrations') == 37
            substituted = {**sql, schema.VERSIONS[0]: sql[schema.VERSIONS[0]] + '\nSELECT 1;'}
            with pytest.raises(schema.MigrationPlanError, match='MIGRATION_CONTENT_CHANGED'):
                await schema.apply_database(conn, local, substituted, 'local-fixture', schema.VERSIONS[-1], plan['plan_sha256'])
            result = await schema.apply_database(conn, local, sql, 'local-fixture', schema.VERSIONS[-1], plan['plan_sha256'])
            assert result['applied_versions'] == list(schema.VERSIONS) and not result['release_authorized']
            assert await conn.fetchval("SELECT to_regclass('coding_validation_jobs')") is not None
            assert await conn.fetchval('SELECT count(*) FROM schema_migrations') == 42
            refreshed = await schema.plan_database(conn, local, 'local-fixture', schema.VERSIONS[-1])
            assert refreshed['plan_ready'] and refreshed['pending_versions'] == []
            # A lost acknowledgement is resolved by rereading the ledger, not by
            # blindly accepting the previously reviewed token or applying twice.
            with pytest.raises(schema.MigrationPlanError, match='MIGRATION_PLAN_CHANGED'):
                await schema.apply_database(conn, local, sql, 'local-fixture', schema.VERSIONS[-1], plan['plan_sha256'])
            assert (await schema.apply_database(conn, local, sql, 'local-fixture', schema.VERSIONS[-1], refreshed['plan_sha256']))['applied_versions'] == []
    asyncio.run(run())


@pytest.mark.parametrize('database', ['pre_integration'], indirect=True)
def test_migration_apply_rejects_stale_target_and_unverified_ledger(database):
    from scripts import apply_unified_schema as schema
    async def run():
        async with database.connect() as conn:
            local, sql = schema.local_plan_inputs()
            await seed_migration_ledger(conn, local)
            plan = await schema.plan_database(conn, local, 'local-fixture', schema.VERSIONS[-1])
            with pytest.raises(schema.MigrationPlanError, match='MIGRATION_PLAN_CHANGED'):
                await schema.apply_database(conn, local, sql, 'other-target', schema.VERSIONS[-1], plan['plan_sha256'])
            await conn.execute("UPDATE schema_migrations SET checksum=NULL WHERE version='037_interview_coaching_v2'")
            blocked = await schema.plan_database(conn, local, 'local-fixture', schema.VERSIONS[-1])
            assert not blocked['plan_ready'] and any(i['code'] == 'CHECKSUM_UNVERIFIED' for i in blocked['issues'])
            with pytest.raises(schema.MigrationPlanError, match='MIGRATION_LEDGER_REVIEW_REQUIRED'):
                await schema.apply_database(conn, local, sql, 'local-fixture', schema.VERSIONS[-1], blocked['plan_sha256'])
            assert await conn.fetchval("SELECT checksum FROM schema_migrations WHERE version='037_interview_coaching_v2'") is None
            assert await conn.fetchval("SELECT to_regclass('coding_workspaces')") is None
            await conn.execute("UPDATE schema_migrations SET checksum=$1 WHERE version='037_interview_coaching_v2'", local['037_interview_coaching_v2'])
            await conn.execute('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', schema.VERSIONS[1], local[schema.VERSIONS[1]])
            blocked = await schema.plan_database(conn, local, 'local-fixture', schema.VERSIONS[-1])
            assert any(i['code'] == 'NONCONTIGUOUS_INTEGRATION_LEDGER' for i in blocked['issues'])
    asyncio.run(run())


@pytest.mark.parametrize('database', ['pre_integration'], indirect=True)
def test_migration_batch_rolls_back_prior_ddl_and_ledger_on_late_failure(database):
    from scripts import apply_unified_schema as schema
    async def run():
        async with database.connect() as conn:
            local, sql = schema.local_plan_inputs()
            await seed_migration_ledger(conn, local)
            # A pre-existing conflicting object makes the real last migration
            # fail, after actual 038/039/040 statements have executed.
            await conn.execute('CREATE TABLE unified_evidence_recovery_audit(fixture INTEGER)')
            plan = await schema.plan_database(conn, local, 'local-fixture', schema.VERSIONS[-1])
            with pytest.raises(asyncpg.DuplicateTableError):
                await schema.apply_database(conn, local, sql, 'local-fixture', schema.VERSIONS[-1], plan['plan_sha256'])
            assert await conn.fetchval("SELECT to_regclass('coding_workspaces')") is None
            assert await conn.fetchval("SELECT to_regclass('coding_validation_jobs')") is None
            assert await conn.fetchval('SELECT count(*) FROM schema_migrations') == 37
            assert not await conn.fetchval("SELECT relrowsecurity FROM pg_class WHERE oid='intervention'::regclass")
    asyncio.run(run())


@pytest.mark.parametrize('database', ['pre_integration'], indirect=True)
def test_startup_and_explicit_migration_operations_share_exclusive_lock(database):
    from app.database.migration_control import migration_lock
    from app.database.connection import _run_migrations
    from scripts import apply_unified_schema as schema
    async def run():
        async with database.connect() as first, database.connect() as second:
            local, sql = schema.local_plan_inputs()
            await seed_migration_ledger(first, local)
            plan = await schema.plan_database(first, local, 'local-fixture', schema.VERSIONS[-1])
            async with migration_lock(first):
                with pytest.raises(RuntimeError, match='Another database migration'):
                    await _run_migrations(second)
                with pytest.raises(RuntimeError, match='Another database migration'):
                    await schema.apply_database(second, local, sql, 'local-fixture', schema.VERSIONS[-1], plan['plan_sha256'])
            assert (await schema.apply_database(second, local, sql, 'local-fixture', schema.VERSIONS[-1], plan['plan_sha256']))['applied_versions'] == list(schema.VERSIONS)
    asyncio.run(run())


async def verification_snapshot(conn, owner):
    async with conn.transaction():
        request = ArtifactWrite(expected_owner_id=owner, request_id=uuid4(), challenge_id='task', code='private verifier code', passed=0, total=1)
        saved = await coding_store.artifact(conn, owner, request)
        event = await conn.fetchval('SELECT id FROM unified_evidence_events WHERE source_id=$1', UUID(saved['id']))
        await process_event(conn, event)
        result = await snapshot(conn, owner)
        return UUID(result['id']), UUID(saved['id']), event


def test_snapshot_verifier_replays_actual_persisted_inputs_without_mutation(database):
    from scripts import verify_readiness_snapshots as verifier
    async def run():
        async with database.connect() as conn:
            identifier, artifact, event = await verification_snapshot(conn, database.users[0])
            before = await conn.fetchval('SELECT snapshot::text FROM unified_readiness_snapshots WHERE id=$1', identifier)
            reports = await verifier.inspect_database(conn, [identifier])
            assert reports[0]['reproducible'] and reports[0]['ledger_checked'] and reports[0]['ledger_matches']
            assert reports[0]['issues'] == [] and not reports[0]['assessment_qualified']
            encoded = json.dumps(reports)
            assert 'private verifier code' not in encoded and str(artifact) not in encoded and str(database.users[0]) not in encoded
            assert await conn.fetchval('SELECT snapshot::text FROM unified_readiness_snapshots WHERE id=$1', identifier) == before
            assert await conn.fetchval('SELECT count(*) FROM unified_observations WHERE event_id=$1', event) == 1
    asyncio.run(run())


def test_snapshot_verifier_detects_ledger_changes_and_cross_owner_input(database):
    from scripts import verify_readiness_snapshots as verifier
    async def run():
        async with database.connect() as conn:
            identifier, _, event = await verification_snapshot(conn, database.users[0])
            await conn.execute("UPDATE unified_observations SET observation=jsonb_set(observation,'{content,passed}','1') WHERE event_id=$1", event)
            result = (await verifier.inspect_database(conn, [identifier]))[0]
            assert result['reproducible'] and 'LEDGER_OBSERVATION_MISMATCH' in result['issues']
            await conn.execute('UPDATE unified_evidence_events SET processed_at=NULL WHERE id=$1', event)
            assert 'LEDGER_SOURCE_STATE_MISMATCH' in (await verifier.inspect_database(conn, [identifier]))[0]['issues']
            await conn.execute('UPDATE unified_observations SET user_id=$2 WHERE event_id=$1', event, database.users[1])
            result = (await verifier.inspect_database(conn, [identifier]))[0]
            assert 'LEDGER_INPUT_MISSING_OR_FOREIGN' in result['issues']
            assert not result['ledger_matches']
    asyncio.run(run())


def test_snapshot_verifier_respects_tombstones_and_actual_source_erasure(database):
    from scripts import verify_readiness_snapshots as verifier
    async def run():
        async with database.connect() as conn:
            identifier, artifact, _ = await verification_snapshot(conn, database.users[0])
            await conn.execute("INSERT INTO unified_deletion_tombstones(user_id,source_module,source_id) VALUES($1,'coding',$2)", database.users[0], artifact)
            assert 'DELETION_BOUNDARY_VIOLATION' in (await verifier.inspect_database(conn, [identifier]))[0]['issues']
            await conn.execute('DELETE FROM coding_artifacts WHERE id=$1', artifact)
            result = (await verifier.inspect_database(conn, [identifier]))[0]
            assert result['issues'] == ['SNAPSHOT_NOT_FOUND'] and result['reproducible'] is None
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots') == 0
    asyncio.run(run())


def test_snapshot_verifier_database_transaction_rejects_accidental_writes(database, monkeypatch):
    from scripts import verify_readiness_snapshots as verifier
    async def accidental_write(conn, record, report):
        await conn.execute('DELETE FROM unified_readiness_snapshots WHERE id=$1', record['id'])
    monkeypatch.setattr(verifier, 'verify_ledger', accidental_write)
    async def run():
        async with database.connect() as conn:
            identifier, _, _ = await verification_snapshot(conn, database.users[0])
            with pytest.raises(asyncpg.ReadOnlySQLTransactionError): await verifier.inspect_database(conn, [identifier])
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots WHERE id=$1', identifier) == 1
    asyncio.run(run())


def test_snapshot_verifier_rejects_rls_filtered_operator(database):
    from scripts import verify_readiness_snapshots as verifier
    async def run():
        async with database.connect() as conn:
            identifier, _, _ = await verification_snapshot(conn, database.users[0])
            role = 'verification_reader_' + uuid4().hex
            await conn.execute(f'CREATE ROLE {role}')
            await conn.execute(f'GRANT USAGE ON SCHEMA {database.schema} TO {role}')
            await conn.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA {database.schema} TO {role}')
            await conn.execute(f'SET ROLE {role}')
            with pytest.raises(asyncpg.InsufficientPrivilegeError): await verifier.inspect_database(conn, [identifier])
    asyncio.run(run())


def test_snapshot_verifier_does_not_confuse_historical_inputs_with_newer_work(database):
    from scripts import verify_readiness_snapshots as verifier
    async def run():
        async with database.connect() as conn:
            old, _, _ = await verification_snapshot(conn, database.users[0])
            new, _, _ = await verification_snapshot(conn, database.users[0])
            assert old != new
            reports = await verifier.inspect_database(conn, [old, new])
            assert all(r['reproducible'] and r['ledger_matches'] for r in reports)
            assert all(r['ledger_scope'] == 'recorded_input_events_only' for r in reports)
    asyncio.run(run())


async def quarantined_artifact(conn, owner, code='private recovery fixture'):
    request = ArtifactWrite(expected_owner_id=owner, request_id=uuid4(), challenge_id='task', code=code)
    saved = await coding_store.artifact(conn, owner, request)
    event = await conn.fetchval('UPDATE unified_evidence_events SET attempts=5 WHERE source_id=$1 RETURNING id', UUID(saved['id']))
    return saved, event


def test_recovery_preview_apply_receipt_and_deletion_do_not_replay_evidence(database):
    from scripts import recover_unified_evidence as recovery
    async def run():
        async with database.connect() as conn:
            saved, event = await quarantined_artifact(conn, database.users[0])
            report = await recovery.inspect(conn)
            assert report['events'][0]['id'] == event and 'user_id' not in report['events'][0]
            manifest = await recovery.preview(conn, [event], 'local-test', 'REPAIR-1')
            assert 'private recovery fixture' not in json.dumps(manifest)
            assert str(database.users[0]) not in json.dumps(manifest) and saved['id'] not in json.dumps(manifest)
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', event) == 5
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_recovery_audit') == 0
            result = await recovery.apply_retry(conn, manifest, 'local-test')
            assert result['retried_count'] == 1 and not result['already_applied']
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', event) == 0
            assert await conn.fetchval('SELECT count(*) FROM unified_observations') == 0
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots') == 0
            assert (await recovery.apply_retry(conn, manifest, 'local-test'))['already_applied']
            altered = {**manifest, 'ticket_ref': 'REPAIR-2'}
            with pytest.raises(recovery.RecoveryError, match='REQUEST_REUSED'):
                await recovery.apply_retry(conn, altered, 'local-test')
            await conn.execute('DELETE FROM profiles WHERE id=$1', database.users[0])
            # A lost acknowledgement is recoverable without recreating deleted rows.
            assert (await recovery.apply_retry(conn, manifest, 'local-test'))['already_applied']
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 0
            receipt = dict(await conn.fetchrow('SELECT * FROM unified_evidence_recovery_audit'))
            assert receipt['retried_count'] == 1
            assert str(database.users[0]) not in json.dumps(receipt, default=str) and saved['id'] not in json.dumps(receipt, default=str)
    asyncio.run(run())


def test_recovery_rejects_changed_deleted_wrong_target_and_expired_selection(database):
    from datetime import datetime, timedelta
    from scripts import recover_unified_evidence as recovery
    async def run():
        async with database.connect() as conn:
            saved, first = await quarantined_artifact(conn, database.users[0])
            _, second = await quarantined_artifact(conn, database.users[1])
            manifest = await recovery.preview(conn, [first, second], 'local-test', 'REPAIR-1')
            for altered, target, error in [
                (manifest, 'other-test', 'TARGET_MISMATCH'),
                ({**manifest, 'target_sha256': 'f' * 64}, 'local-test', 'TARGET_MISMATCH'),
                ({**manifest, **{key: (datetime.fromisoformat(manifest[key]) - timedelta(hours=1)).isoformat() for key in ('created_at','expires_at')}}, 'local-test', 'MANIFEST_EXPIRED')]:
                with pytest.raises(recovery.RecoveryError, match=error): await recovery.apply_retry(conn, altered, target)
            await conn.execute('UPDATE unified_evidence_events SET attempts=6 WHERE id=$1', second)
            with pytest.raises(recovery.RecoveryError, match='EVENT_SELECTION_CHANGED'):
                await recovery.apply_retry(conn, manifest, 'local-test')
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', first) == 5
            manifest = await recovery.preview(conn, [first, second], 'local-test', 'REPAIR-1')
            await conn.execute('DELETE FROM coding_artifacts WHERE id=$1', UUID(saved['id']))
            with pytest.raises(recovery.RecoveryError, match='EVENT_SELECTION_CHANGED'):
                await recovery.apply_retry(conn, manifest, 'local-test')
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', second) == 6
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_recovery_audit') == 0
    asyncio.run(run())


def test_recovery_tombstones_and_audit_failure_abort_entire_retry(database):
    from scripts import recover_unified_evidence as recovery
    async def run():
        async with database.connect() as conn:
            saved, first = await quarantined_artifact(conn, database.users[0])
            manifest = await recovery.preview(conn, [first], 'local-test', 'REPAIR-1')
            await conn.execute('''INSERT INTO unified_deletion_tombstones(user_id,source_module,source_id)
                VALUES($1,'coding',$2)''', database.users[0], UUID(saved['id']))
            with pytest.raises(recovery.RecoveryError, match='SOURCE_ERASED'):
                await recovery.apply_retry(conn, manifest, 'local-test')
            _, second = await quarantined_artifact(conn, database.users[1])
            manifest = await recovery.preview(conn, [second], 'local-test', 'REPAIR-2')
            await conn.execute('''CREATE FUNCTION refuse_recovery_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$;
                CREATE TRIGGER refuse_recovery_audit BEFORE INSERT ON unified_evidence_recovery_audit
                FOR EACH ROW EXECUTE FUNCTION refuse_recovery_audit();''')
            with pytest.raises(asyncpg.RaiseError): await recovery.apply_retry(conn, manifest, 'local-test')
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', second) == 5
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_recovery_audit') == 0
    asyncio.run(run())


def test_recovery_concurrent_duplicate_apply_has_one_receipt(database):
    from scripts import recover_unified_evidence as recovery
    async def run():
        async with database.connect() as first, database.connect() as second:
            _, event = await quarantined_artifact(first, database.users[0])
            manifest = await recovery.preview(first, [event], 'local-test', 'REPAIR-1')
            results = await asyncio.gather(recovery.apply_retry(first, manifest, 'local-test'), recovery.apply_retry(second, manifest, 'local-test'))
            assert sorted(r['already_applied'] for r in results) == [False, True]
            assert await first.fetchval('SELECT count(*) FROM unified_evidence_recovery_audit') == 1
            assert await first.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', event) == 0
    asyncio.run(run())


def test_recovery_rls_rejects_partial_queue_visibility(database):
    from scripts import recover_unified_evidence as recovery
    async def run():
        async with database.connect() as conn:
            _, event = await quarantined_artifact(conn, database.users[0])
            role = 'recovery_browser_' + uuid4().hex
            await conn.execute(f'CREATE ROLE {role}')
            await conn.execute(f'GRANT USAGE ON SCHEMA {database.schema} TO {role}')
            await conn.execute(f'GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA {database.schema} TO {role}')
            await conn.execute(f'SET ROLE {role}')
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_recovery_audit') == 0
            with pytest.raises(asyncpg.InsufficientPrivilegeError): await recovery.inspect(conn)
            await conn.execute('RESET ROLE')
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', event) == 5
    asyncio.run(run())


def test_worker_serializes_failure_backoff_and_rolls_back_partial_projection(database, monkeypatch):
    from app.services import unified_evidence_worker as worker
    monkeypatch.setattr(worker, 'DatabaseConnection', database.connect)
    async def fail_after_observation(conn, event_id):
        await process_event(conn, event_id)
        await asyncio.sleep(0.1)
        raise ValueError('simulated projection failure')
    monkeypatch.setattr(worker, 'process_event', fail_after_observation)
    async def run():
        async with database.connect() as conn:
            _, event = await quarantined_artifact(conn, database.users[0])
            await conn.execute('UPDATE unified_evidence_events SET attempts=4,retry_after=NOW() WHERE id=$1', event)
        results = await asyncio.gather(worker.process_pending(event), worker.process_pending(event))
        assert sorted(results) == ['failed', 'skipped']
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT attempts FROM unified_evidence_events WHERE id=$1', event) == 5
            assert await conn.fetchval('SELECT processed_at FROM unified_evidence_events WHERE id=$1', event) is None
            assert await conn.fetchval('SELECT count(*) FROM unified_observations') == 0
            assert await conn.fetchval('SELECT count(*) FROM unified_readiness_snapshots') == 0
            await conn.execute('UPDATE unified_evidence_events SET attempts=1 WHERE id=$1', event)
        assert await worker.process_pending(event) == 'skipped'  # still in backoff
    asyncio.run(run())


def test_nonparticipants_do_not_get_unified_interview_receipts(database):
    async def run():
        async with database.connect() as conn:
            sid = uuid4()
            await conn.execute("INSERT INTO interview_sessions VALUES($1,$2,'ACTIVE','{}',NULL)", sid, database.users[1])
            await conn.execute("UPDATE interview_sessions SET state='FINISHED',finished_at=NOW() WHERE id=$1", sid)
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 0
            assert await backfill(conn) == []
    asyncio.run(run())


def test_queue_monitor_counts_backoff_quarantine_leases_without_mutation(database):
    from scripts import unified_queue_health as monitor
    async def run():
        async with database.connect() as conn:
            saved, quarantined = await quarantined_artifact(conn, database.users[0], 'private monitoring fixture')
            _, ready = await quarantined_artifact(conn, database.users[1])
            _, backoff = await quarantined_artifact(conn, database.users[0])
            _, processed = await quarantined_artifact(conn, database.users[1])
            await conn.execute("UPDATE unified_evidence_events SET created_at=NOW()-INTERVAL '2 minutes'")
            await conn.execute('UPDATE unified_evidence_events SET attempts=0 WHERE id=$1', ready)
            await conn.execute("UPDATE unified_evidence_events SET attempts=2,retry_after=NOW()+INTERVAL '1 minute' WHERE id=$1", backoff)
            await conn.execute('UPDATE unified_evidence_events SET processed_at=NOW() WHERE id=$1', processed)
            for state, lease in [('QUEUED', None), ('RUNNING', 'expired'), ('RUNNING', None), ('RUNNING', 'current'), ('UNAVAILABLE', None)]:
                await conn.execute('''INSERT INTO coding_validation_jobs(user_id,artifact_id,request_id,suite_id,
                    suite_sha256,code_sha256,qualification_id,runner_image,state,lease_until,created_at)
                    VALUES($1,$2,$3,'fixture',$4,$4,'fixture','fixture',$5,
                        CASE $6::text WHEN 'expired' THEN NOW()-INTERVAL '1 minute'
                            WHEN 'current' THEN NOW()+INTERVAL '1 minute' ELSE NULL END,
                        NOW()-INTERVAL '3 minutes')''', database.users[0], UUID(saved['id']), uuid4(), 'f'*64, state, lease)
            before = await conn.fetch('SELECT * FROM unified_evidence_events ORDER BY id')
            at, values = await monitor.inspect(conn, include_validation=True)
            assert {key: value for key, value in values.items() if not key.endswith('seconds')} == {
                'evidence_pending': 3, 'evidence_ready': 1, 'evidence_backoff': 1, 'evidence_quarantined': 1,
                'validation_queued': 1, 'validation_running': 3, 'validation_expired_leases': 2}
            assert 120 <= values['evidence_oldest_pending_age_seconds'] < 130
            assert 180 <= values['validation_oldest_queued_age_seconds'] < 190
            report = monitor.evaluate(at, values, monitor.Thresholds(60, 120))
            assert report['findings'] == ['EVIDENCE_QUEUE_AGED', 'EVIDENCE_QUARANTINED', 'VALIDATION_QUEUE_AGED', 'VALIDATION_LEASE_EXPIRED']
            assert await conn.fetch('SELECT * FROM unified_evidence_events ORDER BY id') == before
            assert await conn.fetchval("SELECT count(*) FROM coding_validation_jobs WHERE state='RUNNING'") == 3
            encoded = json.dumps(report)
            assert 'private monitoring fixture' not in encoded and saved['id'] not in encoded
            assert all(str(user) not in encoded for user in database.users)
    asyncio.run(run())


def test_queue_monitor_empty_scope_and_read_only_transaction(database):
    from scripts import unified_queue_health as monitor
    async def run():
        async with database.connect() as conn:
            at, values = await monitor.inspect(conn, include_validation=True)
            assert all(value == 0 for value in values.values())
            assert monitor.evaluate(at, values, monitor.Thresholds(60, 120))['status'] == 'WITHIN_THRESHOLDS'
            at, values = await monitor.inspect(conn)
            assert not any(key.startswith('validation_') for key in values)
            class AccidentalWrite:
                def __getattr__(self, key): return getattr(conn, key)
                async def fetchrow(self, *args):
                    await conn.execute('DELETE FROM unified_evidence_events')
            with pytest.raises(asyncpg.ReadOnlySQLTransactionError): await monitor.inspect(AccidentalWrite())
    asyncio.run(run())


def test_queue_monitor_refuses_rls_filtered_counts(database):
    from scripts import unified_queue_health as monitor
    async def run():
        async with database.connect() as conn:
            await quarantined_artifact(conn, database.users[0])
            role = 'queue_monitor_reader_' + uuid4().hex
            await conn.execute(f'CREATE ROLE {role}')
            await conn.execute(f'GRANT USAGE ON SCHEMA {database.schema} TO {role}')
            await conn.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA {database.schema} TO {role}')
            await conn.execute(f'SET ROLE {role}')
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 0
            with pytest.raises(asyncpg.InsufficientPrivilegeError): await monitor.inspect(conn)
            await conn.execute('RESET ROLE')
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 1
    asyncio.run(run())


def review_fixture(database, http):
    client, user = http
    database.settings.ARTIFACT_REVIEW_ENABLED = True
    database.settings.ARTIFACT_REVIEWER_PROFILE_IDS = str(database.users[1])
    async def save():
        async with database.connect() as conn:
            return await coding_store.artifact(conn, database.users[0], ArtifactWrite(
                expected_owner_id=database.users[0], request_id=uuid4(), challenge_id='review-fixture',
                code='private reviewed implementation', explanation='My saved explanation'))
    artifact = asyncio.run(save())
    request = {'expected_owner_id': user.id, 'artifact_id': artifact['id'], 'reviewer_id': str(database.users[1]),
        'request_id': str(uuid4()), 'consent_version': 'artifact-feedback-v1', 'share_saved_artifact': True}
    return request


def test_artifact_review_requires_explicit_consent_exact_owner_and_named_reviewer(database, http):
    client, user = http
    payload = review_fixture(database, http)
    for value in (False, 1, 'true'):
        assert client.post('/artifact-reviews', json={**payload, 'share_saved_artifact': value}).status_code == 422
    assert client.post('/artifact-reviews', json={**payload, 'reviewer_id': user.id}).status_code == 403
    assert client.post('/artifact-reviews', json={**payload, 'expected_owner_id': str(database.users[1])}).status_code == 409
    assert client.post('/artifact-reviews', json={**payload, 'artifact_id': str(uuid4())}).status_code == 404
    created = client.post('/artifact-reviews', json=payload)
    assert created.status_code == 201, created.text
    assert client.post('/artifact-reviews', json=payload).json() == created.json()
    assert client.post('/artifact-reviews', json={**payload, 'artifact_id': str(uuid4())}).status_code == 409
    identifier = created.json()['id']
    assert client.get(f'/artifact-reviews/{identifier}/artifact').status_code == 403
    user.id = str(database.users[1])
    assert client.get('/artifact-reviews/mine').json()['items'] == []
    result = client.get(f'/artifact-reviews/{identifier}/artifact')
    assert result.status_code == 200 and result.json()['artifact']['code'] == 'private reviewed implementation'
    assert not result.json()['assessment_qualified']
    assert client.get(f'/artifact-reviews/{uuid4()}/artifact').status_code == 404
    async def check():
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM artifact_review_audit') == 1
    asyncio.run(check())


def test_review_feedback_is_immutable_advisory_and_revocation_survives_flags(database, http):
    client, user = http
    payload = review_fixture(database, http)
    identifier = client.post('/artifact-reviews', json=payload).json()['id']
    user.id = str(database.users[1])
    feedback = {'expected_owner_id': user.id, 'rubric_version': 'artifact-feedback-v1',
        'observations': {'communication': 'OBSERVED_STRENGTH'}, 'feedback': 'The explanation identifies its trade-off.'}
    path = f'/artifact-reviews/{identifier}'
    assert client.post(path+'/feedback', json=feedback).json() == {'status': 'REVIEWED', 'assessment_qualified': False}
    assert client.post(path+'/feedback', json=feedback).status_code == 200
    assert client.post(path+'/feedback', json={**feedback, 'feedback': 'changed'}).status_code == 409
    assert client.post(path+'/withdraw', json={'expected_owner_id': user.id}).status_code == 404
    user.id = str(database.users[0])
    database.settings.ARTIFACT_REVIEW_ENABLED = False
    database.settings.CODING_WORKSPACE_ENABLED = False
    assert client.post(path+'/withdraw', json={'expected_owner_id': user.id}).status_code == 200
    assert client.post(path+'/withdraw', json={'expected_owner_id': user.id}).status_code == 200
    saved = client.get('/artifact-reviews/mine').json()['items'][0]
    assert saved['status'] == 'WITHDRAWN' and saved['feedback']['feedback'] == feedback['feedback']
    user.id = str(database.users[1]); database.settings.ARTIFACT_REVIEW_ENABLED = True
    assert client.get(path+'/artifact').status_code == 404
    assert client.post(path+'/feedback', json=feedback).status_code == 404
    async def check():
        async with database.connect() as conn:
            assert await conn.fetchval('SELECT count(*) FROM artifact_review_audit') == 3
            assert await conn.fetchval('SELECT count(*) FROM unified_evidence_events') == 1
            assert await conn.fetchval('SELECT count(*) FROM unified_observations') == 0
    asyncio.run(check())


def test_review_revoked_before_feedback_cannot_receive_a_late_submission(database, http):
    client, user = http
    payload = review_fixture(database, http)
    identifier = client.post('/artifact-reviews', json=payload).json()['id']
    path = f'/artifact-reviews/{identifier}'
    assert client.post(path+'/withdraw', json={'expected_owner_id': user.id}).status_code == 200
    user.id = str(database.users[1])
    assert client.post(path+'/feedback', json={'expected_owner_id': user.id, 'rubric_version': 'artifact-feedback-v1',
        'observations': {'correctness': 'NOT_ASSESSED'}, 'feedback': 'Late feedback'}).status_code == 404
    assert client.get('/artifact-reviews/inbox').json()['items'] == []
    database.settings.ARTIFACT_REVIEWER_PROFILE_IDS = '*'
    assert client.get('/artifact-reviews/inbox').status_code == 403


def test_artifact_review_rls_and_source_deletion_prevent_private_data_survival(database, http):
    client, _ = http
    payload = review_fixture(database, http)
    assert client.post('/artifact-reviews', json=payload).status_code == 201
    async def check():
        async with database.connect() as conn:
            role = 'artifact_review_browser_' + uuid4().hex
            await conn.execute(f'CREATE ROLE {role}')
            await conn.execute(f'GRANT USAGE ON SCHEMA {database.schema} TO {role}')
            await conn.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA {database.schema} TO {role}')
            await conn.execute(f'SET ROLE {role}')
            assert await conn.fetchval('SELECT count(*) FROM artifact_review_requests') == 0
            assert await conn.fetchval('SELECT count(*) FROM artifact_review_audit') == 0
            await conn.execute('RESET ROLE')
            await conn.execute('DELETE FROM coding_artifacts WHERE id=$1', UUID(payload['artifact_id']))
            assert await conn.fetchval('SELECT count(*) FROM artifact_review_requests') == 0
            assert await conn.fetchval('SELECT count(*) FROM artifact_review_audit') == 0
    asyncio.run(check())


def test_review_history_pages_keep_old_consents_reachable_and_scope_cursors(database, http):
    client, user = http
    payload = review_fixture(database, http)
    async def seed():
        async with database.connect() as conn:
            digest = await conn.fetchval('SELECT digest FROM coding_artifacts WHERE id=$1', UUID(payload['artifact_id']))
            for _ in range(52):
                await conn.execute('''INSERT INTO artifact_review_requests(user_id,artifact_id,reviewer_id,request_id,artifact_digest,consent_version)
                    VALUES($1,$2,$3,$4,$5,'artifact-feedback-v1')''', database.users[0], UUID(payload['artifact_id']), database.users[1], uuid4(), digest)
    asyncio.run(seed())
    first = client.get('/artifact-reviews/mine').json()
    assert len(first['items']) == 50 and first['next_cursor']
    second = client.get('/artifact-reviews/mine?before='+first['next_cursor']).json()
    assert len(second['items']) == 2 and second['next_cursor'] is None
    assert not {row['id'] for row in first['items']} & {row['id'] for row in second['items']}
    assert client.post('/artifact-reviews/'+second['items'][0]['id']+'/withdraw', json={'expected_owner_id': user.id}).status_code == 200
    user.id = str(database.users[1])
    assert client.get('/artifact-reviews/mine?before='+first['next_cursor']).status_code == 404
    inbox = client.get('/artifact-reviews/inbox').json()
    assert len(inbox['items']) == 50 and inbox['next_cursor']
    assert len(client.get('/artifact-reviews/inbox?before='+inbox['next_cursor']).json()['items']) == 1
    database.settings.ARTIFACT_REVIEWER_PROFILE_IDS += ','+str(database.users[0])
    user.id = str(database.users[0])
    assert client.get('/artifact-reviews/inbox?before='+inbox['next_cursor']).status_code == 404
    assert client.get('/artifact-reviews/'+first['items'][0]['id']+'/artifact').status_code == 404
