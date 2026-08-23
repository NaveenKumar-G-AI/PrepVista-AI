"""
Part 5 — AI insight contract. Sections 51-53.

HARD RULE, enforced structurally rather than just by convention: no
function in this file may return a dict with a "result" key holding a
PASS/FAIL/HOLD-shaped decision. The assertion at the bottom of each
builder is not decoration — it's what makes "AI must not decide the
result" a property of the code, not just a promise in a comment.
Everything here only summarizes, flags, or recommends attention. The
TPO/institutional result (results.py) is authoritative, full stop.
"""

from datetime import datetime, timezone

_FORBIDDEN_DECISION_VALUES = {"PASS", "FAIL", "HOLD", "DISQUALIFIED"}


def _assert_not_a_decision(insight: dict):
    result_like_keys = {"result", "decision", "verdict", "outcome"}
    for k, v in insight.items():
        if k in result_like_keys or (isinstance(v, str) and v.upper() in _FORBIDDEN_DECISION_VALUES):
            raise AssertionError(
                "An AI insight object attempted to carry a PASS/FAIL/HOLD-shaped decision. "
                "This is structurally disallowed — see section 53 of the spec."
            )
    return insight


def build_result_pending_insight(interview: dict, days_waiting: int):
    priority = "HIGH" if days_waiting >= 2 else "MEDIUM"
    insight = {
        "type": "RESULT_PENDING",
        "priority": priority,
        "interview_id": interview["id"],
        "student_id": interview["student_id"],
        "evidence": {"completed_at": interview.get("updated_at"), "days_waiting": days_waiting},
        "recommended_action": "Review and enter result",
    }
    return _assert_not_a_decision(insight)


def build_issue_insight(issue: dict):
    insight = {
        "type": "INTERVIEW_ISSUE",
        "priority": "HIGH",
        "student_id": issue["student_id"],
        "evidence": {"issue_type": issue["issue_type"]},
        "recommended_action": "Resolve interview access information",
    }
    return _assert_not_a_decision(insight)


def build_conflict_insight(conflict_row: dict):
    insight = {
        "type": "RESULT_CONFLICT",
        "priority": "HIGH",
        "student_id": conflict_row.get("student_id"),
        "evidence": {"existing_result_present": True, "incoming_result_present": True},
        "recommended_action": "Compare both records and confirm the correct outcome before publishing",
    }
    return _assert_not_a_decision(insight)


def build_pattern_insight(repeated_non_advancement_rows: list):
    """Section 48 — deliberately phrased as an observation to look into,
    never a classification of the student."""
    insight = {
        "type": "REPEATED_NON_ADVANCEMENT_PATTERN",
        "priority": "MEDIUM",
        "evidence": {"student_count": len(repeated_non_advancement_rows), "min_interviews_considered": 3},
        "recommended_action": "Consider offering additional interview preparation support to this group",
    }
    return _assert_not_a_decision(insight)
