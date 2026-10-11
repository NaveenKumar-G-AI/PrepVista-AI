"""Behavioral crash/retry regressions using actual answer and finish routes.

These complement (not replace) the disposable PostgreSQL transaction tests.
"""
import asyncio
from contextlib import asynccontextmanager
import copy
from unittest.mock import AsyncMock

import pytest
from fastapi import BackgroundTasks, HTTPException
from test_batch0_history_safety import user
from test_batch2_interview_stt import store  # noqa: F401 -- shared actual SQL fixture
from app.routers import interviews_answer as answers, interviews_session as routes
from app.services import interviewer_session as sessions, evaluator_scoring
from app.services.interview_terminal import terminal_records


TEXT = "  I built a Python API.\nI tested every endpoint before release.  "


@pytest.mark.parametrize("provider_fails", [False, True])
def test_valid_transcript_survives_a_later_unintelligible_window(store, monkeypatch, provider_fails):
    if provider_fails:
        monkeypatch.setattr(answers, "evaluate_single_question", AsyncMock(side_effect=RuntimeError("provider unavailable")))
    async def run():
        first = await store.start()
        capture = {"audio_bytes": 4096, "speech_detected": True, "failed": False,
                   "flush_status": "ok", "unintelligible": True}
        response = await store.submit(TEXT, "multiwindow", 1, first["question_instance_id"], capture_evidence=capture)
        accepted = copy.deepcopy(store.runtime()["accepted_attempts"]["multiwindow"])
        assert accepted["outcome"] == "EVALUATED"
        assert accepted["request"]["user_text"] == TEXT
        assert accepted["request"]["capture_evidence"] == capture
        record = terminal_records(store.runtime())[0]
        assert record["outcome"] == "EVALUATED" and record["raw_answer"] == TEXT
        if provider_fails:
            assert record["evaluation_state"] == "UNAVAILABLE" and record["measured"] is False
        else:
            assert record["measured"] is True
        assert response["evidence_ack"]["durable"]
        assert await store.submit(TEXT, "multiwindow", 1, first["question_instance_id"], capture_evidence=capture) == response
        assert store.runtime()["accepted_attempts"]["multiwindow"] == accepted
        assert sum(bool(item.get("outcome")) for item in terminal_records(store.runtime())) == 1
    asyncio.run(run())


def test_audio_window_metadata_survives_acceptance_and_retry(store):
    async def run():
        first = await store.start()
        capture = {"audio_bytes": 4096, "source": "server_stt", "audio_windows": [{
            "id": "window-1", "bytes": 4096, "mime_type": "audio/webm",
            "captured_at": "2026-10-08T10:00:00Z", "transcription_status": "succeeded",
            "audio_id": "audio-ref", "audio_url": "https://storage.invalid/object",
            "confidence": 0.94, "provider": "whisper",
        }]}
        response = await store.submit(TEXT, "answer", 1, first["question_instance_id"], capture_evidence=capture)
        original = store.runtime()["accepted_attempts"]["answer"]["request"]
        assert original["capture_evidence"] == capture
        assert await store.submit(TEXT, "answer", 1, first["question_instance_id"], capture_evidence=capture) == response
    asyncio.run(run())


def test_original_evidence_commits_before_optional_processing(store, monkeypatch):
    original_transaction = store.transaction
    committed = []
    @asynccontextmanager
    async def observed_transaction():
        async with original_transaction():
            yield
        committed.append(copy.deepcopy(store.runtime()))
    monkeypatch.setattr(store, "transaction", observed_transaction)
    async def evaluate(**kwargs):
        assert any("answer" in state.get("accepted_attempts", {}) for state in committed)
        assert store.runtime()["accepted_attempts"]["answer"]["request"]["user_text"] == TEXT
        assert kwargs["raw_answer"] == TEXT
        return {"classification": "strong", "score": 8, "communication_score": 8}
    monkeypatch.setattr(answers, "evaluate_single_question", evaluate)
    async def run():
        first = await store.start()
        result = await store.submit(TEXT, "answer", 1, first["question_instance_id"], capture_evidence={"audio_bytes": 100, "source": "server_stt"})
        assert result["evidence_ack"]["durable"] is True
        accepted = store.runtime()["accepted_attempts"]["answer"]
        assert "access_token" not in accepted["request"]
        assert accepted["request"]["capture_evidence"]["audio_bytes"] == 100
        assert terminal_records(store.runtime())[0]["raw_answer"] == TEXT
        raw = store.db.execute("SELECT raw_answer FROM question_evaluations WHERE session_id=?", (store.session,)).fetchone()[0]
        assert raw == TEXT
    asyncio.run(run())


