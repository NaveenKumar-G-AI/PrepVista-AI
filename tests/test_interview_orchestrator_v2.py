"""Acceptance policy tests; no credentials, provider or database required."""
from collections import Counter
import asyncio
import json

import pytest

from app.services.interview_catalog import FAMILIES, QuestionDefinition, load_catalog, safe_question
from app.services.interview_orchestrator import (
    Blueprint, EvidenceLedger, InterviewOrchestrator as Engine, build_blueprint, evidence_report,
)
from app.routers.interview_practice import compare_retry

PROFILE = {"skills": ["Python", "FastAPI", "PostgreSQL", "Redis"],
           "projects": [{"name": "Placement project"}], "certifications": ["Python course"],
           "target_role": "Backend / Software Engineer", "department": "CSE"}
STRONG = "I implemented the cache because repeated reads were expensive. I tested invalidation and compared latency before and after. The tests passed and I learned to check failure paths."


def create(**kwargs):
    return Engine.create(build_blueprint(PROFILE, **kwargs), PROFILE)


def advance(state, answer="", **kwargs):
    return Engine.advance(state, answer, remaining_seconds=kwargs.pop("remaining_seconds", 1800), **kwargs)


def project_state():
    state, _ = advance(create())
    return advance(state, STRONG)[0]


def run_interview(mode="standard", answer=STRONG, **kwargs):
    state = create(mode=mode, **kwargs)
    state, question = advance(state)
    for _ in range(100):
        if question is None:
            break
        state, question = advance(state, answer)
    assert question is None, "Interview failed to terminate"
    return state


def test_standard_primary_breadth_and_closing():
    state = run_interview(answer="We built the project and improved performance significantly.")
    types = Counter(q["type"] for q in state["questions"])
    assert types["PRIMARY"] > types["FOLLOWUP"]
    assert len({a["family"] for a in state["anchors"]}) >= 10
    assert state["questions"][-1]["text"] == "Do you have any questions for me?"


def test_strong_first_answer_moves_to_new_family():
    state, opening = advance(create())
    state, question = advance(state, STRONG)
    assert question["type"] == "PRIMARY" and question["family"] != opening["family"]


def test_weak_ownership_gets_one_targeted_probe_then_moves_on():
    state = project_state()
    state, question = advance(state, "We developed the placement project with our team.")
    assert question["type"] == "FOLLOWUP" and question["reason_for_asking"] == "ownership"
    assert "personally" in question["text"]
    state, question = advance(state, STRONG)
    assert question["type"] == "PRIMARY" and question["family"] != "PROJECT"


def test_followup_limits_and_anchor_identity():
    state = run_interview(answer="We improved performance significantly in the project.")
    assert all(a["followups_used"] <= a["max_followups"] for a in state["anchors"])
    assert state["followups_used"] <= state["blueprint"]["max_followups_total"]
    for q in state["questions"]:
        assert any(a["anchor_question_id"] == q["anchor_id"] for a in state["anchors"])


def test_no_duplicate_primary_ids():
    state = run_interview(mode="full", max_questions=35)
    ids = [a["primary_question_id"] for a in state["anchors"]]
    assert len(ids) == len(set(ids))


def test_python_resume_cross_question():
    state = run_interview(mode="full", max_questions=35)
    assert any("You listed Python" in q["text"] for q in state["questions"])


def test_unknown_resume_fields_are_tolerated():
    state = Engine.create(build_blueprint({"skills": 3, "unknown": None}), {"skills": 3})
    assert state["resume_claims"] == []


def test_improvement_claim_gets_measurement_probe():
    state, question = advance(project_state(), "I implemented caching and improved performance significantly.")
    assert question["reason_for_asking"] == "measurement"


def test_resolving_ownership_does_not_erase_missing_measurement():
    state, question = advance(project_state(), "We improved performance significantly because repeated reads were slow.")
    assert question["reason_for_asking"] == "ownership"
    state, question = advance(state, "I personally implemented cache invalidation because stale reads mattered.")
    assert question["reason_for_asking"] == "measurement"
    assert "measurement" in state["anchors"][-1]["open_gaps"]


def test_we_claims_trigger_ownership():
    analysis = EvidenceLedger.analyze("We built it and our team completed the project.", "PROJECT")
    assert "ownership" in analysis.gaps


@pytest.mark.parametrize("event", ["clarify", "silence", "transcript_failure"])
def test_retry_events_do_not_consume_question_or_add_score(event):
    state = project_state()
    count = len(state["questions"])
    evidence_count = len(state["evidence"])
    result, question = advance(state, event=event)
    assert len(result["questions"]) == count and len(result["evidence"]) == evidence_count
    assert question["id"] == state["questions"][-1]["id"]


def test_early_finish_retains_answer_and_partial_report():
    state, question = advance(project_state(), STRONG, finish=True)
    report = evidence_report(state)
    assert question is None and report["partial"]
    assert report["evidence"][-1]["excerpt"] == STRONG
    assert report["unmeasured"]


def test_no_provider_needed_to_complete_interview():
    assert run_interview()["phase"] == "FINISHING"


