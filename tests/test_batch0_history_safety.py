"""Exercise real history SQL and user flows against isolated in-memory storage.

SQLite runs the SELECT/CTE/window/pagination SQL; the adapter translates only
PostgreSQL casts, bind placeholders, timestamps and NULL (unlimited) LIMIT.
External providers and unrelated dashboard services are stubbed.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
import re
import sqlite3
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.dependencies import UserProfile
from app.database.readiness import REQUIRED_SCHEMA
from app.routers import dashboard, reports, interviews_assistance as assistance, interviews_answer as answers
from app.services import interviewer  # Load the barrel before the session module.
from app.services import interviewer_session, analytics, plan_access, quota
from app.services.history_retention import enforce_history_retention

OWNER = str(UUID(int=1000, version=4))
OTHER = str(UUID(int=2000, version=4))
NOW = datetime.now(timezone.utc)


def user(plan="pro", **kwargs):
    return UserProfile(id=OWNER, email="", plan=plan,
                       owned_plans=["free", plan], **kwargs)


class StoredHistory:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.create_function("now", 0, lambda: NOW.isoformat())
        self.db.create_function("clock_timestamp", 0, lambda: datetime.now(timezone.utc).isoformat())
        self.db.create_function("random_uuid", 0, lambda: str(uuid4()))
        self.queries = []
        for table, groups in REQUIRED_SCHEMA.items():
            columns = {name: ("INTEGER" if kind in {"integer", "boolean"} else "REAL" if kind == "numeric" else "TEXT")
                       for kind, names in groups.items() for name in names.split()}
            if table == "profiles":
                columns.update(onboarding_completed="INTEGER", prep_goal="TEXT", updated_at="TEXT", org_student="INTEGER")
            if table == "interview_sessions":
                columns["proctoring_mode"] = "TEXT"
            if table == "user_plan_entitlements":
                columns.update(source_order_id="TEXT", updated_at="TEXT")
            if table == "interview_assistance_event":
                columns.update(id="TEXT DEFAULT (random_uuid())", requested_at="TEXT DEFAULT (now())", invalidated="INTEGER NOT NULL DEFAULT 0", content_hash="TEXT")
            if table == "interview_audio_turns":
                columns["stt_confidence"] = "REAL"
            self.db.execute(f"CREATE TABLE {table} ({', '.join(f'{n} {t}' for n,t in columns.items())})")
        self.db.execute("CREATE UNIQUE INDEX entitlements_unique ON user_plan_entitlements(user_id, plan)")
        self.db.execute("CREATE UNIQUE INDEX assistance_unique ON interview_assistance_event(session_id, question_instance_id, assistance_type, assistance_level) WHERE question_instance_id IS NOT NULL")
        self.db.execute("CREATE TABLE user_plan_interviews (user_id TEXT, plan TEXT, total_interviews INT, current_cycle_start TEXT)")
        self.db.execute("CREATE TABLE support_messages (user_id TEXT, content TEXT, created_at TEXT)")
        self.db.execute("CREATE TABLE reports (session_id TEXT, payload TEXT)")
        self.insert("profiles", id=OWNER, plan="career", email="", full_name="Student")
        self.insert("support_messages", user_id=OWNER, content="Preserve this support request", created_at="2020-01-01")
        self.ids = []
        for index in range(20):
            session_id = str(UUID(int=index+1, version=4))
            self.ids.append(session_id)
            self.add_session(session_id, NOW - timedelta(days=index))
            self.insert("question_evaluations", id=str(uuid4()), session_id=session_id, turn_number=1,
                        raw_answer=f"Historical answer {index}", score=7, rubric_category="communication")
            if index > 0:
                self.insert("conversation_messages", session_id=session_id, role="user", content=f"Answer {index}", turn_number=1)
                self.insert("reports", session_id=session_id, payload=f"Saved report {index}")
                self.insert("interview_audio_turns", session_id=session_id, turn_number=1, audio_object_path=f"saved/{index}.webm")
                self.insert("interview_assistance_event", id=str(uuid4()), session_id=session_id, user_id=OWNER,
                    turn_number=1, assistance_type="hint", assistance_level=1, requested_at=NOW.isoformat())
        self.add_session(str(UUID(int=999, version=4)), NOW + timedelta(days=1), user_id=OTHER)

    def insert(self, table, **values):
        self.db.execute(f"INSERT INTO {table} ({','.join(values)}) VALUES ({','.join('?' for _ in values)})",
                        list(values.values()))

    def add_session(self, session_id, created_at, state="FINISHED", user_id=OWNER):
        self.insert("interview_sessions", id=session_id, user_id=user_id, plan="free", state=state,
                    access_token="token", created_at=created_at.isoformat(),
                    finished_at=created_at.isoformat() if state == "FINISHED" else None,
                    final_score=70, total_turns=0, duration_actual_seconds=0,
                    runtime_state="{}", question_plan="[]", resume_summary="{}",
                    rubric_scores="{}", proctoring_violations="[]", proctoring_mode="practice")

    def run(self, sql, args):
        self.queries.append(sql)
        # The unrelated skills table is empty; SQLite lacks DISTINCT ON.
        sql = sql.replace("DISTINCT ON (category)", "DISTINCT").replace(" FOR UPDATE", "")
        sql = sql.replace("now() - interval '1 minute'", "datetime(now(), '-1 minute')")
        sql = re.sub(r"::(?:uuid|boolean)", "", sql)
        sql = re.sub(r"LIMIT (\$\d+)", r"LIMIT COALESCE(\1, -1)", sql)
        parameters = []
        def bind(match):
            value = args[int(match[1])-1]
            if isinstance(value, (list, dict)):
                value = json.dumps(value)
            if isinstance(value, (datetime, UUID)):
                value = str(value) if isinstance(value, UUID) else value.isoformat()
            parameters.append(value)
            return "?"
        sql = re.sub(r"\$(\d+)", bind, sql)
        return self.db.execute(sql, parameters)

    async def fetch(self, sql, *args):
        rows = [dict(row) for row in self.run(sql, args).fetchall()]
        for row in rows:
            for name, value in row.items():
                if name.endswith("_at") and value:
                    row[name] = datetime.fromisoformat(value)
        return rows

    async def fetchrow(self, sql, *args):
        rows = await self.fetch(sql, *args)
        return rows[0] if rows else None

    async def fetchval(self, sql, *args):
        row = await self.fetchrow(sql, *args)
        return next(iter(row.values())) if row else None

    async def execute(self, sql, *args):
        return f"UPDATE {self.run(sql, args).rowcount}"

    @asynccontextmanager
    async def connection(self):
        yield self

    @asynccontextmanager
    async def transaction(self):
        self.db.execute("SAVEPOINT history_operation")
        try:
            yield
        except BaseException:
            self.db.execute("ROLLBACK TO history_operation")
            raise
        finally:
            self.db.execute("RELEASE history_operation")

    def snapshot(self):
        return {table: [tuple(row) for row in self.db.execute(f"SELECT * FROM {table}")]
                for table in ("interview_sessions", "question_evaluations", "interview_assistance_event",
                              "conversation_messages", "reports", "interview_audio_turns", "support_messages")}


@pytest.fixture
def history(monkeypatch):
    store = StoredHistory()
    for module in (dashboard, reports, assistance, answers, interviewer_session, quota):
        monkeypatch.setattr(module, "DatabaseConnection", store.connection)
    monkeypatch.setattr(dashboard, "_backfill_with_cooldown", AsyncMock())
    monkeypatch.setattr(dashboard, "get_plan_expiry_map", AsyncMock(return_value={"pro": None, "career": None}))
    monkeypatch.setattr(dashboard, "get_launch_offer_state", AsyncMock(return_value=None))
    monkeypatch.setattr(dashboard, "get_referral_summary", AsyncMock(return_value={}))
    monkeypatch.setattr(dashboard, "get_public_growth_metrics", AsyncMock(return_value={}))
    monkeypatch.setattr(dashboard, "get_usage_stats", AsyncMock(return_value={}))
    yield store
    store.db.close()


@pytest.mark.parametrize("plan,expected", [("free", 1), ("pro", 5), ("career", 15)])
def test_dashboard_and_history_preserve_records_and_enforce_limits(history, plan, expected):
    before = history.snapshot()
    preview = asyncio.run(dashboard.get_dashboard(user(plan)))
    listing = asyncio.run(dashboard.get_session_history(user(plan), limit=100, offset=0))
    assert len(preview["recent_sessions"]) == min(expected, 10)
    if plan == "free":
        assert listing["locked"] and listing["sessions"] == []
        assert listing["current_feedback_session_id"] == history.ids[0]
    else:
        assert [s["id"] for s in listing["sessions"]] == history.ids[:expected]
        assert listing["total"] == expected
    assert history.snapshot() == before
    assert not any("DELETE" in sql.upper() for sql in history.queries)


def test_pagination_cannot_escape_plan_window(history):
    first = asyncio.run(dashboard.get_session_history(user(), limit=2, offset=0))
    last = asyncio.run(dashboard.get_session_history(user(), limit=2, offset=4))
    outside = asyncio.run(dashboard.get_session_history(user(), limit=2, offset=5))
    assert [s["id"] for s in first["sessions"]] == history.ids[:2]
    assert [s["id"] for s in last["sessions"]] == history.ids[4:5]
    assert outside["sessions"] == []


def test_admin_can_access_preserved_history_without_plan_cap(history):
    listing = asyncio.run(dashboard.get_session_history(user(premium_override=True), limit=100, offset=0))
    assert len(listing["sessions"]) == 20 and listing["total"] == 20


def test_order_is_deterministic_for_tied_timestamps(history):
    history.db.execute("UPDATE interview_sessions SET created_at=?, finished_at=? WHERE user_id=?",
                       (NOW.isoformat(), NOW.isoformat(), OWNER))
    listing = asyncio.run(dashboard.get_session_history(user(), limit=100, offset=0))
    assert [s["id"] for s in listing["sessions"]] == sorted(history.ids, reverse=True)[:5]


def test_downgrade_preserves_and_upgrade_reveals_history(history, monkeypatch):
    # Run actual plan-state synchronization; stub only payment/offer backfills
    # and the unrelated purchase-stats summary write.
    monkeypatch.setattr(plan_access, "ensure_plan_entitlements", AsyncMock())
    monkeypatch.setattr(plan_access, "sync_user_purchase_stats", AsyncMock())
    monkeypatch.setattr(plan_access, "get_launch_offer_state", AsyncMock(return_value={"active_plans": [], "expired_plans": []}))
    history.insert("user_plan_entitlements", user_id=OWNER, plan="career", status="inactive",
                   activated_at=(NOW-timedelta(days=30)).isoformat(), expires_at=(NOW+timedelta(days=5)).isoformat())
    before = history.snapshot()
    state = asyncio.run(plan_access.sync_profile_plan_state(history, OWNER, "career"))
    downgraded = UserProfile(id=OWNER, email="", plan=state["selected_plan"], owned_plans=state["owned_plans"])
    assert downgraded.effective_plan == "free"
    assert asyncio.run(dashboard.get_session_history(downgraded, limit=100, offset=0))["locked"]
    history.db.execute("UPDATE user_plan_entitlements SET status='active'")
    state = asyncio.run(plan_access.sync_profile_plan_state(history, OWNER, "career"))
    upgraded = UserProfile(id=OWNER, email="", plan=state["selected_plan"], owned_plans=state["owned_plans"])
    assert len(asyncio.run(dashboard.get_session_history(upgraded, limit=100, offset=0))["sessions"]) == 15
    assert history.snapshot() == before


@pytest.mark.parametrize("endpoint", [reports.get_report, reports.download_pdf, reports.create_share_link])
def test_direct_hidden_owner_reports_locked_and_non_owner_not_found(history, endpoint):
    for session_id, expected_status in ((history.ids[6], 403), (str(UUID(int=999, version=4)), 404), (str(uuid4()), 404)):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(endpoint(session_id, user()))
        assert exc.value.status_code == expected_status
        if expected_status == 403:
            assert exc.value.detail["error"] == "session_history_locked"


def test_visible_owner_report_loads(history):
    # No evaluations on the latest finished session, so provider-free report
    # rendering still exercises the normal owner/window/query/summary path.
    history.db.execute("DELETE FROM question_evaluations WHERE session_id=?", (history.ids[0],))
    result = asyncio.run(reports.get_report(history.ids[0], user("free")))
    assert result["session"]["id"] == history.ids[0]


def test_finishing_interview_never_prunes_older_sessions_or_answers(history, monkeypatch):
    active = str(uuid4())
    history.add_session(active, NOW, state="ACTIVE")
    before = history.snapshot()
    monkeypatch.setattr(interviewer_session, "_ensure_pending_evaluations", AsyncMock())
    monkeypatch.setattr(analytics, "sync_session_skill_scores", AsyncMock())
    monkeypatch.setattr(plan_access, "sync_profile_plan_state", AsyncMock(return_value={"highest_owned_plan": "pro"}))
    result = asyncio.run(interviewer_session.finish_session(active, "token", duration_actual=120))
    assert "error" not in result
    after = history.snapshot()
    assert after["interview_sessions"][:-1] == before["interview_sessions"][:-1]
    for table in before.keys() - {"interview_sessions"}:
        assert after[table] == before[table]
    assert history.db.execute("SELECT state FROM interview_sessions WHERE id=?", (active,)).fetchone()[0] == "FINISHED"
    assert not any("DELETE" in sql.upper() for sql in history.queries)


def test_stale_retention_call_is_harmless(history):
    before = history.snapshot()
    for plan in ("free", "pro", "career", None):
        assert asyncio.run(enforce_history_retention(history, OWNER, plan)) == 0
    assert history.snapshot() == before and not history.queries


def test_quota_reset_never_deletes_old_support_messages(history, monkeypatch):
    history.db.execute("UPDATE profiles SET period_start='2020-01-01', interviews_used_this_period=3")
    # The actual counter reset executes; the stored support request survives.
    asyncio.run(quota.enforce_quota(user("free")))
    assert history.db.execute("SELECT content FROM support_messages").fetchone()[0] == "Preserve this support request"
    assert not any("DELETE" in sql.upper() for sql in history.queries)


def test_assistance_summary_loads_and_hidden_history_is_locked(history):
    history.insert("interview_assistance_event", id=str(uuid4()), session_id=history.ids[0],
                   turn_number=1, assistance_type="hint", assistance_level=1,
                   question_family="intro", requested_at=NOW.isoformat())
    summary = asyncio.run(assistance.get_assistance_summary(history.ids[0], "token", user()))
    assert summary["summary"][1][0]["assistance_type"] == "hint"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(assistance.get_assistance_summary(history.ids[6], "token", user()))
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        asyncio.run(assistance.get_assistance_summary(str(UUID(int=999, version=4)), "token", user()))
    assert exc.value.status_code == 404


def test_guided_hint_guidance_retry_view_and_records_still_work(history, monkeypatch):
    active, instance = str(uuid4()), str(uuid4())
    history.add_session(active, NOW, state="ACTIVE")
    history.db.execute("UPDATE interview_sessions SET total_turns=1,runtime_state=? WHERE id=?",
                       (json.dumps({"active_question_id": instance, "question_records": {instance: {"turn":1,"question_text":"Tell me about your project"}}}), active))
    history.insert("interview_assistance_policy", session_id=active, enabled=True,
                   hints_enabled=True, answer_guidance_enabled=True)
    hint_provider = AsyncMock(return_value={"content": "Use a concrete example."})
    guidance_provider = AsyncMock(return_value={"content": "Explain your action and result."})
    monkeypatch.setattr(assistance, "generate_hint", hint_provider)
    monkeypatch.setattr(assistance, "generate_answer_guidance", guidance_provider)
    hint_req = assistance.AssistanceHintRequest(client_request_id="hint-1", level=1,
        question_text="Tell me about your project", question_instance_id=instance, access_token="token")
    first = asyncio.run(assistance.request_hint(active, hint_req, user()))
    retry = asyncio.run(assistance.request_hint(active, hint_req, user()))
    assert first == retry and first["content"] == "Use a concrete example."
    hint_provider.assert_awaited_once()
    guidance_req = assistance.AssistanceGuidanceRequest(client_request_id="guidance-1",
        question_text=hint_req.question_text, question_instance_id=instance, access_token="token")
    guidance = asyncio.run(assistance.request_answer_guidance(active, guidance_req, user()))
    again = asyncio.run(assistance.request_answer_guidance(active, guidance_req, user()))
    assert all(guidance[key] == again[key] for key in ("event_id", "content", "turn_number", "question_family"))
    assert guidance["content"] == "Explain your action and result."
    guidance_provider.assert_awaited_once()
    for event in (first, guidance):
        asyncio.run(assistance.mark_event_viewed(active, event["event_id"],
                    assistance.AssistanceViewedRequest(access_token="token"), user()))
    summary = asyncio.run(assistance.get_assistance_summary(active, "token", user()))
    assert len(summary["summary"][1]) == 2
    assert all(event["viewed_at"] is not None for event in summary["summary"][1])
    rows = history.db.execute("SELECT user_id, question_instance_id, assistance_type FROM interview_assistance_event WHERE session_id=?", (active,)).fetchall()
    assert len(rows) == 2 and all(row[0] == OWNER and row[1] == instance for row in rows)


@pytest.mark.parametrize("event_types,view_offset,expected", [
    (["hint"], -1, "hint_assisted"),
    (["hint", "answer_guidance"], -1, "answer_guided"),
    (["answer_guidance"], 0, "independent"),
    (["hint"], 1, "independent"),
])
def test_actual_answer_path_preserves_assistance_attribution(history, monkeypatch, event_types, view_offset, expected):
    active, instance = str(uuid4()), str(uuid4())
    history.add_session(active, NOW, state="ACTIVE")
    for kind in event_types:
        history.insert("interview_assistance_event", id=str(uuid4()), session_id=active,
            question_instance_id=instance, assistance_type=kind, assistance_level=1,
            user_id=OWNER, generated_content="A concrete example", model_provider="test",
            generated_at=(NOW+timedelta(seconds=view_offset-1)).isoformat(),
            viewed_at=(NOW+timedelta(seconds=view_offset)).isoformat())

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW

    monkeypatch.setattr(answers, "datetime", FixedDatetime)
    monkeypatch.setattr(answers, "rate_limit_session", AsyncMock())
    monkeypatch.setattr(answers, "_get_cached_client_response", AsyncMock(return_value=None))
    monkeypatch.setattr(answers, "_cache_client_response", AsyncMock())
    monkeypatch.setattr(answers, "process_answer", AsyncMock(return_value={
        "action": "continue", "question_for_eval": "Describe your project",
        "turn_for_eval": 1, "question_instance_id_for_eval": instance,
    }))
    evaluator = AsyncMock()
    monkeypatch.setattr(answers, "_evaluate_and_store", evaluator)
    tasks = BackgroundTasks()

    async def run():
        await answers.submit_answer(active, answers.AnswerRequest(
            user_text="I built a Python application and measured its performance with realistic tests.",
            access_token="a"*40, client_request_id="answer-1"), None, tasks, user())
        await tasks()
    asyncio.run(run())
    assert evaluator.await_args.kwargs["assistance_provenance"] == expected
    assert evaluator.await_args.kwargs["question_instance_id"] == instance
    used = history.db.execute("SELECT used_before_answer FROM interview_assistance_event WHERE session_id=?", (active,)).fetchall()
    assert all(bool(row[0]) == (view_offset < 0) for row in used)