@pytest.mark.parametrize("boundary", ["before_insert", "before_commit", "after_commit", "evaluation"])
def test_cancellation_has_recoverable_copy_and_same_identity_retry(store, monkeypatch, boundary):
    async def run():
        first = await store.start()
        original_run = store.run
        original_transaction = store.transaction
        original_process = answers._process_accepted_answer
        original_evaluate = answers.evaluate_single_question
        if boundary == "before_insert":
            def cancel_insert(sql, args):
                if "UPDATE interview_sessions SET runtime_state = $2" in sql and '"accepted_attempts"' in str(args):
                    raise asyncio.CancelledError()
                return original_run(sql, args)
            monkeypatch.setattr(store, "run", cancel_insert)
        elif boundary == "before_commit":
            @asynccontextmanager
            async def cancel_commit():
                async with original_transaction():
                    yield
                    raise asyncio.CancelledError()
            monkeypatch.setattr(store, "transaction", cancel_commit)
        elif boundary == "after_commit":
            monkeypatch.setattr(answers, "_process_accepted_answer", AsyncMock(side_effect=asyncio.CancelledError()))
        else:
            monkeypatch.setattr(answers, "evaluate_single_question", AsyncMock(side_effect=asyncio.CancelledError()))
        with pytest.raises(asyncio.CancelledError):
            await store.submit(TEXT, "answer", 1, first["question_instance_id"])
        accepted = store.runtime().get("accepted_attempts", {})
        assert ("answer" in accepted) == (boundary in {"after_commit", "evaluation"})
        assert not terminal_records(store.runtime())[0].get("outcome")
        monkeypatch.setattr(store, "run", original_run)
        monkeypatch.setattr(store, "transaction", original_transaction)
        monkeypatch.setattr(answers, "_process_accepted_answer", original_process)
        monkeypatch.setattr(answers, "evaluate_single_question", original_evaluate)
        response = await store.submit(TEXT, "answer", 1, first["question_instance_id"])
        assert response["evidence_ack"]["durable"]
        for _ in range(5):
            assert await store.submit(TEXT, "answer", 1, first["question_instance_id"]) == response
        assert len(store.runtime()["accepted_attempts"]) == 1
        assert sum(bool(item.get("outcome")) for item in terminal_records(store.runtime())) == 1
        assert store.db.execute("SELECT COUNT(*) FROM conversation_messages WHERE session_id=? AND role='user'", (store.session,)).fetchone()[0] == 1
    asyncio.run(run())


@pytest.mark.parametrize("failure", ["evaluation", "repair", "followup", "after_commit"])
def test_optional_failures_leave_original_evidence_accepted(store, monkeypatch, failure):
    async def run():
        first = await store.start()
        failure_mock = AsyncMock(side_effect=RuntimeError(f"{failure} failed"))
        if failure == "evaluation":
            monkeypatch.setattr(answers, "evaluate_single_question", failure_mock)
        elif failure == "repair":
            monkeypatch.setattr(answers, "evaluate_single_question", evaluator_scoring.evaluate_single_question)
            monkeypatch.setattr(evaluator_scoring, "repair_transcript", failure_mock)
        elif failure == "followup":
            monkeypatch.setattr(sessions, "generate_live_followup_with_dedup", failure_mock)
        else:
            monkeypatch.setattr(answers, "_process_accepted_answer", failure_mock)
        response = await store.submit(TEXT, "answer", 1, first["question_instance_id"])
        failure_mock.assert_awaited_once()
        assert response["evidence_ack"]["durable"]
        assert store.runtime()["accepted_attempts"]["answer"]["request"]["user_text"] == TEXT
        if failure == "after_commit":
            assert response["action"] == "accepted" and response["processing_state"] == "PENDING"
        result = await sessions.finish_session(store.session, 'a'*40)
        record = terminal_records(store.runtime())[0]
        assert record["raw_answer"] == TEXT and record["outcome"] == "EVALUATED"
        if failure != "followup":
            assert record["evaluation_state"] == "UNAVAILABLE"
            assert result["final_score"] is None
    asyncio.run(run())


