"""Real lifecycle services against a transactional in-memory DB test double.

SQL migrations and real provider/DB behavior require staging verification.
"""
import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import datetime, timezone
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import interviewer_session as service
from app.services import evaluator_scoring
from app.services.interview_orchestrator import build_blueprint, InterviewOrchestrator
from app.services.interviewer_constants import NO_ANSWER_TOKEN
from app.routers import reports

SID = "11111111-1111-4111-8111-111111111111"
ANSWER = "I implemented the cache because reads were repeated. I compared latency before and after and tested invalidation. The tests passed."


class Database:
    def __init__(self):
        profile = {"skills": ["Python", "Redis"], "target_role": "Backend Engineer"}
        self.session = {"id": SID, "user_id": "owner", "plan": "pro", "state": "ACTIVE",
            "difficulty_mode": "auto", "resume_text": "Python Redis", "resume_summary": json.dumps(profile),
            "runtime_state": {"orchestrator_v2": InterviewOrchestrator.create(build_blueprint(profile), profile)},
            "total_turns": 0, "question_plan": [], "duration_actual_seconds": None,
            "final_score": None, "rubric_scores": {}, "strengths": [], "weaknesses": [],
            "created_at": datetime.now(timezone.utc), "finished_at": None,
            "proctoring_mode": "practice", "proctoring_violations": []}
        self.messages = []
        self.receipts = {}
        self.lock = asyncio.Lock()

    @asynccontextmanager
    async def transaction(self):
        async with self.lock:
            original = deepcopy((self.session, self.messages, self.receipts))
            try:
                yield
            except BaseException:
                self.session, self.messages, self.receipts = original
                raise

    async def fetchrow(self, sql, *args):
        if "interview_answer_receipts" in sql:
            return self.receipts.get(args[1])
        if "FROM interview_sessions" in sql:
            return deepcopy(self.session)
        if "FROM profiles" in sql:
            return {"plan": "pro", "email": "test@example.invalid"}
        if "interview_evaluation_jobs" in sql:
            return []
        raise AssertionError(sql)

    async def fetch(self, sql, *args):
        if "conversation_messages" in sql:
            return deepcopy(self.messages)
        if "question_evaluations" in sql or "interview_audio_turns" in sql or "interview_evaluation_jobs" in sql:
            return []
        raise AssertionError(sql)

    async def fetchval(self, sql, *args):
        return SID

    async def execute(self, sql, *args):
        if "INSERT INTO conversation_messages" in sql:
            self.messages.append({"role": "assistant" if "'assistant'" in sql else "user", "content": args[1], "turn_number": args[2]})
        elif "INSERT INTO interview_answer_receipts" in sql:
            self.receipts[args[1]] = {"fingerprint": args[2], "response": args[3]}
        elif "UPDATE interview_sessions SET total_turns" in sql:
            self.session.update(total_turns=args[1], runtime_state=json.loads(args[2]), question_plan=json.loads(args[3]))
        elif "SET state = 'FINISHED'" in sql:
            self.session.update(state="FINISHED", final_score=args[1], rubric_scores=json.loads(args[2]), strengths=args[3], weaknesses=args[4], duration_actual_seconds=args[5], runtime_state=json.loads(args[6]), finished_at=datetime.now(timezone.utc))
        elif "INSERT INTO usage_events" not in sql:
            raise AssertionError(sql)


def install(monkeypatch, db):
    @asynccontextmanager
    async def connect():
        yield db
    monkeypatch.setattr(service, "DatabaseConnection", connect)
    monkeypatch.setattr(reports, "DatabaseConnection", connect)


def test_transactional_answer_reload_finish_and_report(monkeypatch):
    from app.services import analytics, history_retention, plan_access
    db = Database()
    install(monkeypatch, db)
    monkeypatch.setattr(service, "_ensure_pending_evaluations", AsyncMock())
    monkeypatch.setattr(analytics, "sync_session_skill_scores", AsyncMock())
    monkeypatch.setattr(history_retention, "enforce_history_retention", AsyncMock())
    monkeypatch.setattr(plan_access, "sync_profile_plan_state", AsyncMock(return_value={"highest_owned_plan": "pro"}))

    async def run():
        first = await service.process_answer(SID, "[START_INTERVIEW]", "token", "start", 0, user_id="owner")
        assert first["action"] == "continue"
        results = await asyncio.gather(*[service.process_answer(SID, ANSWER, "token", "answer-1", 1, user_id="owner") for _ in range(4)])
        assert all(r == results[0] for r in results)
        assert len(db.session["runtime_state"]["orchestrator_v2"]["evidence"]) == 1
        turn = results[0]["turn"]
        for _ in range(40):
            response = await service.process_answer(SID, ANSWER, "token", f"answer-{turn}", turn, user_id="owner")
            if response["action"] == "finish":
                break
            turn = response["turn"]
        assert response["action"] == "finish"
        final = await service.finish_session(SID, "token", 800)
        assert final["evidence_report"]["questions"][-1]["type"] == "CLOSING"
        assert final["evidence_report"]["numeric_evaluation_status"] == "unavailable"
        user = SimpleNamespace(id="owner", premium_override=True, effective_plan="career", plan="career")
        report = await reports.get_report(SID, user)
        assert report["evidence_report"] == final["evidence_report"]
        assert len(report["evidence_report"]["evidence"]) == len([m for m in db.messages if m["role"] == "user"])
        assert await service.finish_session(SID, "token") == final
    asyncio.run(run())


