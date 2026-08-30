"""Placement-drive eligibility validation and evaluation contracts."""

import pytest
from pydantic import ValidationError

from app.routers.placement_drives import AddRuleVersionRequest, _summarize_cohort


def test_rule_rejects_fabricated_or_unpersisted_student_fields() -> None:
    with pytest.raises(ValidationError, match="unsupported eligibility field"):
        AddRuleVersionRequest(
            rule_tree={
                "kind": "LEAF",
                "field": "cgpa",
                "comparator": "GTE",
                "value": 7.5,
                "category": "SCORE",
            }
        )


def test_rule_rejects_empty_boolean_groups() -> None:
    with pytest.raises(ValidationError, match="requires between 1 and 50 child nodes"):
        AddRuleVersionRequest(rule_tree={"kind": "AND", "children": []})


def test_eligibility_uses_real_values_and_missing_values_fail_closed() -> None:
    rule = {
        "kind": "AND",
        "children": [
            {
                "kind": "LEAF",
                "field": "readiness_score",
                "comparator": "GTE",
                "value": 60,
                "category": "SCORE",
            },
            {
                "kind": "LEAF",
                "field": "department_code",
                "comparator": "IN",
                "value": ["CSE", "ECE"],
                "category": "DEPARTMENT",
            },
        ],
    }
    AddRuleVersionRequest(rule_tree=rule)

    summary = _summarize_cohort(
        [
            {"id": "eligible", "readiness_score": 72.0, "department_code": "CSE"},
            {"id": "missing-score", "readiness_score": None, "department_code": "CSE"},
            {"id": "wrong-department", "readiness_score": 80.0, "department_code": "ME"},
        ],
        rule,
    )

    assert summary["eligible_student_ids"] == ["eligible"]
    assert summary["not_eligible_count"] == 2
    assert summary["category_breakdown"]["SCORE"] == 1
    assert summary["category_breakdown"]["DEPARTMENT"] == 1