def test_same_request_id_cannot_mutate_original_or_question(store):
    async def run():
        first = await store.start()
        await store.submit(TEXT, "answer", 1, first["question_instance_id"])
        before = copy.deepcopy(store.runtime()["accepted_attempts"])
        with pytest.raises(HTTPException) as rejected:
            await store.submit(TEXT + " changed", "answer", 1, first["question_instance_id"])
        assert rejected.value.status_code == 409
        assert store.runtime()["accepted_attempts"] == before
    asyncio.run(run())


def test_accepted_pending_restores_only_for_owner_and_finish_settles_once(store, monkeypatch):
    async def run():
        first = await store.start()
        monkeypatch.setattr(answers, "_process_accepted_answer", AsyncMock(side_effect=RuntimeError("processing failed")))
        response = await store.submit(TEXT, "answer", 1, first["question_instance_id"])
        restored = await routes.get_session(store.session, user())
        pending = restored["pending_accepted_answers"]
        assert len(pending) == 1 and pending[0]["request"]["user_text"] == TEXT
        assert pending[0]["evidence_ack"] == response["evidence_ack"]
        foreign = user(); foreign.id = "00000000-0000-0000-0000-000000000001"
        with pytest.raises(HTTPException) as rejected:
            await routes.get_session(store.session, foreign)
        assert rejected.value.status_code == 404
        finished = await sessions.finish_session(store.session, 'a'*40)
        assert finished["final_score"] is None
        records = terminal_records(store.runtime())
        assert len(records) == 1 and records[0]["outcome"] == "EVALUATED"
        assert records[0]["evaluation_state"] == "UNAVAILABLE"
        assert records[0]["raw_answer"] == TEXT
        assert (await routes.get_session(store.session, user()))["pending_accepted_answers"] == []
        assert await sessions.finish_session(store.session, 'a'*40) == finished
        asked = store.db.execute("SELECT COUNT(*) FROM conversation_messages WHERE session_id=? AND role='assistant' AND turn_number>0", (store.session,)).fetchone()[0]
        assert asked == len(records)
    asyncio.run(run())


def test_old_q1_retry_ack_does_not_replay_stale_q2(store):
    async def run():
        q1 = await store.start()
        q2 = await store.submit(TEXT, "answer-1", 1, q1["question_instance_id"])
        q3 = await store.submit("", "answer-2", 2, q2["question_instance_id"], terminal_outcome="NO_ANSWER")
        retry = await store.submit(TEXT, "answer-1", 1, q1["question_instance_id"])
        assert retry["action"] == "accepted" and retry["processing_state"] == "COMPLETE"
        assert retry["evidence_ack"]["question_instance_id"] == q1["question_instance_id"]
        assert store.runtime()["active_question_id"] == q3["question_instance_id"]
        assert "text" not in retry and "question_instance_id" not in retry
    asyncio.run(run())


def test_termination_cannot_overwrite_pending_accepted_answer(store, monkeypatch):
    async def run():
        q1 = await store.start()
        monkeypatch.setattr(answers, "_process_accepted_answer", AsyncMock(side_effect=TimeoutError()))
        await store.submit(TEXT, "answer", 1, q1["question_instance_id"])
        await routes.terminate_interview(store.session, routes.TerminateRequest(access_token='a'*40, question_instance_id=q1["question_instance_id"], user_text="late abort text"), user())
        record = terminal_records(store.runtime())[0]
        assert record["raw_answer"] == TEXT and record["outcome"] == "EVALUATED"
    asyncio.run(run())


def test_accept_only_survives_termination_failure_then_finishes_once(store, monkeypatch):
    async def run():
        q1 = await store.start()
        req = answers.AnswerRequest(user_text=TEXT, access_token='a'*40, expected_turn=1,
                                   question_instance_id=q1["question_instance_id"], client_request_id="accepted")
        evaluator = answers.evaluate_single_question
        evaluator.reset_mock()
        response = await answers.accept_answer(store.session, req, user())
        assert response["evidence_ack"]["durable"]
        evaluator.assert_not_awaited()
        terminal = routes.TerminateRequest(access_token='a'*40, question_instance_id=q1["question_instance_id"], user_text="changed late text")
        original_terminate = routes._terminate_interview_impl
        monkeypatch.setattr(routes, "_terminate_interview_impl", AsyncMock(side_effect=RuntimeError("finish interrupted")))
        with pytest.raises(RuntimeError):
            await routes.terminate_interview(store.session, terminal, user())
        assert store.runtime()["accepted_attempts"]["accepted"]["request"]["user_text"] == TEXT
        assert not terminal_records(store.runtime())[0].get("outcome")
        monkeypatch.setattr(routes, "_terminate_interview_impl", original_terminate)
        finished = await routes.terminate_interview(store.session, terminal, user())
        assert finished["final_score"] is None
        assert await routes.terminate_interview(store.session, terminal, user()) == finished
        assert len(terminal_records(store.runtime())) == 1
        assert terminal_records(store.runtime())[0]["raw_answer"] == TEXT
        assert terminal_records(store.runtime())[0]["evaluation_state"] == "UNAVAILABLE"
        replay = await store.submit(TEXT, "accepted", 1, q1["question_instance_id"])
        assert replay["evidence_ack"] == response["evidence_ack"]
    asyncio.run(run())


