"""Offline setup-to-restore plan persistence through the real route and SQL service."""

import asyncio
from datetime import timedelta
from io import BytesIO
import json
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import Request, UploadFile

from app.config import PLAN_CONFIG
from app.routers import interviews_session as routes
from test_batch0_history_safety import NOW, OWNER, user
from test_batch2_interview_stt import store  # Real SQL adapter; no live services.


@pytest.fixture
def setup_store(store, monkeypatch):
    # The history fixture deliberately omits INSERT defaults. Supply the real
    # session defaults (001_initial_schema.sql) without replacing service SQL.
    store.db.execute("ALTER TABLE interview_sessions ADD COLUMN resume_file_path TEXT")
    store.db.execute("ALTER TABLE interview_sessions ADD COLUMN resume_fingerprint TEXT")
    columns = list(store.db.execute("PRAGMA table_info(interview_sessions)"))
    defaults = {"id": "(random_uuid())", "created_at": "(now())",
                "state": "'ACTIVE'", "total_turns": "0"}
    declarations = [f'{row[1]} {row[2]}' +
                    (f' DEFAULT {defaults[row[1]]}' if row[1] in defaults else "")
                    for row in columns]
    store.db.execute(f"CREATE TABLE setup_sessions ({', '.join(declarations)})")
    store.db.execute("INSERT INTO setup_sessions SELECT * FROM interview_sessions")
    store.db.execute("DROP TABLE interview_sessions")
    store.db.execute("ALTER TABLE setup_sessions RENAME TO interview_sessions")
    store.db.execute("ALTER TABLE user_plan_interviews ADD COLUMN last_interview_at TEXT")
    store.db.execute("ALTER TABLE user_plan_interviews ADD COLUMN current_cycle_end TEXT")
    store.db.execute("CREATE UNIQUE INDEX setup_usage_identity ON user_plan_interviews(user_id, plan)")
    store.db.execute("CREATE UNIQUE INDEX setup_policy_identity ON interview_assistance_policy(session_id)")
    store.db.execute("CREATE TABLE product_funnel_events (event_name TEXT, user_id TEXT, metadata TEXT)")
    store.db.execute("UPDATE profiles SET interviews_used_this_period=0 WHERE id=?", (OWNER,))
    store.insert("user_plan_entitlements", user_id=OWNER, plan="career", status="active",
                 activated_at=(NOW-timedelta(days=1)).isoformat(),
                 expires_at=(NOW+timedelta(days=29)).isoformat())
    # Only unrelated network/expensive boundaries are stubbed. Plan access,
    # creation, usage/funnel SQL, setup response and restore remain authentic.
    monkeypatch.setattr(routes, "rate_limit_user", AsyncMock())
    monkeypatch.setattr(routes, "enforce_quota", AsyncMock())
    monkeypatch.setattr(routes, "validate_resume_upload", Mock())
    monkeypatch.setattr(routes, "extract_text_from_resume", Mock(return_value="A student who built and tested a Python application."))
    monkeypatch.setattr(routes, "parse_resume_structured", AsyncMock(return_value={"candidate_name": "Test Student", "skills": ["Python"]}))
    monkeypatch.setattr(routes, "logger", Mock())
    return store


@pytest.mark.parametrize("requested_plan", ["free", "career"])
def test_career_entitled_normal_user_preserves_submitted_plan_through_setup_and_restore(setup_store, requested_plan):
    identity = user("career")
    assert identity.effective_plan == "career"
    assert not identity.is_admin and not identity.premium_override and not identity.is_org_student
    before = setup_store.snapshot()

    async def run():
        result = await routes.setup_interview(
            Request({"type": "http", "headers": []}),
            resume=UploadFile(filename="resume.pdf", file=BytesIO(b"%PDF-test-resume")),
            plan=requested_plan, difficulty_mode="auto", duration=600,
            proctoring_mode="practice", guided_assistance="true", user=identity,
        )
        session_id = result["session_id"]
        assert result["plan"] == requested_plan
        assert result["max_turns"] == PLAN_CONFIG[requested_plan]["max_turns"]
        assert result["candidate_name"] == "Test Student" and result["assistance_enabled"] is True
        persisted = setup_store.db.execute("SELECT plan, user_id, access_token, resume_fingerprint FROM interview_sessions WHERE id=?", (session_id,)).fetchone()
        assert tuple(persisted) == (requested_plan, OWNER, result["access_token"], result["resume_fingerprint"])
        usage = setup_store.db.execute("SELECT metadata FROM usage_events WHERE event_type='interview_started'").fetchall()
        assert len(usage) == 1
        assert json.loads(usage[0][0])["plan"] == requested_plan
        assert json.loads(usage[0][0])["session_id"] == session_id
        counts = setup_store.db.execute("SELECT plan, total_interviews FROM user_plan_interviews WHERE user_id=?", (OWNER,)).fetchall()
        assert [tuple(row) for row in counts] == [(requested_plan, 1)]
        funnel = setup_store.db.execute("SELECT event_name, metadata FROM product_funnel_events").fetchall()
        assert [row[0] for row in funnel] == ["cta clicked", "resume uploaded", "mock started"]
        assert all(json.loads(row[1])["plan"] == requested_plan for row in funnel)
        completed_log = [call.kwargs for call in routes.logger.info.call_args_list if call.args == ("interview_setup_complete",)]
        assert len(completed_log) == 1 and completed_log[0]["plan"] == requested_plan
        assert completed_log[0]["session_id"] == session_id
        routes.logger.warning.assert_not_called()
        restored = await routes.get_session(session_id, identity)
        assert restored["plan"] == requested_plan and restored["max_turns"] == result["max_turns"]
        assert restored["access_token"] == result["access_token"]
        assert restored["state"] == "ACTIVE" and restored["turn"] == 0
        assert restored["candidate_name"] == "Test Student" and restored["assistance_enabled"]
        assert setup_store.db.execute("SELECT plan FROM profiles WHERE id=?", (OWNER,)).fetchone()[0] == "career"
        # Creating a lower-tier session must not rewrite historical sessions.
        after = setup_store.snapshot()
        for table, rows in before.items():
            assert all(row in after[table] for row in rows), table

    asyncio.run(run())
