import pytest
import asyncio
import asyncpg
import os
import hashlib
from pathlib import Path

import uuid

# Never inherit production DATABASE_URL in a test that inserts synthetic rows.
# Validate at collection time, before any selected test can open a connection.
from urllib.parse import urlsplit

DATABASE_URL = os.getenv("PREPVISTA_TEST_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55322/postgres")
_test_target = urlsplit(DATABASE_URL)
if (_test_target.scheme not in {"postgres", "postgresql"}
        or _test_target.hostname not in {"127.0.0.1", "localhost", "::1"}
        or _test_target.query or _test_target.fragment):
    raise RuntimeError("PostgreSQL integration tests require an explicit loopback-only test database URL")

pytestmark = pytest.mark.asyncio

async def create_synthetic_user(conn, suffix):
    user_id = str(uuid.uuid4())
    email = f"test_{user_id[:8]}@example.com"
    await conn.execute("INSERT INTO profiles (id, email, full_name, plan) VALUES ($1, $2, $3, 'free')", user_id, email, "Test User")
    return user_id

async def create_synthetic_session(conn, user_id, suffix):
    session_id = str(uuid.uuid4())
    access_token = str(uuid.uuid4())
    await conn.execute("INSERT INTO interview_sessions (id, user_id, interview_type, plan, difficulty_mode, resume_text, access_token) VALUES ($1, $2, 'resume_based', 'free', 'auto', 'test resume', $3)", session_id, user_id, access_token)
    return session_id
    
async def create_synthetic_question(conn, session_id):
    question_id = str(uuid.uuid4())
    await conn.execute("INSERT INTO interview_questions (id, session_id, order_index, question) VALUES ($1, $2, 1, 'Q?') ON CONFLICT DO NOTHING;", question_id, session_id)
    return question_id

async def test_01_local_target_guard():
    assert "127.0.0.1" in DATABASE_URL or "localhost" in DATABASE_URL
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # verify 038 is applied
        row = await conn.fetchrow("SELECT 1 FROM schema_migrations WHERE version='038_rubric_category_expansion'")
        assert row is not None
    finally:
        await conn.close()

async def test_02_transaction_rollback():
    """Verify that a forced failure rolls back the entire answer transaction."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        user_id = await create_synthetic_user(conn, "rollback")
        session_id = await create_synthetic_session(conn, user_id, "rollback")
        eval_id = str(uuid.uuid4())
        
        try:
            async with conn.transaction():
                # 2. evaluation
                await conn.execute("INSERT INTO question_evaluations (id, session_id, turn_number, question_text, rubric_category, score) VALUES ($1, $2, 1, 'Q?', 'technical_depth', 10)", eval_id, session_id)
                # 3. force failure
                raise Exception("Forced failure")
        except Exception as e:
            assert str(e) == "Forced failure"
            
        # Verify rollback
        e = await conn.fetchrow("SELECT 1 FROM question_evaluations WHERE id=$1", eval_id)
        assert e is None
    finally:
        await conn.close()

async def test_03_select_for_update_concurrency():
    """Verify that FOR UPDATE serializes access."""
    conn1 = await asyncpg.connect(DATABASE_URL)
    conn2 = await asyncpg.connect(DATABASE_URL)
    try:
        user_id = await create_synthetic_user(conn1, "for_update")
        session_id = await create_synthetic_session(conn1, user_id, "for_update")
        
        # Connection 1 locks the row
        tr1 = conn1.transaction()
        await tr1.start()
        await conn1.fetchrow("SELECT id FROM interview_sessions WHERE id=$1 FOR UPDATE", session_id)
        
        # Connection 2 attempts to lock the row
        async def lock_conn2():
            tr2 = conn2.transaction()
            await tr2.start()
            await conn2.fetchrow("SELECT id FROM interview_sessions WHERE id=$1 FOR UPDATE", session_id)
            await tr2.commit()
            return True
            
        # conn2 should block
        task = asyncio.create_task(lock_conn2())
        done, pending = await asyncio.wait([task], timeout=0.5)
        assert not done # Task is still pending because it's blocked by conn1's lock
        
        # conn1 commits
        await tr1.commit()
        
        # conn2 should now proceed
        done, pending = await asyncio.wait([task], timeout=0.5)
        assert done
        assert task.result() is True
    finally:
        await conn1.close()
        await conn2.close()

async def test_04_concurrent_finish_idempotency():
    """Simulate concurrent finish requests on the same session."""
    conn = await asyncpg.connect(DATABASE_URL)
    conn2 = await asyncpg.connect(DATABASE_URL)
    try:
        user_id = await create_synthetic_user(conn, "finish_idem")
        session_id = await create_synthetic_session(conn, user_id, "finish_idem")
        
        # Create function to finish
        async def finish_session(c):
            async with c.transaction():
                # Lock row
                row = await c.fetchrow("SELECT state FROM interview_sessions WHERE id=$1 FOR UPDATE", session_id)
                if row is None:
                    return f"NOT_FOUND_{session_id}"
                if row['state'] == 'FINISHED':
                    return "ALREADY_FINISHED"
                    
                await c.execute("UPDATE interview_sessions SET state='FINISHED', final_score=85, finished_at=NOW() WHERE id=$1", session_id)
                return "FINISHED"

        # Fire them concurrently
        res = await asyncio.gather(finish_session(conn), finish_session(conn2))
        
        # One must FINISH, one must ALREADY_FINISHED
        assert "FINISHED" in res
        assert "ALREADY_FINISHED" in res
        
        # Verify state
        row = await conn.fetchrow("SELECT state, final_score FROM interview_sessions WHERE id=$1", session_id)
        assert row['state'] == 'FINISHED'
        assert row['final_score'] == 85
    finally:
        await conn.close()
        await conn2.close()

async def test_05_guided_assistance_ordering():
    """Verify that view must precede answer for attribution."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        user_id = await create_synthetic_user(conn, "ga_order")
        session_id = await create_synthetic_session(conn, user_id, "ga_order")
        
        # Insert generated hint
        ev_id = str(uuid.uuid4())
        req_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO interview_assistance_event (id, session_id, user_id, turn_number, assistance_type, assistance_level, generated_content, generated_at, request_id, question_text)
            VALUES ($1, $2, $3, 1, 'hint', 1, 'Hint', NOW() - INTERVAL '5 minutes', $4, 'Q?')
        """, ev_id, session_id, user_id, req_id)
        
        # Record view
        await conn.execute("UPDATE interview_assistance_event SET viewed_at=NOW() WHERE id=$1", ev_id)
        
        # Insert answer evaluating to 2 mins ago
        eval_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO question_evaluations (id, session_id, turn_number, question_text, rubric_category, created_at)
            VALUES ($1, $2, 1, 'Q?', 'technical_depth', NOW() - INTERVAL '2 minutes')
        """, eval_id, session_id)
        
        # Provenance attribution rule: viewed_at < answered_at
        row = await conn.fetchrow("""
            SELECT viewed_at < q.created_at AS was_used
            FROM interview_assistance_event a
            JOIN question_evaluations q ON a.session_id = q.session_id AND a.turn_number = q.turn_number
            WHERE a.id = $1
        """, ev_id)
        
        assert row['was_used'] is False # Late view does not retroactively attribute
    finally:
        await conn.close()