def test_accept_only_retry_keeps_original_and_acknowledges_old_attempt(store):
    async def run():
        q1 = await store.start()
        req = answers.AnswerRequest(user_text=TEXT, access_token='a'*40, expected_turn=1,
                                   question_instance_id=q1["question_instance_id"], client_request_id="abandoned",
                                   terminal_outcome="ABORTED", capture_evidence={"audio_bytes": 42})
        accepted = await answers.accept_answer(store.session, req, user())
        retry = routes.RetryQuestionRequest(access_token='a'*40, client_request_id="retry-question", expected_turn=1,
                                            question_instance_id=q1["question_instance_id"], active_question_instance_id=q1["question_instance_id"],
                                            captured_text="changed late text", capture_evidence={"audio_bytes": 0})
        response = await routes.retry_question(store.session, retry, user())
        assert response["turn"] == 2
        assert await routes.retry_question(store.session, retry, user()) == response
        records = terminal_records(store.runtime())
        assert len(records) == 2 and records[0]["outcome"] == "ABORTED"
        assert records[0]["raw_answer"] == TEXT and records[0]["evidence"]["audio_bytes"] == 42
        replay = await answers.submit_answer(store.session, req, None, BackgroundTasks(), user())
        assert replay == {"action": "accepted", "processing_state": "COMPLETE", "evidence_ack": accepted["evidence_ack"]}
        assert store.runtime()["active_question_id"] == response["question_instance_id"]
        await sessions.finish_session(store.session, 'a'*40)
        assert len(terminal_records(store.runtime())) == 2
        assert all(item.get("outcome") for item in terminal_records(store.runtime()))
    asyncio.run(run())


def test_late_legacy_runtime_tasks_cannot_replace_accepted_original(store, monkeypatch):
    async def run():
        q1 = await store.start()
        req = answers.AnswerRequest(user_text=TEXT, access_token='a'*40, expected_turn=1,
                                   question_instance_id=q1["question_instance_id"], client_request_id="accepted")
        await answers.accept_answer(store.session, req, user())
        before = copy.deepcopy(store.runtime())
        original_transaction = store.transaction
        in_transaction = False
        @asynccontextmanager
        async def observed_transaction():
            nonlocal in_transaction
            async with original_transaction():
                in_transaction = True
                try:
                    yield
                finally:
                    in_transaction = False
        original_fetchrow = store.fetchrow
        async def locked_read(sql, *args):
            if "runtime_state FROM interview_sessions" in sql:
                assert in_transaction, "Runtime updates require the session transaction"
            return await original_fetchrow(sql, *args)
        monkeypatch.setattr(store, "transaction", observed_transaction)
        monkeypatch.setattr(store, "fetchrow", locked_read)
        await answers._record_unevaluated_turn(store.session, 1, "A question?", "", "no_answer", question_instance_id=q1["question_instance_id"])
        await answers._mark_evaluation_unavailable(store.session, q1["question_instance_id"])
        assert store.runtime() == before
    asyncio.run(run())


def test_legacy_start_uses_serialized_start_transaction(store):
    async def run():
        store.db.execute("UPDATE interview_sessions SET runtime_state='{}' WHERE id=?", (store.session,))
        req = answers.AnswerRequest(user_text="[START_INTERVIEW]", access_token='a'*40)
        response = await answers.submit_answer(store.session, req, None, BackgroundTasks(), user())
        assert response["turn"] == 1 and response["question_instance_id"]
        assert store.runtime()["terminal_contract_version"] == 1
        with pytest.raises(HTTPException) as rejected:
            await answers.submit_answer(store.session, req, None, BackgroundTasks(), user())
        assert rejected.value.status_code == 409
    asyncio.run(run())
