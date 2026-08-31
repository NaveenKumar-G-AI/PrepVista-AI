"""Contracts for previously unreachable admin actions and report scheduling."""

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.routers import admin
from app.routers import org_college_analytics
from app.routers.org_college_analytics import ScheduleReportRequest
from app.services.launch_offer import (
    approve_launch_offer_grant,
    reject_launch_offer_grant,
)
from app.services.report_schedules import next_report_run


ROOT = Path(__file__).resolve().parents[1]


class _LaunchOfferConnection:
    def __init__(self):
        self.executions = []
        self.grant = {
            "id": 7,
            "user_id": "user-7",
            "email": "early@example.com",
            "status": "pending",
            "plan": None,
            "slot_number": None,
            "approved_at": None,
            "reviewed_at": None,
            "expires_at": None,
        }

    async def fetchrow(self, query, *args):
        if "FROM launch_offer_settings" in query:
            return {"max_approved_slots": 100}
        if "FROM launch_offer_grants" in query and "FOR UPDATE" in query:
            return dict(self.grant)
        if "UPDATE launch_offer_grants" in query:
            status = "approved" if "status = 'approved'" in query else "rejected"
            updated = dict(self.grant)
            updated.update(
                {
                    "status": status,
                    "plan": "pro" if status == "approved" else None,
                    "slot_number": 1 if status == "approved" else None,
                    "approved_at": args[2] if status == "approved" else None,
                    "reviewed_at": args[2] if status == "approved" else datetime.now(timezone.utc),
                    "expires_at": args[4] if status == "approved" else None,
                }
            )
            return updated
        raise AssertionError(f"Unexpected fetchrow query: {query}")

    async def fetchval(self, query, *_args):
        if "COUNT(*)" in query:
            return 0
        if "generate_series" in query:
            return 1
        raise AssertionError(f"Unexpected fetchval query: {query}")

    async def execute(self, query, *args):
        self.executions.append((query, args))
        return "SELECT 1"


def test_frontend_action_routes_are_registered():
    admin_routes = {
        (method, route.path)
        for route in admin.router.routes
        for method in getattr(route, "methods", set())
    }
    report_routes = {
        (method, route.path)
        for route in org_college_analytics.router.routes
        for method in getattr(route, "methods", set())
    }
    assert ("POST", "/launch-offers/{grant_id}/approve") in admin_routes
    assert ("POST", "/launch-offers/{grant_id}/reject") in admin_routes
    assert ("POST", "/reports/schedule") in report_routes


def test_report_schedule_request_is_strict():
    valid = ScheduleReportRequest(frequency="weekly", email="admin@example.com")
    assert valid.frequency == "weekly"
    with pytest.raises(ValidationError):
        ScheduleReportRequest(frequency="daily", email="admin@example.com")
    with pytest.raises(ValidationError):
        ScheduleReportRequest(frequency="weekly", email="not-an-email")


def test_next_weekly_report_run_is_never_in_the_past():
    before_cutoff = datetime(2026, 8, 31, 5, 0, tzinfo=timezone.utc)  # Monday
    after_cutoff = datetime(2026, 8, 31, 7, 0, tzinfo=timezone.utc)
    assert next_report_run("weekly", before_cutoff) == datetime(
        2026, 8, 31, 6, 0, tzinfo=timezone.utc
    )
    assert next_report_run("weekly", after_cutoff) == datetime(
        2026, 9, 7, 6, 0, tzinfo=timezone.utc
    )


def test_next_monthly_report_run_handles_year_boundary():
    result = next_report_run(
        "monthly",
        datetime(2026, 12, 15, 8, 0, tzinfo=timezone.utc),
    )
    assert result == datetime(2027, 1, 1, 6, 0, tzinfo=timezone.utc)
    assert next_report_run(
        "monthly",
        datetime(2026, 9, 1, 5, 0, tzinfo=timezone.utc),
    ) == datetime(2026, 9, 1, 6, 0, tzinfo=timezone.utc)


def test_launch_offer_approval_assigns_slot_atomically():
    conn = _LaunchOfferConnection()
    result = asyncio.run(
        approve_launch_offer_grant(conn, 7, "admin@example.com")
    )
    assert result["status"] == "approved"
    assert result["plan"] == "pro"
    assert result["slot_number"] == 1
    assert any("set_config" in query for query, _args in conn.executions)


def test_launch_offer_rejection_records_review():
    conn = _LaunchOfferConnection()
    result = asyncio.run(
        reject_launch_offer_grant(conn, 7, "admin@example.com")
    )
    assert result["status"] == "rejected"
    assert result["user_id"] == "user-7"


def test_report_schedule_migration_and_worker_are_present():
    sql = (ROOT / "app" / "database" / "migrations" / "035_org_report_schedules.sql").read_text(
        encoding="utf-8"
    )
    main_source = (ROOT / "app" / "main.py").read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS org_report_schedules" in sql
    assert "FOR UPDATE SKIP LOCKED" in (
        ROOT / "app" / "services" / "report_schedules.py"
    ).read_text(encoding="utf-8")
    assert "run_report_schedule_loop" in main_source


def test_frontend_api_paths_all_exist_in_backend_openapi():
    from app.main import create_app

    api_source = (ROOT / "frontend" / "src" / "lib" / "api.ts").read_text(
        encoding="utf-8"
    )
    frontend_paths = re.findall(
        r"(?:request|cachedRequest)(?:<[^>]*>)?\(\s*[`'\"](/[^`'\"]+)",
        api_source,
    )
    frontend_paths.extend(
        re.findall(r"\$\{API_URL\}(/[^`'\"]+)", api_source)
    )

    def normalize_frontend(path: str) -> str:
        path = re.split(
            r"\$\{(?:params\s*\?|qs(?:\s*\?|\})|this\.buildCohortQuery)",
            path,
            maxsplit=1,
        )[0]
        path = path.split("?", 1)[0]
        if "${" in path and "}" not in path[path.index("${") :]:
            path = path.split("${", 1)[0]
        path = re.sub(r"\$\{[^}]+\}", "{}", path)
        return path.rstrip("/") or "/"

    def normalize_backend(path: str) -> str:
        return (re.sub(r"\{[^}]+\}", "{}", path).rstrip("/") or "/")

    openapi = TestClient(create_app()).get("/openapi.json").json()
    backend_paths = {normalize_backend(path) for path in openapi["paths"]}
    missing = {
        normalize_frontend(path)
        for path in frontend_paths
        if normalize_frontend(path) not in backend_paths
    }
    assert missing == set()