async def test_06_tenant_isolation():
    """Verify tenant isolation across queries."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        org1_id = str(uuid.uuid4())
        org2_id = str(uuid.uuid4())
        org1_code = f"COL-{str(uuid.uuid1().int)[:6]}"
        org2_code = f"COL-{str(uuid.uuid1().int)[6:12]}"
        await conn.execute("INSERT INTO organizations (id, name, org_code, category) VALUES ($1, $2, $3, 'college'), ($4, $5, $6, 'college');", org1_id, "Org " + org1_id, org1_code, org2_id, "Org " + org2_id, org2_code)
        
        # Create users for orgs
        user1 = await create_synthetic_user(conn, "org1_student")
        user2 = await create_synthetic_user(conn, "org2_student")
        
        await conn.execute("INSERT INTO organization_students (organization_id, user_id) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING;", org1_id, user1, org2_id, user2)
        
        # Query isolation for Admin of Org1
        # They should only see user1
        res = await conn.fetch("""
            SELECT user_id FROM organization_students
            WHERE organization_id = $1
        """, org1_id)
        assert len(res) == 1
        assert str(res[0]['user_id']) == user1
    finally:
        await conn.close()

async def test_07_score_report_semantics():
    """Verify NULL vs 0 score semantics."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        user_id = await create_synthetic_user(conn, "semantics")
        
        # Session A: positive measured
        sess_a = await create_synthetic_session(conn, user_id, "sess_a")
        await conn.execute("UPDATE interview_sessions SET state='FINISHED', final_score=85 WHERE id=$1", sess_a)
        
        # Session B: real zero
        sess_b = await create_synthetic_session(conn, user_id, "sess_b")
        await conn.execute("UPDATE interview_sessions SET state='FINISHED', final_score=0 WHERE id=$1", sess_b)
        
        # Session C: all unmeasured (NULL)
        sess_c = await create_synthetic_session(conn, user_id, "sess_c")
        await conn.execute("UPDATE interview_sessions SET state='FINISHED', final_score=NULL WHERE id=$1", sess_c)
        
        rows = await conn.fetch("SELECT id, final_score FROM interview_sessions WHERE user_id=$1", user_id)
        scores = {str(r['id']): r['final_score'] for r in rows}
        
        assert scores[sess_a] == 85
        assert scores[sess_b] == 0  # 0 remains 0
        assert scores[sess_c] is None # Unmeasured remains NULL
    finally:
        await conn.close()

async def test_08_repository_migrations_match_ledger():
    """Validate actual applied files; extra production versions are permitted."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        rows = await conn.fetch("SELECT version, checksum FROM schema_migrations")
        applied = {row["version"]: row["checksum"] for row in rows}
        migrations = Path(__file__).resolve().parents[1] / "app" / "database" / "migrations"
        for migration in sorted(migrations.glob("*.sql")):
            if migration.stem in ("050_cron_schema_reconciliation", "051_pg_cron_runtime_reconciliation"): continue
            assert migration.stem in applied, f"Missing migration: {migration.name}"
            checksum = hashlib.sha256(migration.read_text(encoding="utf-8-sig").encode("utf-8")).hexdigest()
            assert applied[migration.stem] == checksum, f"Checksum mismatch: {migration.name}"
    finally:
        await conn.close()