def test_silence_retries_once_then_skips_without_evaluation(monkeypatch):
    db = Database()
    install(monkeypatch, db)
    async def run():
        first = await service.process_answer(SID, "[START_INTERVIEW]", "token")
        retry = await service.process_answer(SID, NO_ANSWER_TOKEN, "token")
        assert retry["turn"] == first["turn"] and retry["question_for_eval"] is None
        skipped = await service.process_answer(SID, NO_ANSWER_TOKEN, "token")
        assert skipped["turn"] == first["turn"] + 1 and skipped["question_for_eval"] is None
        assert not db.session["runtime_state"]["orchestrator_v2"]["evidence"]
    asyncio.run(run())


@pytest.mark.parametrize("expire", [False, True])
def test_empty_finish_and_expired_start_do_not_reopen_question(monkeypatch, expire):
    from datetime import timedelta
    db = Database()
    install(monkeypatch, db)
    async def run():
        await service.process_answer(SID, "[START_INTERVIEW]", "token")
        if expire:
            db.session["runtime_state"]["orchestrator_v2"]["started_at"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        response = await service.process_answer(SID, "[START_INTERVIEW]" if expire else "", "token", end_interview=not expire)
        assert response["action"] == "finish"
        assert not db.session["runtime_state"]["orchestrator_v2"]["evidence"]
    asyncio.run(run())


def test_wording_failure_keeps_curated_probe(monkeypatch):
    from app.services import interview_v2_session
    db = Database()
    install(monkeypatch, db)
    def fail(*args):
        raise RuntimeError("wording unavailable")
    monkeypatch.setattr(interview_v2_session, "_build_answer_led_followup", fail)
    async def run():
        await service.process_answer(SID, "[START_INTERVIEW]", "token")
        await service.process_answer(SID, ANSWER, "token")
        response = await service.process_answer(SID, "I implemented Redis caching.", "token")
        assert "stale data" in response["text"]
        assert response["progress"]["question_type"] == "FOLLOWUP"
    asyncio.run(run())


def test_free_practice_history_obeys_existing_history_limit(monkeypatch):
    from app.routers import interview_practice
    calls = []
    class HistoryDatabase:
        async def fetch(self, sql, *args):
            calls.append((sql, args))
            return []
    @asynccontextmanager
    async def connect():
        yield HistoryDatabase()
    monkeypatch.setattr(interview_practice, "DatabaseConnection", connect)
    user = SimpleNamespace(id="owner", effective_plan="free", premium_override=False)
    result = asyncio.run(interview_practice.practice_progress(user))
    assert calls[0][1] == ("owner", 1)
    assert calls[1][1] == ("owner", [])
    assert result["sessions"] == []


def test_late_evaluation_is_persisted_for_completed_report_recovery(monkeypatch):
    from app.routers import interviews_answer
    class EvaluationDatabase:
        execute = AsyncMock()
        async def fetchrow(self, sql, *args):
            if "question_evaluations" in sql:
                return None
            return {"plan": "pro", "resume_summary": "{}", "question_plan": [],
                    "runtime_state": {"orchestrator_v2": {"version": 2}}}
        async def fetchval(self, sql, *args):
            assert "FOR NO KEY UPDATE" in sql
            return "FINISHED"
        @asynccontextmanager
        async def transaction(self):
            yield
    db = EvaluationDatabase()
    @asynccontextmanager
    async def connect():
        yield db
    monkeypatch.setattr(interviews_answer, "DatabaseConnection", connect)
    monkeypatch.setattr(interviews_answer, "evaluate_single_question", AsyncMock(return_value={"score": 8}))
    asyncio.run(interviews_answer._evaluate_and_store(SID, 1, "What did you build?", ANSWER))
    assert db.execute.await_count == 2
    assert "INSERT INTO question_evaluations" in db.execute.call_args_list[0].args[0]


@pytest.mark.parametrize("plan", ["free", "pro", "career"])
def test_provider_failure_is_unavailable_without_score(monkeypatch, plan):
    monkeypatch.setattr(evaluator_scoring, "call_llm_json", AsyncMock(side_effect=RuntimeError("offline")))
    result = asyncio.run(evaluator_scoring._evaluate_question_core("What did you build?", ANSWER, ANSWER, "{}", "ownership", plan, strict_evidence=True))
    assert result == {"evaluation_status": "unavailable"}


@pytest.mark.parametrize("result", [{}, {"score": 0}, {"specificity_score": float("nan")}])
def test_malformed_provider_json_is_not_a_zero_score(monkeypatch, result):
    monkeypatch.setattr(evaluator_scoring, "call_llm_json", AsyncMock(return_value=result))
    evaluated = asyncio.run(evaluator_scoring._evaluate_question_core("What did you build?", ANSWER, ANSWER, "{}", "ownership", "pro", strict_evidence=True))
    assert evaluated == {"evaluation_status": "unavailable"}
