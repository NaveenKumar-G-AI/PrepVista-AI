"""Missing assessments remain unmeasured throughout institution read models."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.routers import org_admin_helpers as platform
from app.routers import org_college_helpers as college
from app.routers import org_college_analytics as analytics


@pytest.mark.parametrize("helper", [platform, college])
@pytest.mark.parametrize("score,sessions", [(None, 0), (None, 4), (80, 0), (float("nan"), 2), (101, 2)])
def test_unmeasured_students_are_not_performance_risks(helper, score, sessions):
    assert helper._readiness_tier(score, sessions) == "not_measured"
    assert helper._zero_offer_risk(score, sessions, -5) is False


@pytest.mark.parametrize("helper", [platform, college])
def test_genuine_zero_retains_its_measured_classification(helper):
    assert helper._readiness_tier(0, 1) == "at_risk"
    assert helper._zero_offer_risk(0, 1, None) is True
    grid = helper._build_traffic_light({"not_measured": 2, "at_risk": 1}, 3)
    assert grid["not_measured"] == {"count": 2, "pct": 66.7}
    assert sum(row["count"] for row in grid.values()) == 3


def _row(uid, score, sessions):
    return {
        "user_id": uid, "full_name": uid, "email": uid + "@example.invalid",
        "student_code": uid, "department_name": "Computing", "graduation_year": 2027,
        "year_name": "Final year", "batch_name": "2027", "session_count": sessions,
        "avg_score": score, "latest_score": score,
        **{f"avg_{key}": None for key in college._RUBRIC_CATEGORIES},
    }


def test_organization_summary_and_export_reconcile_unmeasured_counts():
    rows = [_row("never", None, 0), _row("pending", None, 2), _row("zero", 0, 1)]
    summary = platform._compute_org_perf_summary(rows)
    assert summary["readiness_tier_counts"]["not_measured"] == 2
    assert summary["readiness_tier_counts"]["at_risk"] == 1
    assert summary["zero_offer_risk_count"] == 1
    assert summary["cohort_avg_score"] == 0
    export = college._render_cohort_summary_export(rows, "json", "org")
    for segment in export["segments"]:
        assert segment["not_measured_count"] == 2
        assert segment["at_risk_count"] == segment["zero_offer_risk_count"] == 1


def test_readiness_endpoint_retains_unknown_students_in_separate_roster(monkeypatch):
    rows = [_row("pending", None, 2), _row("zero", 0, 1)]

    class Connection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            pass

    async def fetch(*_):
        return rows

    monkeypatch.setattr(analytics, "DatabaseConnection", Connection)
    monkeypatch.setattr(analytics, "_fetch_perf_aggregate", fetch)
    result = asyncio.run(analytics.analytics_readiness(admin=SimpleNamespace(organization_id="org")))
    assert result["tiers"]["not_measured"][0]["user_id"] == "pending"
    assert [row["user_id"] for row in result["zero_offer_risk"]] == ["zero"]
    assert sum(result["readiness_distribution"].values()) == 2


def test_cohort_history_does_not_invent_zero_scores_or_risk_before_assessment():
    now = datetime.now(timezone.utc)
    roster = [{"user_id": "new", "enrolled_at": now - timedelta(days=40)}]
    result = analytics._cc_cohort_history(roster, {}, now)
    assert all(value is None for value in result["readiness"])
    assert result["atRisk"] == [0] * 12
    assert analytics._cc_tier_for_sessions([{"final_score": None}]) == ("Not measured", False)