@pytest.mark.parametrize("text", ["What is your religion?", "What caste are you?", "Do you plan to marry?", "Tell me your medical conditions.", "What does your family allow?"])
def test_protected_prompts_rejected(text):
    assert not safe_question(text)
    with pytest.raises(ValueError):
        QuestionDefinition(id="unsafe", family="PROJECT", text=text)


def test_quick_duration_cap_and_expiration():
    state = create(mode="quick", duration=6000)
    assert state["blueprint"]["duration_seconds"] == 600
    state, _ = advance(state)
    state, question = advance(state, remaining_seconds=0)
    assert question is None and state["phase"] == "FINISHING"


def test_low_time_reserves_closing_and_forbids_probe():
    state, question = advance(project_state(), "We built it together.", remaining_seconds=55)
    assert question["type"] == "CLOSING"


def test_full_mode_broad_coverage():
    state = run_interview(mode="full", max_questions=35)
    assert len(state["anchors"]) >= 15
    assert max(Counter(a["family"] for a in state["anchors"]).values()) == 1


def test_project_defense_allows_focused_depth():
    state = run_interview(mode="project_defense", max_questions=24, answer="We improved the project significantly.")
    assert sum(a["family"] == "PROJECT" for a in state["anchors"]) >= 3
    assert state["blueprint"]["max_followups_per_anchor"] == 3
    assert state["blueprint"]["max_followups_total"] > build_blueprint(PROFILE).max_followups_total


def test_cross_session_question_variant_changes():
    state = Engine.create(build_blueprint(PROFILE), PROFILE, ["Tell me about yourself."])
    _, question = advance(state)
    assert question["text"] != "Tell me about yourself."


def test_retry_never_invents_metrics_or_automatic_improvement():
    before = EvidenceLedger.analyze("We improved the project significantly.", "PROJECT").model_dump()
    result = compare_retry(before, "The project was really quite good overall.", "PROJECT")
    assert result["repaired_gaps"] == []
    assert result["remaining_gaps"]
    assert not any(c.isdigit() for c in result["better_answer"])


def test_retry_actual_personal_action_repairs_ownership():
    before = EvidenceLedger.analyze("We built it together as a team.", "PROJECT").model_dump()
    result = compare_retry(before, STRONG, "PROJECT")
    assert "ownership" in result["repaired_gaps"]


def test_report_conclusions_link_to_actual_evidence():
    report = evidence_report(run_interview(answer="We improved the project significantly."))
    evidence = {e["evidence_id"] for e in report["evidence"]}
    assert all(r["evidence_id"] in evidence for r in report["top_risks"])
    assert all(m["evidence_id"] in evidence for m in report["missions"])


def test_insufficient_remains_insufficient():
    report = evidence_report(run_interview(answer="I don't know"))
    assert report["evidence_state"] == "INSUFFICIENT"
    assert all(e["status"] == "INSUFFICIENT_EVIDENCE" for e in report["evidence"])


def test_catalog_covers_all_families_and_no_assumed_internship():
    assert set(q.family for q in load_catalog()) == set(FAMILIES)
    assert "internship" not in build_blueprint(PROFILE, max_questions=40, mode="full").planned_ids


def test_plan_allowance_is_not_exceeded():
    for limit in [5, 10, 13]:
        state = run_interview(max_questions=limit)
        assert len(state["questions"]) <= limit
        assert state["blueprint"]["plan_limited"]


def test_json_round_trip_resume_does_not_change_decision():
    state = project_state()
    assert advance(state, STRONG)[1] == advance(json.loads(json.dumps(state)), STRONG)[1]


def test_custom_family_filter_and_unknown_mode_validation():
    bp = build_blueprint(PROFILE, mode="custom", categories=["TEAMWORK"])
    assert set(bp.planned_families) <= {"TEAMWORK", "INTRODUCTION_AND_PERSONAL_PROFILE", "FINAL_CLOSING"}
    with pytest.raises(ValueError):
        build_blueprint(PROFILE, mode="nonsense")


def test_e2e_standard_backend_fresher_transcript(tmp_path):
    state, question = advance(create())
    transcript = []
    while question:
        if question["definition_id"] == "project" and question["type"] == "PRIMARY":
            answer = "I implemented Redis caching for our placement project."
        elif question["definition_id"] == "ai" and question["type"] == "PRIMARY":
            answer = "I used AI-generated code to help with my work."
        elif question["type"] == "CLOSING":
            answer = "What would a new engineer focus on learning first?"
        else:
            answer = STRONG
        transcript.append({"question": question, "answer": answer})
        state, question = advance(state, answer)
    assert any("stale data" in turn["question"]["text"] for turn in transcript)
    assert any(turn["question"]["reason_for_asking"] == "verification" for turn in transcript)
    assert transcript[-1]["question"]["type"] == "CLOSING"
    assert len({t["question"]["family"] for t in transcript}) >= 10
    assert not evidence_report(state)["partial"]
    (tmp_path / "interview-transcript.json").write_text(json.dumps(transcript, indent=2), encoding="utf-8")
