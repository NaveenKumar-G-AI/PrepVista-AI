from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.routers.org_college_analytics import (
    _cc_cohort_history,
    _cc_percentile_histories,
    _cc_session_forensics,
    _cc_skill_snapshots,
    _cc_skills,
    _cc_tier_for_sessions,
    _lb_year,
)
from app.routers.org_college_helpers import _readiness_tier


ROOT = Path(__file__).resolve().parents[1]


def _session(session_id: str, score: float, created_at: datetime) -> dict:
    return {"id": session_id, "final_score": score, "created_at": created_at}


def test_command_centre_percentiles_use_real_ordinal_scores():
    now = datetime.now(timezone.utc)
    histories = _cc_percentile_histories(
        {
            "student-a": [
                _session("a1", 40, now - timedelta(days=3)),
                _session("a2", 80, now - timedelta(days=1)),
            ],
            "student-b": [
                _session("b1", 80, now - timedelta(days=3)),
                _session("b2", 60, now - timedelta(days=1)),
            ],
        }
    )

    assert histories == {"student-a": [0, 100], "student-b": [100, 0]}


def test_command_centre_tier_uses_per_session_score_change():
    now = datetime.now(timezone.utc)
    sessions = [
        _session("s1", 50, now - timedelta(days=3)),
        _session("s2", 60, now - timedelta(days=2)),
        _session("s3", 70, now - timedelta(days=1)),
    ]

    assert _cc_tier_for_sessions(sessions) == ("Almost", False)
    assert _cc_tier_for_sessions([]) == ("At Risk", True)


def test_readiness_tier_uses_latest_score_with_minimum_evidence() -> None:
    assert _readiness_tier(80, 1) == "developing"
    assert _readiness_tier(80, 2) == "almost_ready"
    assert _readiness_tier(80, 3) == "ready"
    assert _readiness_tier(20, 1) == "at_risk"
    assert _readiness_tier(None, 0) == "at_risk"


def test_leaderboard_preserves_configured_year_labels():
    assert _lb_year(2026) == "2026"
    assert _lb_year("2022-2026") == "2022-2026"
    assert _lb_year("First Year") == "First Year"
    assert _lb_year("  ") is None


def test_command_centre_skills_never_fabricate_missing_rubrics():
    empty = _cc_skills({})
    assert empty
    assert all(value is None for value in empty.values())

    measured = _cc_skills({"technical_depth": 7.5, "final_score": 99})
    assert measured["Technical Depth"] == 75
    assert measured["Communication"] is None
    assert "System Design" not in measured

    first, latest = _cc_skill_snapshots(
        [
            {"rubric_scores": {"technical_depth": 6}},
            {"rubric_scores": {"communication": 8}},
        ]
    )
    assert first["Technical Depth"] == latest["Technical Depth"] == 60
    assert first["Communication"] == latest["Communication"] == 80


def test_command_centre_answer_anatomy_is_persisted_evidence():
    now = datetime.now(timezone.utc)
    sessions = [_session("session-1", 72, now)]
    evaluation = {
        "session_id": "session-1",
        "turn_number": 1,
        "rubric_category": "communication",
        "classification": "partial",
        "answer_status": "Answered",
        "score": 7.2,
        "relevance_score": 1.4,
        "clarity_score": 1.6,
        "specificity_score": 1.2,
        "structure_score": 1.0,
        "answer_duration_seconds": 31,
        "question_text": "What did you build?",
        "raw_answer": "I built the API.",
        "normalized_answer": "I built the API.",
        "repaired_answer": "I built the payments API.",
        "ideal_answer": "Describe the API, your contribution, and the result.",
        "what_worked": "Named the component.",
        "what_was_missing": "No result was stated.",
    }

    detail, forensic = _cc_session_forensics(
        sessions, {"session-1": [evaluation]}, [50]
    )

    assert detail["hasTurnData"] is True
    assert detail["sub"] == {
        "Relevance": 7.0,
        "Clarity": 8.0,
        "Specificity": 6.0,
        "Structure": 5.0,
    }
    assert forensic["answers"] == [
        {
            "question": "What did you build?",
            "said": "I built the payments API.",
            "ideal": "Describe the API, your contribution, and the result.",
            "good": "Named the component.",
            "bad": "No result was stated.",
        }
    ]


