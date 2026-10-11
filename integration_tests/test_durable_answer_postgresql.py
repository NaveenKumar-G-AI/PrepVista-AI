"""Durable acceptance on real PostgreSQL; never uses an ambient production DSN.

Run explicitly: PREPVISTA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55322/postgres
python -m pytest integration_tests/test_durable_answer_postgresql.py -v

Each test creates a new synthetic schema. Tables model the existing application
columns used by these operations; this is transaction verification, not migration
qualification. Only provider/network boundaries and deliberate failure locations
are substituted. Acceptance, row locks, COMMIT/ROLLBACK, and observer queries use
real independent PostgreSQL connections with fsync/synchronous_commit enabled.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio

DSN = os.environ.get("PREPVISTA_TEST_DATABASE_URL", "postgresql://postgres@127.0.0.1:55322/postgres")
TARGET = urlsplit(DSN)
if (TARGET.scheme not in {"postgres", "postgresql"}
        or TARGET.hostname not in {"127.0.0.1", "localhost", "::1"}
        or TARGET.query or TARGET.fragment):
    raise RuntimeError("Durable answer tests require a loopback-only disposable PostgreSQL URL")

# Never consult credentials from .env while importing application services.
for key, value in {
    "ENVIRONMENT": "development", "PREPVISTA_DEBUG": "false",
    "SUPABASE_URL": "https://test.supabase.co", "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_KEY": "test-service-key", "SUPABASE_JWT_SECRET": "test-jwt-secret-padded-to-thirty-two-plus-chars",
    "DATABASE_URL": DSN, "GROQ_API_KEY": "", "OPENAI_API_KEY": "", "DEEPGRAM_API_KEY": "",
    "UPSTASH_REDIS_URL": "", "UPSTASH_REDIS_TOKEN": "",
}.items():
    os.environ[key] = value

from fastapi import BackgroundTasks, HTTPException
from app.database import connection as db
from app.dependencies import UserProfile
from app.routers import interviews_answer as answers
from app.routers.interviews_schemas import AnswerRequest
from app.services import interviewer_session, evaluator_scoring
from app.services.answer_acceptance import settle_accepted_evidence
from app.services.interview_terminal import connection, terminalize, terminal_records

pytestmark = pytest.mark.asyncio

DDL = """
CREATE TABLE interview_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, access_token text NOT NULL,
 state text NOT NULL DEFAULT 'ACTIVE', total_turns integer NOT NULL DEFAULT 1,
 runtime_state jsonb NOT NULL DEFAULT '{}', plan text DEFAULT 'free',
 difficulty_mode text DEFAULT 'auto', resume_text text DEFAULT 'Synthetic test resume',
 resume_summary jsonb DEFAULT '{}', question_plan jsonb DEFAULT '[]',
 silence_count integer DEFAULT 0, consecutive_followups integer DEFAULT 0,
 skip_topics text[] DEFAULT '{}', active_question_signature text,
 active_question_turn integer DEFAULT 1, question_retry_count integer DEFAULT 0,
 last_answer_status text, last_client_request_id text, last_client_response jsonb
);
CREATE TABLE interview_assistance_event (
 id uuid PRIMARY KEY, session_id uuid, question_instance_id uuid,
 user_id uuid, assistance_type text, generated_at timestamptz,
 generated_content text, viewed_at timestamptz, model_provider text,
 turn_number integer, invalidated boolean DEFAULT false, used_before_answer boolean DEFAULT false
);
CREATE TABLE conversation_messages (
 id bigserial PRIMARY KEY, session_id uuid, role text, content text, turn_number integer
);
CREATE TABLE question_evaluations (
 id uuid DEFAULT gen_random_uuid(), session_id uuid, turn_number integer,
 UNIQUE(session_id, turn_number)
);
"""

@pytest_asyncio.fixture
async def real_db(monkeypatch):
    schema = "p0_acceptance_" + uuid4().hex
    admin = await asyncpg.connect(DSN)
    assert await admin.fetchval("SELECT current_setting('fsync')") == "on"
    assert await admin.fetchval("SELECT current_setting('synchronous_commit')") == "on"
    await admin.execute(f'CREATE SCHEMA "{schema}"')
    await admin.execute(f'SET search_path TO "{schema}"')
    await admin.execute(DDL)
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=8,
                                    server_settings={"search_path": schema}, command_timeout=10)
    monkeypatch.setattr(db, "_pool", pool)
    sid, owner, qid = str(uuid4()), str(uuid4()), str(uuid4())
    state = {"terminal_contract_version": 1, "active_question_id": qid,
             "question_records": {qid: {"question_instance_id": qid, "turn": 1,
                                         "question_text": "Explain your database project?"}}}
    await admin.execute("INSERT INTO interview_sessions(id,user_id,access_token,runtime_state) VALUES($1,$2,$3,$4)",
                        sid, owner, "synthetic-access-token", json.dumps(state))
    await admin.execute("INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'assistant',$2,1)",
                        sid, state["question_records"][qid]["question_text"])
    req = AnswerRequest(access_token="synthetic-access-token", client_request_id="attempt-"+uuid4().hex,
                        expected_turn=1, question_instance_id=qid,
                        user_text="I built a database project using row locks and durable transactions.",
                        capture_evidence={"audio_bytes": 8192, "speech_detected": True,
                                          "flush_status": "complete", "stt_source": "server"})
    user = UserProfile(owner, "synthetic@example.invalid", "free")
    async def runtime():
        return json.loads(await admin.fetchval("SELECT runtime_state FROM interview_sessions WHERE id=$1", sid))
    case = SimpleNamespace(admin=admin, pool=pool, sid=sid, user=user, req=req, qid=qid,
                           runtime=runtime, schema=schema)
    try:
        yield case
    finally:
        try:
            # A broken release must fail this fixture, never hang the remaining
            # crash tests. asyncpg.close() itself terminates on cancellation.
            # Preserve holder diagnostics before that cleanup alters their state.
            holders = [{"in_use": holder._in_use is not None,
                        "connection_closed": holder._con.is_closed() if holder._con else None}
                       for holder in pool._holders]
            try:
                await asyncio.wait_for(pool.close(), 10)
            except TimeoutError as exc:
                raise AssertionError(f"PostgreSQL pool failed to close; initial holders: {holders}") from exc
        finally:
            # This exact random schema contains only rows created by this fixture.
            assert schema.startswith("p0_acceptance_") and len(schema) == len("p0_acceptance_") + 32
            try:
                await admin.execute(f'DROP SCHEMA "{schema}" CASCADE', timeout=10)
            finally:
                await admin.close(timeout=10)

async def submit(case):
    return await answers.submit_answer(case.sid, case.req, None, BackgroundTasks(), case.user)

async def unavailable(*args, **kwargs):
    raise RuntimeError("injected optional provider outage")

async def committed_original(case):
    state = await case.runtime()
    accepted = state["accepted_attempts"][case.req.client_request_id]
    assert accepted["request"]["user_text"] == case.req.user_text
    assert accepted["request"]["capture_evidence"]["audio_bytes"] == 8192
    assert accepted["question_instance_id"] == case.qid
    assert "access_token" not in accepted["request"]
    return accepted

async def test_commit_is_visible_before_optional_processing(real_db, monkeypatch):
    case = real_db
    async def observe(*args):
        await committed_original(case)  # Independent connection cannot see uncommitted writes.
        raise RuntimeError("point C immediately after acceptance commit")
    monkeypatch.setattr(answers, "_process_accepted_answer", observe)
    response = await submit(case)
    assert response["action"] == "accepted" and response["processing_state"] == "PENDING"
    assert response["evidence_ack"]["durable"] is True
    assert len((await case.runtime())["accepted_attempts"]) == 1


async def test_accept_only_ack_commits_without_any_enrichment(real_db, monkeypatch):
    case = real_db
    async def forbidden(*args, **kwargs):
        pytest.fail("Accept-only endpoint must not invoke enrichment")
    monkeypatch.setattr(answers, "_process_accepted_answer", forbidden)
    response = await answers.accept_answer(case.sid, case.req, case.user)
    assert response["evidence_ack"]["durable"] is True
    await committed_original(case)
    assert await case.admin.fetchval("SELECT count(*) FROM conversation_messages WHERE role='user'") == 0
    assert (await case.runtime())["question_records"][case.qid].get("outcome") is None


async def test_legacy_runtime_writers_wait_for_acceptance_and_preserve_original(real_db, monkeypatch):
    case, reached, release = real_db, asyncio.Event(), asyncio.Event()
    actual_factory = answers.DatabaseConnection
    class WrappedConnection:
        def __init__(self, conn): self.conn = conn
        def __getattr__(self, key): return getattr(self.conn, key)
        async def execute(self, query, *args):
            result = await self.conn.execute(query, *args)
            if query.startswith("UPDATE interview_sessions SET runtime_state"):
                reached.set()
                await release.wait()
            return result
    class WrappedFactory:
        async def __aenter__(self):
            self.actual = actual_factory()
            return WrappedConnection(await self.actual.__aenter__())
        async def __aexit__(self, *args): return await self.actual.__aexit__(*args)
    monkeypatch.setattr(answers, "DatabaseConnection", WrappedFactory)
    acceptance = asyncio.create_task(answers.accept_answer(case.sid, case.req, case.user))
    await asyncio.wait_for(reached.wait(), 5)
    timeout = asyncio.create_task(answers._record_unevaluated_turn(
        case.sid, 1, "Old timeout question", "", "no_answer", question_instance_id=case.qid))
    unavailable_task = asyncio.create_task(answers._mark_evaluation_unavailable(case.sid, case.qid))
    done, _ = await asyncio.wait([timeout, unavailable_task], timeout=0.1)
    assert not done  # Both legacy writers must await the real row lock.
    release.set()
    assert (await acceptance)["evidence_ack"]["durable"] is True
    original = await committed_original(case)
    await asyncio.wait_for(asyncio.gather(timeout, unavailable_task), 5)
    assert await committed_original(case) == original
    record = (await case.runtime())["question_records"][case.qid]
    assert record.get("outcome") is None
    assert "evaluation_state" not in record

@pytest.mark.parametrize("boundary", ["before_update", "after_update"])
async def test_cancel_before_acceptance_commit_rolls_back_and_retry_commits(real_db, monkeypatch, boundary):
    case, reached, parked = real_db, asyncio.Event(), asyncio.Event()
    actual_factory = answers.DatabaseConnection
    class WrappedConnection:
        def __init__(self, conn): self.conn = conn
        def __getattr__(self, key): return getattr(self.conn, key)
        async def execute(self, query, *args):
            target = query.startswith("UPDATE interview_sessions SET runtime_state")
            if target and boundary == "before_update":
                reached.set()
                await parked.wait()
            result = await self.conn.execute(query, *args)
            if target and boundary == "after_update":
                reached.set()
                await parked.wait()
            return result
    class WrappedFactory:
        async def __aenter__(self):
            self.actual = actual_factory()
            return WrappedConnection(await self.actual.__aenter__())
        async def __aexit__(self, *args): return await self.actual.__aexit__(*args)
    monkeypatch.setattr(answers, "DatabaseConnection", WrappedFactory)
    task = asyncio.create_task(submit(case))
    await asyncio.wait_for(reached.wait(), 5)
    assert "accepted_attempts" not in await case.runtime()
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert "accepted_attempts" not in await case.runtime()
    monkeypatch.setattr(answers, "DatabaseConnection", actual_factory)
    monkeypatch.setattr(answers, "_process_accepted_answer", unavailable)
    assert (await submit(case))["evidence_ack"]["durable"] is True
    await committed_original(case)

async def test_cancel_during_processing_rolls_back_only_enrichment(real_db, monkeypatch):
    case, reached, parked = real_db, asyncio.Event(), asyncio.Event()
    async def processing(*args):
        conn = connection.get()
        assert conn.is_in_transaction()
        state = json.loads(await conn.fetchval("SELECT runtime_state FROM interview_sessions WHERE id=$1", case.sid))
        state["optional_uncommitted_marker"] = True
        await conn.execute("UPDATE interview_sessions SET runtime_state=$2 WHERE id=$1", case.sid, json.dumps(state))
        await conn.execute("INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'user',$2,1)",
                           case.sid, case.req.user_text)
        reached.set()
        await parked.wait()
    monkeypatch.setattr(answers, "_submit_answer_impl", processing)
    task = asyncio.create_task(submit(case))
    await asyncio.wait_for(reached.wait(), 5)
    before = await committed_original(case)
    task.cancel()
    with pytest.raises(asyncio.CancelledError): await task
    assert await committed_original(case) == before
    state = await case.runtime()
    assert "optional_uncommitted_marker" not in state
    assert await case.admin.fetchval("SELECT count(*) FROM conversation_messages WHERE role='user'") == 0

async def test_backend_connection_termination_after_commit_retains_evidence(real_db, monkeypatch):
    case, reached, release = real_db, asyncio.Event(), asyncio.Event()
    process_pid = None
    async def processing(*args):
        nonlocal process_pid
        conn = connection.get()
        process_pid = await conn.fetchval("SELECT pg_backend_pid()")
        await conn.execute("INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'user',$2,1)",
                           case.sid, case.req.user_text)
        reached.set()
        await release.wait()
        await conn.fetchval("SELECT 1")
    monkeypatch.setattr(answers, "_submit_answer_impl", processing)
    task = asyncio.create_task(submit(case))
    await asyncio.wait_for(reached.wait(), 5)
    original = await committed_original(case)
    assert await case.admin.fetchval("SELECT pg_terminate_backend($1)", process_pid)
    release.set()
    response = await task
    assert response["evidence_ack"]["durable"] is True
    assert await committed_original(case) == original
    assert await case.admin.fetchval("SELECT count(*) FROM conversation_messages WHERE role='user'") == 0
    # A backend kill must not permanently consume a pool slot. Acquire every
    # configured slot, so a leaked closed holder cannot hide behind spare ones.
    checked_out = []
    try:
        for _ in range(case.pool.get_max_size()):
            checked_out.append(await case.pool.acquire(timeout=3))
        assert all(await asyncio.gather(*(conn.fetchval("SELECT 1") for conn in checked_out)))
    finally:
        await asyncio.gather(*(case.pool.release(conn) for conn in checked_out))


WORKER_SCRIPT = r'''
import asyncio, json, sys
from integration_tests.test_durable_answer_postgresql import (
    DSN, asyncpg, db, answers, AnswerRequest, UserProfile, BackgroundTasks, connection
)

async def main():
    schema, sid, owner, request_json, boundary = sys.argv[1:]
    db._pool = await asyncpg.create_pool(DSN, min_size=1, max_size=2,
                                      server_settings={"search_path": schema})
    req = AnswerRequest.model_validate_json(request_json)
    user = UserProfile(owner, "synthetic@example.invalid", "free")
    if boundary == "before_commit":
        actual_factory = answers.DatabaseConnection
        class WrappedConnection:
            def __init__(self, conn): self.conn = conn
            def __getattr__(self, key): return getattr(self.conn, key)
            async def execute(self, query, *args):
                result = await self.conn.execute(query, *args)
                if query.startswith("UPDATE interview_sessions SET runtime_state"):
                    print("P0_WORKER_PARKED", flush=True)
                    await asyncio.Event().wait()
                return result
        class WrappedFactory:
            async def __aenter__(self):
                self.actual = actual_factory()
                return WrappedConnection(await self.actual.__aenter__())
            async def __aexit__(self, *args):
                return await self.actual.__aexit__(*args)
        answers.DatabaseConnection = WrappedFactory
    else:
        async def processing(*args):
            conn = connection.get()
            await conn.execute(
                "INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'user',$2,1)",
                sid, req.user_text)
            print("P0_WORKER_PARKED", flush=True)
            await asyncio.Event().wait()
        answers._submit_answer_impl = processing
    await answers.submit_answer(sid, req, None, BackgroundTasks(), user)

asyncio.run(main())
'''


@pytest.mark.parametrize("boundary", ["before_commit", "after_commit"])
async def test_killed_python_worker_obeys_acceptance_commit_boundary(real_db, monkeypatch, boundary):
    """Kill an actual worker OS process while PostgreSQL and observer stay alive."""
    case = real_db
    worker = await asyncio.create_subprocess_exec(
        sys.executable, "-c", WORKER_SCRIPT, case.schema, case.sid, str(case.user.id),
        case.req.model_dump_json(), boundary,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        async def wait_parked():
            output = []
            while line := await worker.stdout.readline():
                output.append(line.decode(errors="replace"))
                if "P0_WORKER_PARKED" in output[-1]:
                    return
            raise AssertionError("Worker exited before failpoint: " + "".join(output))
        await asyncio.wait_for(wait_parked(), 15)
        if boundary == "after_commit":
            original = await committed_original(case)
        else:
            assert "accepted_attempts" not in await case.runtime()
        worker.kill()
        await asyncio.wait_for(worker.wait(), 10)
        assert worker.returncode != 0
        if boundary == "after_commit":
            assert await committed_original(case) == original
        else:
            assert "accepted_attempts" not in await case.runtime()
        assert await case.admin.fetchval("SELECT count(*) FROM conversation_messages WHERE role='user'") == 0
        monkeypatch.setattr(answers, "_process_accepted_answer", unavailable)
        assert (await submit(case))["evidence_ack"]["durable"] is True
        await committed_original(case)
        assert len((await case.runtime())["accepted_attempts"]) == 1
    finally:
        if worker.returncode is None:
            worker.kill()
            await worker.wait()

async def test_five_concurrent_retries_accept_and_terminalize_exactly_once(real_db, monkeypatch):
    case, calls = real_db, 0
    async def processing(*args):
        nonlocal calls
        calls += 1
        conn = connection.get()
        state = json.loads(await conn.fetchval("SELECT runtime_state FROM interview_sessions WHERE id=$1", case.sid))
        terminalize(state, case.qid, "EVALUATED", case.req.user_text, case.req.capture_evidence)
        await conn.execute("UPDATE interview_sessions SET runtime_state=$2 WHERE id=$1", case.sid, json.dumps(state))
        await conn.execute("INSERT INTO conversation_messages(session_id,role,content,turn_number) VALUES($1,'user',$2,1)",
                           case.sid, case.req.user_text)
        return {"action": "accepted", "processing_state": "COMPLETE"}
    monkeypatch.setattr(answers, "_submit_answer_impl", processing)
    responses = await asyncio.gather(*(submit(case) for _ in range(5)))
    assert calls == 1
    assert all(item["evidence_ack"]["durable"] for item in responses)
    state = await case.runtime()
    assert len(state["accepted_attempts"]) == len(state["answer_responses"]) == 1
    assert len(terminal_records(state)) == 1
    assert await case.admin.fetchval("SELECT count(*) FROM conversation_messages WHERE role='user'") == 1

async def test_ambiguous_response_retry_and_changed_payload_conflict(real_db, monkeypatch):
    case = real_db
    monkeypatch.setattr(answers, "_process_accepted_answer", unavailable)
    response = await submit(case)  # Imagine the response is lost before reaching the client.
    accepted = await committed_original(case)
    assert (await submit(case))["evidence_ack"] == response["evidence_ack"]
    case.req = case.req.model_copy(update={"user_text": "Changed attempted overwrite"})
    with pytest.raises(HTTPException) as error:
        await submit(case)
    assert error.value.status_code == 409
    state = await case.runtime()
    assert state["accepted_attempts"][case.req.client_request_id] == accepted

async def test_q1_retry_after_q2_advance_never_binds_to_q2(real_db, monkeypatch):
    case = real_db
    monkeypatch.setattr(answers, "_process_accepted_answer", unavailable)
    await submit(case)
    original = await committed_original(case)
    state = await case.runtime()
    q2 = str(uuid4())
    state["active_question_id"] = q2
    state["question_records"][q2] = {"question_instance_id": q2, "turn": 2, "question_text": "Second question?"}
    await case.admin.execute("UPDATE interview_sessions SET total_turns=2,runtime_state=$2 WHERE id=$1", case.sid, json.dumps(state))
    await submit(case)
    assert await committed_original(case) == original
    state = await case.runtime()
    assert state["question_records"][q2].get("raw_answer") is None
    assert len(state["accepted_attempts"]) == 1

async def test_owner_and_question_isolation(real_db, monkeypatch):
    case = real_db
    monkeypatch.setattr(answers, "_process_accepted_answer", unavailable)
    stranger = UserProfile(str(uuid4()), "stranger@example.invalid", "free")
    with pytest.raises(HTTPException) as error:
        await answers._accept_candidate_evidence(case.sid, case.req, stranger)
    assert error.value.status_code == 404
    case.req = case.req.model_copy(update={"question_instance_id": uuid4()})
    with pytest.raises(HTTPException) as error:
        await answers._accept_candidate_evidence(case.sid, case.req, case.user)
    assert error.value.status_code == 409
    assert "accepted_attempts" not in await case.runtime()

@pytest.mark.parametrize("phase", ["evaluation", "repair", "followup"])
async def test_actual_optional_path_failure_preserves_committed_evidence(real_db, monkeypatch, phase):
    case, reached = real_db, False
    async def fail(*args, **kwargs):
        nonlocal reached
        reached = True
        await committed_original(case)
        raise RuntimeError("injected " + phase + " failure")
    async def memory(*args, **kwargs): return {}
    async def no_rate_limit(*args, **kwargs): pass
    monkeypatch.setattr(answers, "rate_limit_session", no_rate_limit)
    monkeypatch.setattr(interviewer_session, "load_recent_session_question_memory_cached", memory)
    if phase == "followup":
        monkeypatch.setattr(interviewer_session, "generate_live_followup_with_dedup", fail)
    else:
        # The real process_answer closes and persists the turn before calling
        # the real evaluation write helper; final report aggregation is outside
        # this deliberately small transaction fixture.
        case.req = case.req.model_copy(update={"end_after_answer": True})
        async def local_finish(*args, **kwargs): return {"final_score": None}
        async def no_funnel(*args, **kwargs): pass
        monkeypatch.setattr(answers, "finish_session", local_finish)
        monkeypatch.setattr(answers, "track_funnel_event", no_funnel)
        if phase == "evaluation":
            monkeypatch.setattr(answers, "evaluate_single_question", fail)
        else:
            monkeypatch.setattr(evaluator_scoring, "repair_transcript", fail)
    response = await submit(case)
    assert reached, "The selected actual optional-work seam was not executed"
    assert response["evidence_ack"]["durable"] is True
    await committed_original(case)
    state = await case.runtime()
    record = state["question_records"][case.qid]
    assert record.get("outcome") not in {"NO_ANSWER", "ABORTED"}
    assert await case.admin.fetchval("SELECT count(*) FROM question_evaluations") == 0
    if phase != "followup":
        assert record["raw_answer"] == case.req.user_text
        assert record["evaluation_state"] == "UNAVAILABLE" and record["measured"] is False

async def test_finish_settles_committed_pending_once_without_fabricated_score(real_db, monkeypatch):
    case = real_db
    monkeypatch.setattr(answers, "_process_accepted_answer", unavailable)
    await submit(case)
    original = await committed_original(case)
    async with case.pool.acquire() as conn:
        async with conn.transaction():
            state = json.loads(await conn.fetchval("SELECT runtime_state FROM interview_sessions WHERE id=$1 FOR UPDATE", case.sid))
            settle_accepted_evidence(state)
            settle_accepted_evidence(state)
            await conn.execute("UPDATE interview_sessions SET runtime_state=$2 WHERE id=$1", case.sid, json.dumps(state))
    state = await case.runtime()
    records = terminal_records(state)
    assert len(records) == await case.admin.fetchval("SELECT total_turns FROM interview_sessions WHERE id=$1", case.sid)
    assert records[0]["outcome"] == "EVALUATED" and records[0]["measured"] is False
    assert records[0]["evaluation_state"] == "UNAVAILABLE"
    assert records[0]["raw_answer"] == case.req.user_text
    assert await committed_original(case) == original
