from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.routers.org_college_analytics import (
    _cc_cohort_history,
    _cc_percentile_histories,
    _cc_session_forensics,
    _cc_tier_for_sessions,
)


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
        "relevance_score": 7,
        "clarity_score": 8,
        "specificity_score": 6,
        "structure_score": 7,
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
    assert forensic["answers"] == [
        {
            "question": "What did you build?",
            "said": "I built the payments API.",
            "ideal": "Describe the API, your contribution, and the result.",
            "good": "Named the component.",
            "bad": "No result was stated.",
        }
    ]


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
    assert "(latest_value - first_value) / (n_sess - 1)" in backend


def test_command_centre_uses_canonical_enrollment_timestamp_column():
    backend = (
        ROOT / "app" / "routers" / "org_college_analytics.py"
    ).read_text(encoding="utf-8")

    assert "os.added_at AS enrolled_at" in backend
    assert "os.created_at AS enrolled_at" not in backend