def test_command_centre_answer_subscores_preserve_legacy_ten_point_rows():
    now = datetime.now(timezone.utc)
    sessions = [_session("legacy-session", 72, now)]
    evaluation = {
        "session_id": "legacy-session",
        "turn_number": 1,
        "rubric_category": "communication",
        "classification": "partial",
        "answer_status": "Answered",
        "score": 7.2,
        "relevance_score": 7,
        "clarity_score": 8,
        "specificity_score": 6,
        "structure_score": 7,
        "answer_duration_seconds": 31,
        "question_text": "What did you build?",
        "raw_answer": "I built the API.",
        "normalized_answer": "I built the API.",
        "repaired_answer": "",
        "ideal_answer": "",
        "what_worked": "",
        "what_was_missing": "",
    }

    detail, _ = _cc_session_forensics(
        sessions, {"legacy-session": [evaluation]}, [50]
    )

    assert detail["sub"] == {
        "Relevance": 7.0,
        "Clarity": 8.0,
        "Specificity": 6.0,
        "Structure": 7.0,
    }


def test_command_centre_weekly_history_counts_persisted_sessions():
    now = datetime.now(timezone.utc)
    student_id = "student-1"
    roster = [{"user_id": student_id, "enrolled_at": now - timedelta(days=30)}]
    sessions = {
        student_id: [
            _session("s1", 60, now - timedelta(days=8)),
            _session("s2", 80, now - timedelta(hours=1)),
        ]
    }

    history = _cc_cohort_history(roster, sessions, now)

    assert len(history["labels"]) == 12
    assert sum(history["interviews"]) == 2
    assert history["readiness"][-1] == 80
    assert history["atRisk"][-1] == 0


def test_live_command_centre_contains_no_generated_data_fallbacks():
    html = (ROOT / "frontend" / "public" / "command-centre.html").read_text(
        encoding="utf-8"
    )
    page = (
        ROOT
        / "frontend"
        / "src"
        / "app"
        / "org-admin"
        / "analytics"
        / "[[...slug]]"
        / "page.tsx"
    ).read_text(encoding="utf-8")

    forbidden = (
        "makeStudents",
        "mulberry32",
        "Recovery Projection",
        "annualFee: 100000",
        "renews in 214 days",
        "const samples=[",
        "Lakshmi Institute",
    )
    assert all(marker not in html for marker in forbidden)
    assert 'sandbox="allow-scripts allow-downloads"' in page


def test_live_scoreboard_contains_no_generated_cohort_fallback():
    html = (ROOT / "frontend" / "public" / "scoreboard.html").read_text(
        encoding="utf-8"
    )
    page = (
        ROOT
        / "frontend"
        / "src"
        / "app"
        / "org-admin"
        / "leaderboard"
        / "page.tsx"
    ).read_text(encoding="utf-8")
    backend = (
        ROOT / "app" / "routers" / "org_college_analytics.py"
    ).read_text(encoding="utf-8")

    forbidden = ("makeStudents", "mulberry32", "Lakshmi Institute", "View Sample")
    assert all(marker not in html for marker in forbidden)
    assert "else if(__sbSample){window.PVSB.load(SAMPLE_PAYLOAD);}" in html
    assert 'src="/scoreboard.html?sample=1"' in (
        ROOT / "frontend" / "public" / "command-centre-sample.html"
    ).read_text(encoding="utf-8")
    assert 'sandbox="allow-scripts"' in page
    assert "slope = _compute_slope(" in backend


def test_command_centre_uses_canonical_enrollment_timestamp_column():
    backend = (
        ROOT / "app" / "routers" / "org_college_analytics.py"
    ).read_text(encoding="utf-8")

    assert "os.added_at AS enrolled_at" in backend
    assert "os.created_at AS enrolled_at" not in backend


def test_live_org_analytics_uses_stable_ids_and_tenant_scoped_sessions():
    backend = (ROOT / "app" / "routers" / "org_college_analytics.py").read_text(
        encoding="utf-8"
    )
    command_html = (
        ROOT / "frontend" / "public" / "command-centre.html"
    ).read_text(encoding="utf-8")
    scoreboard_html = (
        ROOT / "frontend" / "public" / "scoreboard.html"
    ).read_text(encoding="utf-8")

    assert '"id": str(r["enrollment_id"])' in backend
    assert "AND organization_id = $2" in backend
    assert "SELECT id, name, org_code, category" in backend
    assert "WHERE os.organization_id = $1 AND os.status = 'active'" in backend
    assert "AND final_score IS NOT NULL" in backend
    assert '"graduation_year":  r["graduation_year"]' in backend
    assert "state.focus=Number(" not in command_html
    assert "s.pctFirst=history.length?round(history[0])" in command_html
    assert "const SKILLS=['Technical Depth','Problem Solving','Communication','Behavioral Evidence','Professionalism & Fit','Conciseness']" in command_html
    assert "v.answerSub" in command_html
    assert "String(s.year)===state.year" in scoreboard_html
    assert "__pvsb:'navigateStudent'" in scoreboard_html
