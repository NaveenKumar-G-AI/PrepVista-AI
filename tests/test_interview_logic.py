"""
PrepVista AI - Interview Logic Unit Tests
==========================================
Comprehensive unit-test suite covering:
  - Config validation
  - Question plan generation and difficulty bias
  - Cross-session cooldown
  - Opening question diversity
  - Duplicate detection
  - Live difficulty signal
  - Final score computation
  - Answer validation (empty, short, filler, irrelevant, strong, STAR)
  - Interview summary edge cases
  - Resume field inference
  - Career / difficult plan quality
  - Family repeat rule blocking
  - Transcript recovery
  - Better answer generation
  - Template quality
  - Premium report generation
  - HR readiness level computation
  - Category feedback accuracy
  - Communication assessment
  - Per-question insight generation
  - Score band labeling
  - Improvement roadmap generation
  - Edge cases: zero answers, all silent, all strong, mixed, partial completion

All tests are pure-function unit tests.
No database, no server, no async required.
"""

import pytest

from app.config import is_valid_difficulty_mode, normalize_difficulty_mode
from app.services.evaluator import (
    _fallback_career_better_answer,
    _fallback_pro_better_answer,
    compute_final_score,
)
from app.services.interview_summary import (
    HR_READINESS_DEVELOPING,
    HR_READINESS_INTERVIEW_READY,
    HR_READINESS_NOT_READY,
    HR_READINESS_PROGRESSING,
    HR_READINESS_STRONG,
    TURN_OUTCOME_CLARIFICATION,
    TURN_OUTCOME_TIMEOUT,
    TURN_STATE_ACTIVE_QUESTION_OPEN,
    TURN_STATE_QUESTION_CLOSED,
    TURN_STATE_WAITING_CLARIFICATION,
    _analyze_answer_quality,
    _assess_communication_style,
    _classify_answer_strength,
    _compute_hr_readiness_level,
    _generate_improvement_roadmap,
    _generate_per_question_insights,
    _get_category_feedback,
    _get_score_band,
    _evaluation_is_answered,
    compute_interview_summary,
    compute_premium_interview_report,
    coerce_question_plan_items,
    coerce_runtime_state,
)
from app.services.interviewer import (
    _apply_cross_session_question_cooldown,
    _build_fallback_question_plan,
    _build_opening_question,
    _build_repeat_question,
    _is_duplicate_question,
    _plan_target_signature,
    _question_family_from_text,
    _question_signature,
    _question_template_for_category,
    _select_live_difficulty_signal,
    _violates_family_repeat_rules,
)
from app.services.resume_parser import infer_resume_field_profile
from app.services.transcript import (
    recover_career_intent,
    recover_technical_intent,
    summarize_recovered_intent,
)


# ---------------------------------------------------------------------------
# Shared test fixtures
# ---------------------------------------------------------------------------

def _sample_resume() -> dict:
    return {
        "candidate_name": "Rahul",
        "skills": ["Python", "FastAPI", "RAG", "Supabase"],
        "projects": [{"name": "NewsWeave AI"}, {"name": "HiringFlow"}],
        "experience": [],
        "inferred_role": "ai_backend_engineer",
    }


def _ai_backend_resume() -> dict:
    return {
        "candidate_name": "Rahul",
        "education": ["B.E. Computer Science and Engineering"],
        "skills": ["Python", "FastAPI", "RAG", "Prompt Engineering", "Supabase"],
        "projects": [
            {
                "name": "SignalBrief",
                "description": "AI news intelligence platform with retrieval, filtering, and structured outputs",
                "tech_stack": ["FastAPI", "PyTorch", "Groq"],
            }
        ],
        "experience": [],
        "inferred_role": "ai_backend_engineer",
    }


def _non_software_resume() -> dict:
    return {
        "candidate_name": "Asha",
        "education": ["BBA in Business Analytics"],
        "skills": ["Excel", "Power BI", "Stakeholder Communication", "Process Improvement"],
        "projects": [
            {
                "name": "Operations Dashboard",
                "description": "Improved reporting turnaround and stakeholder visibility",
                "tech_stack": ["Power BI", "Excel"],
            }
        ],
        "experience": [
            {
                "title": "Operations Intern",
                "description": "Process analysis, reporting, and stakeholder updates",
            }
        ],
        "inferred_role": "business_analyst_operations",
    }


def _make_evaluation(
    turn: int = 1,
    category: str = "technical_depth",
    score: float = 7.5,
    classification: str = "partial",
    answer_status: str = "partial",
    raw_answer: str = "I used FastAPI for the backend and it improved response time.",
    what_worked: str = "Mentioned the tool and a result.",
    what_missing: str = "Could have quantified the improvement.",
    how_to_improve: str = "Add a specific number for the response time improvement.",
    communication_score: float = 1.2,
    answer_duration: int = 25,
) -> dict:
    return {
        "turn_number": turn,
        "rubric_category": category,
        "score": score,
        "classification": classification,
        "answer_status": answer_status,
        "raw_answer": raw_answer,
        "normalized_answer": raw_answer,
        "what_worked": what_worked,
        "what_was_missing": what_missing,
        "how_to_improve": how_to_improve,
        "communication_score": communication_score,
        "answer_duration_seconds": answer_duration,
    }


def _make_plan(n: int = 10, category: str = "technical_depth") -> list[dict]:
    return [{"turn": i + 1, "category": category, "target": f"item-{i}"} for i in range(n)]


def _make_runtime(
    question_state: str = TURN_STATE_QUESTION_CLOSED,
    clarification_count: int = 0,
    timeout_count: int = 0,
    skipped_count: int = 0,
    response_times: list[int] | None = None,
) -> dict:
    return {
        "question_state": question_state,
        "clarification_count": clarification_count,
        "timeout_count": timeout_count,
        "skipped_count": skipped_count,
        "question_response_times": response_times or [],
    }


# ---------------------------------------------------------------------------
# Section 1: Config validation
# ---------------------------------------------------------------------------

class TestConfigValidation:

    def test_normalize_difficulty_mode_preserves_known_modes(self):
        assert normalize_difficulty_mode("difficult") == "difficult", \
            "Known mode must pass through unchanged"
        assert normalize_difficulty_mode("basic") == "basic"
        assert normalize_difficulty_mode("medium") == "medium"
        assert normalize_difficulty_mode("auto") == "auto"

    def test_normalize_difficulty_mode_falls_back_to_auto_for_unknown(self):
        assert normalize_difficulty_mode("unknown-mode") == "auto", \
            "Unknown mode must fall back to auto"
        assert normalize_difficulty_mode("") == "auto", \
            "Empty string must fall back to auto"
        assert normalize_difficulty_mode("   ") == "auto", \
            "Whitespace-only must fall back to auto"

    def test_is_valid_difficulty_mode_accepts_known_values(self):
        for mode in ("auto", "basic", "medium", "difficult"):
            assert is_valid_difficulty_mode(mode) is True, \
                f"'{mode}' must be accepted as valid"

    def test_is_valid_difficulty_mode_rejects_unknown_values(self):
        assert is_valid_difficulty_mode("unknown-mode") is False
        assert is_valid_difficulty_mode("") is False
        assert is_valid_difficulty_mode("HARD") is False


# ---------------------------------------------------------------------------
# Section 2: Question plan generation
# ---------------------------------------------------------------------------

class TestQuestionPlanGeneration:

    def test_fallback_plan_basic_mode_produces_only_easy_questions(self):
        plan = _build_fallback_question_plan(
            "pro", _sample_resume(), 10, difficulty_mode="basic", variant_seed=0
        )
        assert plan, "Basic plan must not be empty"
        difficulties = {item["difficulty"] for item in plan}
        assert difficulties == {"easy"}, \
            f"Basic mode must produce only easy questions, got: {difficulties}"

    def test_fallback_plan_difficult_mode_includes_hard_questions(self):
        plan = _build_fallback_question_plan(
            "pro", _sample_resume(), 10, difficulty_mode="difficult", variant_seed=0
        )
        assert plan, "Difficult plan must not be empty"
        assert "hard" in {item["difficulty"] for item in plan}, \
            "Difficult mode must include at least one hard question"

    def test_fallback_plan_first_item_is_always_introduction(self):
        for plan_name in ("free", "pro", "career"):
            plan = _build_fallback_question_plan(
                plan_name, _sample_resume(), 5, difficulty_mode="auto", variant_seed=0
            )
            assert plan, f"{plan_name}: plan must not be empty"
            assert plan[0]["category"] == "introduction", \
                f"{plan_name}: first question must always be introduction"

    def test_fallback_plan_never_exceeds_max_turns(self):
        for max_turns in (3, 5, 10, 13):
            plan = _build_fallback_question_plan(
                "career", _sample_resume(), max_turns, difficulty_mode="auto", variant_seed=0
            )
            assert len(plan) <= max_turns, \
                f"Plan with max_turns={max_turns} must not exceed that count"

    def test_cross_session_cooldown_changes_targets_when_resume_has_depth(self):
        resume = _sample_resume()
        original = _build_fallback_question_plan(
            "career", resume, 13, difficulty_mode="auto", variant_seed=0
        )
        recent_sigs = {
            _plan_target_signature(item["category"], item["target"])
            for item in original[:6]
        }
        cooled = _apply_cross_session_question_cooldown(
            plan="career",
            question_plan=original,
            resume_summary=resume,
            max_turns=13,
            difficulty_mode="auto",
            recent_memory={
                "recent_target_signatures": recent_sigs,
                "recent_targets": [],
                "recent_questions": [],
            },
            variant_seed=0,
        )
        assert cooled, "Cooled plan must not be empty"
        original_sigs = [
            _plan_target_signature(i["category"], i["target"]) for i in original[1:6]
        ]
        cooled_sigs = [
            _plan_target_signature(i["category"], i["target"]) for i in cooled[1:6]
        ]
        assert cooled_sigs != original_sigs, \
            "Cross-session cooldown must change at least one of the first 5 non-intro targets"


# ---------------------------------------------------------------------------
# Section 3: Opening question diversity
# ---------------------------------------------------------------------------

class TestOpeningQuestionDiversity:

    def test_opening_questions_avoid_repeats_across_seeds(self):
        resume = _sample_resume()
        seen_sigs: set[str] = set()
        openers: list[str] = []

        for seed in range(5):
            plan = _build_fallback_question_plan(
                "career", resume, 13, difficulty_mode="difficult", variant_seed=seed
            )
            opener = _build_opening_question(
                plan="career",
                question_plan=plan,
                difficulty_mode="difficult",
                recent_question_signatures=seen_sigs,
                recent_questions=openers,
            )
            sig = _question_signature(opener)
            assert sig not in seen_sigs, \
                f"Seed {seed}: opener signature must not repeat a previous opener"
            seen_sigs.add(sig)
            openers.append(opener)

        assert len({_question_signature(o) for o in openers}) == 5, \
            "All 5 seeded openers must produce distinct signatures"

    def test_opening_question_is_non_empty(self):
        plan = _build_fallback_question_plan(
            "pro", _sample_resume(), 10, difficulty_mode="auto", variant_seed=0
        )
        opener = _build_opening_question(
            plan="pro",
            question_plan=plan,
            difficulty_mode="auto",
            recent_question_signatures=set(),
            recent_questions=[],
        )
        assert opener and opener.strip(), "Opening question must not be empty"


# ---------------------------------------------------------------------------
# Section 4: Repeat question wording
# ---------------------------------------------------------------------------

class TestRepeatQuestion:

    def test_repeat_question_differs_from_original(self):
        original = "What exactly did you own in that project, and where were your responsibilities deepest?"
        repeated = _build_repeat_question("career", original, "project_ownership")
        assert repeated, "Repeat question must not be empty"
        assert repeated != original, "Repeat question must differ from the original phrasing"

    def test_repeat_question_contains_ownership_keywords(self):
        original = "What exactly did you own in that project?"
        repeated = _build_repeat_question("career", original, "project_ownership")
        assert any(term in repeated.lower() for term in ("personally", "responsibility", "owned", "you")), \
            "Repeat question must contain an ownership-related keyword"


# ---------------------------------------------------------------------------
# Section 5: Duplicate detection
# ---------------------------------------------------------------------------

class TestDuplicateDetection:

    def test_exact_match_is_detected(self):
        asked = ["Tell me about yourself.", "Walk me through that pipeline."]
        sigs = {_question_signature(q) for q in asked}
        assert _is_duplicate_question("Tell me about yourself.", sigs, asked), \
            "Exact match must be detected as duplicate"

    def test_near_match_is_detected(self):
        asked = ["Tell me about yourself.", "Walk me through that pipeline."]
        sigs = {_question_signature(q) for q in asked}
        assert _is_duplicate_question("Can you walk me through that pipeline?", sigs, asked), \
            "Near-match must be detected as duplicate"

    def test_unrelated_question_is_not_flagged(self):
        asked = ["Tell me about yourself.", "Walk me through that pipeline."]
        sigs = {_question_signature(q) for q in asked}
        assert not _is_duplicate_question("What trade-off were you balancing there?", sigs, asked), \
            "Unrelated question must not be flagged as duplicate"

    def test_empty_asked_list_never_flags_duplicate(self):
        assert not _is_duplicate_question("What trade-off were you balancing?", set(), []), \
            "No previously asked questions means no possible duplicate"


# ---------------------------------------------------------------------------
# Section 6: Live difficulty signal
# ---------------------------------------------------------------------------

class TestLiveDifficultySignal:

    def test_basic_mode_always_stays_easy(self):
        assert _select_live_difficulty_signal("steady", "basic", False, False, 0) == "easier", \
            "Basic mode must always push toward easier"

    def test_medium_mode_recovers_from_easier_to_steady(self):
        assert _select_live_difficulty_signal("easier", "medium", False, False, 0) == "steady", \
            "Medium mode must recover from easier to steady"

    def test_difficult_mode_escalates_on_steady(self):
        assert _select_live_difficulty_signal("steady", "difficult", False, False, 0) == "harder", \
            "Difficult mode must escalate to harder when answer is steady"

    def test_timeout_resets_difficulty_even_in_difficult_mode(self):
        assert _select_live_difficulty_signal("harder", "difficult", True, False, 1) == "steady", \
            "Timeout must reset difficulty to steady regardless of mode"


# ---------------------------------------------------------------------------
# Section 7: Final score computation
# ---------------------------------------------------------------------------

class TestFinalScoreComputation:

    def test_score_scales_by_expected_questions(self):
        result = compute_final_score(
            question_evaluations=[_make_evaluation(score=8.0, classification="strong")],
            plan="free",
            expected_questions=5,
        )
        assert result["final_score"] < 80, \
            "Score for 1 answered of 5 expected must be below 80"
        assert result["completion_rate"] == 20.0, \
            "Completion rate must be 20% for 1 of 5 questions"
        assert result["answered_questions"] == 1

    def test_all_strong_answers_produces_high_score(self):
        evals = [_make_evaluation(turn=i + 1, score=9.0, classification="strong") for i in range(10)]
        result = compute_final_score(evals, plan="pro", expected_questions=10)
        assert result["final_score"] >= 70, \
            "All strong answers on 10/10 questions must produce a score >= 70"
        assert result["completion_rate"] == 100.0

    def test_all_zero_scores_produces_low_score(self):
        evals = [
            _make_evaluation(
                turn=i + 1, score=0, classification="silent",
                answer_status="silent", raw_answer="",
            )
            for i in range(5)
        ]
        result = compute_final_score(evals, plan="pro", expected_questions=5)
        assert result["final_score"] < 20, \
            "All zero-score answers must produce a very low final score"

    def test_clarification_does_not_count_as_answered(self):
        result = compute_final_score(
            question_evaluations=[
                _make_evaluation(
                    score=0, classification="silent",
                    answer_status="Clarification requested",
                    raw_answer="",
                    communication_score=0,
                )
            ],
            plan="pro",
            expected_questions=10,
        )
        assert result["answered_questions"] == 0, \
            "Clarification turn must not count as answered"

    def test_no_division_by_zero_with_empty_evaluations(self):
        result = compute_final_score([], plan="free", expected_questions=5)
        assert result["final_score"] == 0.0, \
            "Empty evaluations must produce a score of 0 without crashing"
        assert result["completion_rate"] == 0.0

    def test_short_precise_answer_not_penalized_vs_long_vague(self):
        """A short but correct answer should outscore a long vague one."""
        short_strong = _make_evaluation(score=8.5, classification="strong",
                                        raw_answer="FastAPI. I chose it for async support and automatic OpenAPI docs.")
        long_vague   = _make_evaluation(score=3.0, classification="vague",
                                        raw_answer=" ".join(["I used something"] * 60))
        r_short = compute_final_score([short_strong], plan="pro", expected_questions=1)
        r_long  = compute_final_score([long_vague],  plan="pro", expected_questions=1)
        assert r_short["final_score"] > r_long["final_score"], \
            "A precise high-scoring short answer must outscore a long vague answer"

    def test_mixed_answers_produce_middle_range_score(self):
        evals = [
            _make_evaluation(turn=1, score=8.5, classification="strong"),
            _make_evaluation(turn=2, score=3.0, classification="weak"),
            _make_evaluation(turn=3, score=6.0, classification="partial"),
        ]
        result = compute_final_score(evals, plan="pro", expected_questions=3)
        assert 30 <= result["final_score"] <= 80, \
            "Mixed answers should produce a score in the middle range"


# ---------------------------------------------------------------------------
# Section 8: Answer quality detection
# ---------------------------------------------------------------------------

class TestAnswerQualityDetection:

    def test_empty_answer_is_flagged(self):
        flags = _analyze_answer_quality("")
        assert flags["is_empty"] is True, "Empty string must be flagged as empty"
        assert flags["word_count"] == 0

    def test_whitespace_only_is_flagged(self):
        flags = _analyze_answer_quality("   ")
        assert flags["is_empty"] is True, "Whitespace-only must be flagged as empty"

    def test_filler_heavy_answer_is_detected(self):
        filler_answer = "umm i think basically like i mean you know honestly i guess umm yeah"
        flags = _analyze_answer_quality(filler_answer)
        assert flags["has_filler_heavy"] is True, \
            "Filler-heavy answer must be detected"

    def test_generic_opener_is_detected(self):
        flags = _analyze_answer_quality("That's a great question! I would like to answer this.")
        assert flags["has_generic_opener"] is True, \
            "Generic opener must be detected"

    def test_result_signal_detected_in_strong_answer(self):
        flags = _analyze_answer_quality(
            "I implemented FastAPI for the backend and it reduced latency by 40% measured over 1000 requests."
        )
        assert flags["has_result_signal"] is True, \
            "Answer with measurable result must trigger result signal"

    def test_example_signal_detected(self):
        flags = _analyze_answer_quality(
            "For example, in my project SignalBrief, I built a retrieval pipeline using RAG."
        )
        assert flags["has_example_signal"] is True, \
            "Answer with 'for example' and project name must trigger example signal"

    def test_structure_signal_detected(self):
        flags = _analyze_answer_quality(
            "Firstly, I identified the root cause. Secondly, I fixed the context filtering. Finally, I validated."
        )
        assert flags["has_structure_signal"] is True, \
            "Structured answer with firstly/secondly must trigger structure signal"

    def test_normal_short_precise_answer_not_flagged_as_filler(self):
        flags = _analyze_answer_quality("FastAPI. I chose it for async support and automatic docs generation.")
        assert flags["has_filler_heavy"] is False, \
            "A short precise answer must not be flagged as filler-heavy"
        assert flags["has_generic_opener"] is False


# ---------------------------------------------------------------------------
# Section 9: _evaluation_is_answered logic
# ---------------------------------------------------------------------------

class TestEvaluationIsAnswered:

    def test_silent_classification_is_not_answered(self):
        ev = _make_evaluation(score=0, classification="silent", answer_status="silent", raw_answer="")
        assert _evaluation_is_answered(ev) is False, \
            "Silent classification must not count as answered"

    def test_clarification_status_is_not_answered(self):
        ev = _make_evaluation(score=0, classification="", answer_status="clarification requested", raw_answer="")
        assert _evaluation_is_answered(ev) is False, \
            "Clarification status must not count as answered"

    def test_timeout_status_is_not_answered(self):
        ev = _make_evaluation(score=0, classification="", answer_status="timed out", raw_answer="")
        assert _evaluation_is_answered(ev) is False, \
            "Timed-out status must not count as answered"

    def test_strong_answer_with_text_is_answered(self):
        ev = _make_evaluation(score=8.0, classification="strong", raw_answer="I built FastAPI backend.")
        assert _evaluation_is_answered(ev) is True, \
            "Strong answer with text must count as answered"

    def test_partial_answer_with_text_is_answered(self):
        ev = _make_evaluation(score=4.0, classification="partial", raw_answer="I used Python for this.")
        assert _evaluation_is_answered(ev) is True, \
            "Partial answer with text must count as answered"

    def test_non_dict_input_returns_false_safely(self):
        assert _evaluation_is_answered(None) is False, "None must return False safely"
        assert _evaluation_is_answered("string") is False, "String must return False safely"
        assert _evaluation_is_answered([]) is False, "List must return False safely"


# ---------------------------------------------------------------------------
# Section 10: _classify_answer_strength
# ---------------------------------------------------------------------------

class TestClassifyAnswerStrength:

    def test_strong_classification_maps_to_strong(self):
        ev = _make_evaluation(score=9.0, classification="strong")
        assert _classify_answer_strength(ev) == "strong"

    def test_high_score_without_label_maps_to_strong(self):
        ev = _make_evaluation(score=8.5, classification="unknown")
        assert _classify_answer_strength(ev) == "strong"

    def test_mid_score_partial_maps_to_partial(self):
        ev = _make_evaluation(score=5.0, classification="partial")
        assert _classify_answer_strength(ev) == "partial"

    def test_zero_score_silent_maps_to_silent(self):
        ev = _make_evaluation(score=0, classification="silent", raw_answer="")
        assert _classify_answer_strength(ev) == "silent"

    def test_low_score_no_label_maps_to_weak(self):
        ev = _make_evaluation(score=2.0, classification="wrong", raw_answer="I don't know.")
        assert _classify_answer_strength(ev) == "weak"


# ---------------------------------------------------------------------------
# Section 11: compute_interview_summary edge cases
# ---------------------------------------------------------------------------

class TestComputeInterviewSummary:

    def test_open_question_reduces_closed_count(self):
        summary = compute_interview_summary(
            plan="pro",
            question_plan=_make_plan(10),
            total_turns=4,
            evaluations=[
                _make_evaluation(turn=1, score=8.0, classification="strong"),
                _make_evaluation(turn=2, score=6.0, classification="partial"),
                _make_evaluation(turn=3, score=7.0, classification="strong"),
            ],
            duration_seconds=120,
            runtime_state=_make_runtime(
                question_state=TURN_STATE_ACTIVE_QUESTION_OPEN,
                clarification_count=1,
                response_times=[18, 22, 15],
            ),
        )
        assert summary["planned_questions"] == 10
        assert summary["closed_questions"] == 3, \
            "Active open question must reduce closed count by 1 (4 turns - 1 open = 3)"
        assert summary["answered_questions"] == 3
        assert summary["clarification_count"] == 1
        assert summary["average_response_seconds"] == 18.3

    def test_waiting_clarification_reduces_closed_count(self):
        summary = compute_interview_summary(
            plan="pro",
            question_plan=_make_plan(10),
            total_turns=2,
            evaluations=[_make_evaluation(turn=1, score=7.0, classification="strong")],
            runtime_state=_make_runtime(
                question_state=TURN_STATE_WAITING_CLARIFICATION,
                clarification_count=1,
            ),
        )
        assert summary["closed_questions"] == 1, \
            "Waiting-clarification must subtract the open turn (2 - 1 = 1)"
        assert summary["answered_questions"] == 1
        assert summary["question_state"] == TURN_STATE_WAITING_CLARIFICATION

    def test_closed_question_state_does_not_reduce_count(self):
        summary = compute_interview_summary(
            plan="pro",
            question_plan=_make_plan(10),
            total_turns=3,
            evaluations=[
                _make_evaluation(turn=1, score=8.0, classification="strong"),
                _make_evaluation(turn=2, score=0, classification="silent", raw_answer=""),
            ],
            runtime_state=_make_runtime(
                question_state=TURN_STATE_QUESTION_CLOSED,
                timeout_count=1,
            ),
        )
        assert summary["closed_questions"] == 3, \
            "Closed question state must not reduce the closed count"
        assert summary["timeout_count"] == 1

    def test_zero_evaluations_produces_safe_zero_counts(self):
        summary = compute_interview_summary(
            plan="free",
            question_plan=_make_plan(5),
            total_turns=0,
            evaluations=[],
            runtime_state=_make_runtime(),
        )
        assert summary["answered_questions"] == 0
        assert summary["closed_questions"] == 0
        assert summary["completion_rate"] == 0.0
        assert summary["average_response_seconds"] is None

    def test_completion_rate_never_exceeds_100(self):
        summary = compute_interview_summary(
            plan="pro",
            question_plan=_make_plan(5),
            total_turns=10,   # more turns than planned
            evaluations=[_make_evaluation(turn=i + 1, score=8.0) for i in range(10)],
            runtime_state=_make_runtime(question_state=TURN_STATE_QUESTION_CLOSED),
        )
        assert summary["completion_rate"] <= 100.0, \
            "Completion rate must never exceed 100%"
        assert summary["closed_questions"] <= 5, \
            "Closed questions must be capped at planned_questions"

    def test_runtime_counters_come_from_runtime_state(self):
        summary = compute_interview_summary(
            plan="career",
            question_plan=_make_plan(13),
            total_turns=6,
            evaluations=[_make_evaluation(turn=i + 1) for i in range(5)],
            runtime_state=_make_runtime(
                clarification_count=2,
                timeout_count=1,
                skipped_count=0,
            ),
        )
        assert summary["clarification_count"] == 2, \
            "Clarification count must come from runtime_state"
        assert summary["timeout_count"] == 1, \
            "Timeout count must come from runtime_state"

    def test_answer_strength_distribution_is_correct(self):
        evals = [
            _make_evaluation(turn=1, score=9.0, classification="strong"),
            _make_evaluation(turn=2, score=6.0, classification="partial"),
            _make_evaluation(turn=3, score=0, classification="silent", raw_answer=""),
        ]
        summary = compute_interview_summary(
            plan="pro", question_plan=_make_plan(5), total_turns=3, evaluations=evals,
            runtime_state=_make_runtime(),
        )
        dist = summary["answer_strength_distribution"]
        assert dist["strong"] >= 1, "Must count at least one strong answer"
        assert dist["silent"] >= 1, "Must count at least one silent answer"


# ---------------------------------------------------------------------------
# Section 12: HR readiness level
# ---------------------------------------------------------------------------

class TestHRReadinessLevel:

    def test_zero_answered_is_not_ready(self):
        level = _compute_hr_readiness_level(
            final_score=0, completion_rate=0, answered_questions=0,
            planned_questions=10, silent_count=5, timeout_count=2, weak_ratio=1.0,
        )
        assert level == HR_READINESS_NOT_READY, \
            "Zero answered questions must be not_ready"

    def test_very_low_score_is_not_ready(self):
        level = _compute_hr_readiness_level(
            final_score=18, completion_rate=50, answered_questions=3,
            planned_questions=10, silent_count=1, timeout_count=0, weak_ratio=0.7,
        )
        assert level == HR_READINESS_NOT_READY

    def test_medium_score_partial_completion_is_progressing(self):
        level = _compute_hr_readiness_level(
            final_score=52, completion_rate=65, answered_questions=6,
            planned_questions=10, silent_count=0, timeout_count=1, weak_ratio=0.2,
        )
        assert level == HR_READINESS_PROGRESSING

    def test_high_score_full_completion_is_strong(self):
        level = _compute_hr_readiness_level(
            final_score=80, completion_rate=90, answered_questions=9,
            planned_questions=10, silent_count=0, timeout_count=0, weak_ratio=0.1,
        )
        assert level == HR_READINESS_STRONG

    def test_good_score_is_interview_ready(self):
        level = _compute_hr_readiness_level(
            final_score=65, completion_rate=80, answered_questions=8,
            planned_questions=10, silent_count=0, timeout_count=0, weak_ratio=0.2,
        )
        assert level == HR_READINESS_INTERVIEW_READY


# ---------------------------------------------------------------------------
# Section 13: Category feedback accuracy
# ---------------------------------------------------------------------------

class TestCategoryFeedback:

    def test_strong_technical_depth_feedback_is_specific(self):
        fb = _get_category_feedback("technical_depth", "strong")
        assert fb, "Strong feedback must not be empty"
        assert any(word in fb.lower() for word in ("depth", "tool", "decision", "outcome")), \
            "Strong technical feedback must be domain-specific"

    def test_weak_ownership_feedback_is_actionable(self):
        fb = _get_category_feedback("ownership", "weak")
        assert "personally" in fb.lower() or "own" in fb.lower() or "built" in fb.lower(), \
            "Weak ownership feedback must give actionable ownership guidance"

    def test_unknown_category_returns_non_empty_generic_fallback(self):
        fb = _get_category_feedback("completely_unknown_category_xyz", "partial")
        assert fb, "Unknown category must return a non-empty generic fallback"

    def test_all_strength_levels_produce_different_feedback_for_same_category(self):
        levels = ["strong", "good", "partial", "weak", "silent"]
        feedbacks = [_get_category_feedback("teamwork_pressure", level) for level in levels]
        unique = set(feedbacks)
        assert len(unique) == len(levels), \
            "Each strength level must produce distinct feedback for the same category"


# ---------------------------------------------------------------------------
# Section 14: Score band labeling
# ---------------------------------------------------------------------------

class TestScoreBand:

    def test_score_bands_are_correct(self):
        cases = [
            (90.0, "Exceptional"),
            (75.0, "Strong"),
            (60.0, "Competent"),
            (45.0, "Developing"),
            (30.0, "Foundational"),
            (10.0, "Needs Significant Work"),
            (0.0,  "Needs Significant Work"),
        ]
        for score, expected_band in cases:
            band = _get_score_band(score)
            assert band == expected_band, \
                f"Score {score} must map to '{expected_band}', got '{band}'"


# ---------------------------------------------------------------------------
# Section 15: Communication assessment
# ---------------------------------------------------------------------------

class TestCommunicationAssessment:

    def test_empty_evaluations_returns_unknown_level(self):
        result = _assess_communication_style([])
        assert result["clarity_level"] == "unknown", \
            "Empty evaluations must return unknown clarity level"

    def test_high_comm_scores_with_results_produce_clear_structured(self):
        evals = [
            _make_evaluation(
                raw_answer="I implemented the pipeline which improved accuracy by 35% measured over 200 runs.",
                communication_score=1.8,
            ),
            _make_evaluation(
                raw_answer="The result was a 40% reduction in latency. I validated with before-and-after benchmarks.",
                communication_score=1.9,
            ),
        ]
        result = _assess_communication_style(evals)
        assert result["clarity_level"] in {"clear_and_structured", "mostly_clear"}, \
            "High comm scores with result signals must produce clear/mostly_clear level"

    def test_filler_heavy_answers_produce_needs_improvement(self):
        filler = "umm i think basically like i mean you know honestly i guess umm yeah okay right"
        evals = [
            _make_evaluation(raw_answer=filler, communication_score=0.3),
            _make_evaluation(raw_answer=filler, communication_score=0.2),
        ]
        result = _assess_communication_style(evals)
        assert result["clarity_level"] in {"needs_improvement", "developing"}, \
            "Filler-heavy low-comm answers must produce needs_improvement or developing"


# ---------------------------------------------------------------------------
# Section 16: Per-question insights
# ---------------------------------------------------------------------------

class TestPerQuestionInsights:

    def test_insights_match_evaluation_count(self):
        evals = [_make_evaluation(turn=i + 1) for i in range(5)]
        insights = _generate_per_question_insights(evals)
        assert len(insights) == 5, "Must produce one insight per evaluation row"

    def test_strong_insight_references_what_worked(self):
        ev = _make_evaluation(score=9.0, classification="strong",
                              what_worked="Clear ownership and quantified result stated.")
        insights = _generate_per_question_insights([ev])
        assert "Clear ownership" in insights[0]["insight"] or insights[0]["strength_level"] == "strong", \
            "Strong answer insight must reference what worked"

    def test_silent_insight_states_no_answer(self):
        ev = _make_evaluation(score=0, classification="silent", raw_answer="",
                              answer_status="silent", what_worked="", what_missing="", how_to_improve="")
        insights = _generate_per_question_insights([ev])
        assert "no answer" in insights[0]["insight"].lower() or insights[0]["strength_level"] == "silent", \
            "Silent insight must state that no answer was recorded"

    def test_question_preview_is_truncated_correctly(self):
        long_q = "A" * 200
        ev = _make_evaluation(score=5.0, classification="partial")
        ev["question_text"] = long_q
        insights = _generate_per_question_insights([ev])
        assert len(insights[0]["question_preview"]) <= 123, \
            "Question preview must be truncated to at most 120 chars + ellipsis"


# ---------------------------------------------------------------------------
# Section 17: Improvement roadmap
# ---------------------------------------------------------------------------

class TestImprovementRoadmap:

    def test_roadmap_for_weak_technical_is_actionable(self):
        tips = _generate_improvement_roadmap(
            weak_categories=["technical_depth"],
            partial_categories=[],
        )
        assert len(tips) >= 1, "Must produce at least one tip for weak technical_depth"
        assert any("tool" in t.lower() or "method" in t.lower() or "measur" in t.lower() for t in tips), \
            "Technical tips must reference tools, methods, or measurement"

    def test_roadmap_for_no_weak_categories_uses_generic_defaults(self):
        tips = _generate_improvement_roadmap(weak_categories=[], partial_categories=[])
        assert len(tips) >= 1, "Must produce generic tips even when no weak categories"

    def test_roadmap_respects_max_tips_limit(self):
        tips = _generate_improvement_roadmap(
            weak_categories=["technical_depth", "ownership", "communication_explain",
                             "role_fit", "teamwork_pressure", "learning_growth"],
            partial_categories=["validation_metrics", "tradeoff_decision"],
            max_tips=5,
        )
        assert len(tips) <= 5, "Roadmap must respect the max_tips limit"

    def test_roadmap_produces_no_duplicate_tips(self):
        tips = _generate_improvement_roadmap(
            weak_categories=["technical_depth", "technical_depth"],
            partial_categories=["technical_depth"],
        )
        assert len(tips) == len(set(tips)), "Roadmap must not produce duplicate tips"


# ---------------------------------------------------------------------------
# Section 18: Premium report generation
# ---------------------------------------------------------------------------

class TestPremiumReport:

    def _make_full_evals(self) -> list[dict]:
        return [
            _make_evaluation(turn=1, category="introduction", score=8.0, classification="strong",
                             raw_answer="I am Rahul, an AI backend engineer. I built SignalBrief which improved news accuracy by 30%."),
            _make_evaluation(turn=2, category="technical_depth", score=7.5, classification="partial",
                             raw_answer="I used FastAPI for the backend, which handled async requests efficiently."),
            _make_evaluation(turn=3, category="ownership", score=9.0, classification="strong",
                             raw_answer="I personally owned the retrieval pipeline from design to deployment."),
            _make_evaluation(turn=4, category="role_fit", score=5.0, classification="partial",
                             raw_answer="I think I would be a good fit because I have experience in backend."),
            _make_evaluation(turn=5, category="learning_growth", score=2.0, classification="weak",
                             raw_answer="I am a fast learner.", communication_score=0.3),
        ]

    def test_premium_report_has_all_required_keys(self):
        report = compute_premium_interview_report(
            plan="pro",
            question_plan=_make_plan(10),
            total_turns=5,
            evaluations=self._make_full_evals(),
            final_score=62.5,
            category_scores={"technical_depth": 7.5, "ownership": 9.0},
            strengths=["Strong technical ownership", "Clear project explanation"],
            weaknesses=["Generic growth answer", "Shallow role-fit response"],
            duration_seconds=320,
            runtime_state=_make_runtime(question_state=TURN_STATE_QUESTION_CLOSED),
        )
        required_keys = {
            "plan", "final_score", "score_band", "completion_rate",
            "hr_readiness_level", "hr_readiness_label", "hr_readiness_description",
            "planned_questions", "answered_questions", "category_feedback",
            "communication_assessment", "per_question_insights",
            "improvement_roadmap", "hiring_assessment",
            "strengths", "weaknesses", "strong_categories", "weak_categories",
            "answer_strength_distribution",
        }
        for key in required_keys:
            assert key in report, f"Premium report must contain key: '{key}'"

    def test_premium_report_score_matches_input(self):
        report = compute_premium_interview_report(
            plan="pro", question_plan=_make_plan(5), total_turns=5,
            evaluations=self._make_full_evals(),
            final_score=72.3, category_scores={}, strengths=[], weaknesses=[],
        )
        assert report["final_score"] == 72.3, "Report final_score must match input"

    def test_premium_report_hiring_assessment_is_non_generic(self):
        report = compute_premium_interview_report(
            plan="career", question_plan=_make_plan(13), total_turns=5,
            evaluations=self._make_full_evals(),
            final_score=62.5, category_scores={},
            strengths=["Strong technical ownership"],
            weaknesses=["Shallow role-fit"],
            duration_seconds=300,
        )
        assessment = report["hiring_assessment"]
        assert len(assessment) > 50, "Hiring assessment must be a substantive paragraph"
        assert any(
            word in assessment.lower()
            for word in ("score", "answered", "candidate", "strength", "gap", "category", "interview")
        ), "Hiring assessment must reference specific performance data"

    def test_premium_report_all_strong_produces_strong_or_interview_ready(self):
        evals = [_make_evaluation(turn=i + 1, score=9.0, classification="strong",
                                  raw_answer="I built and owned this component end-to-end, achieving a 35% improvement.")
                 for i in range(10)]
        report = compute_premium_interview_report(
            plan="career", question_plan=_make_plan(10), total_turns=10,
            evaluations=evals, final_score=85.0, category_scores={},
            strengths=["Excellent ownership"], weaknesses=[],
            runtime_state=_make_runtime(question_state=TURN_STATE_QUESTION_CLOSED),
        )
        assert report["hr_readiness_level"] in {HR_READINESS_STRONG, HR_READINESS_INTERVIEW_READY}, \
            "All strong answers + high score must produce strong or interview_ready readiness"

    def test_premium_report_all_silent_produces_not_ready(self):
        evals = [
            _make_evaluation(turn=i + 1, score=0, classification="silent",
                             answer_status="silent", raw_answer="", communication_score=0)
            for i in range(5)
        ]
        report = compute_premium_interview_report(
            plan="free", question_plan=_make_plan(5), total_turns=5,
            evaluations=evals, final_score=0.0, category_scores={},
            strengths=[], weaknesses=["No answers provided"],
        )
        assert report["hr_readiness_level"] == HR_READINESS_NOT_READY, \
            "All silent answers must produce not_ready readiness"

    def test_premium_report_category_feedback_is_non_empty(self):
        report = compute_premium_interview_report(
            plan="pro", question_plan=_make_plan(5), total_turns=5,
            evaluations=self._make_full_evals(),
            final_score=62.5, category_scores={}, strengths=[], weaknesses=[],
        )
        assert len(report["category_feedback"]) >= 1, \
            "Category feedback list must contain at least one entry"
        for cf in report["category_feedback"]:
            assert cf["feedback"], f"Feedback for '{cf['category']}' must not be empty"

    def test_premium_report_improvement_roadmap_has_tips(self):
        report = compute_premium_interview_report(
            plan="pro", question_plan=_make_plan(5), total_turns=5,
            evaluations=self._make_full_evals(),
            final_score=55.0, category_scores={}, strengths=[], weaknesses=[],
        )
        assert len(report["improvement_roadmap"]) >= 1, \
            "Improvement roadmap must contain at least one actionable tip"


# ---------------------------------------------------------------------------
# Section 19: Resume field inference
# ---------------------------------------------------------------------------

class TestResumeFieldInference:

    def test_ai_backend_resume_maps_to_ai_ml_data(self):
        profile = infer_resume_field_profile(_ai_backend_resume())
        assert profile["broad_field"] == "ai_ml_data", \
            "AI/RAG/FastAPI resume must map to ai_ml_data"
        assert "role" in profile["target_role_label"].lower()

    def test_non_software_resume_maps_to_business_analyst(self):
        profile = infer_resume_field_profile(_non_software_resume())
        assert profile["broad_field"] == "business_analyst_operations", \
            "Business/ops resume must map to business_analyst_operations"


# ---------------------------------------------------------------------------
# Section 20: Career / difficult plan quality
# ---------------------------------------------------------------------------

class TestCareerDifficultPlanQuality:

    def test_career_difficult_plan_avoids_recruiter_loop(self):
        plan = _build_fallback_question_plan(
            "career", _ai_backend_resume(), 13, difficulty_mode="difficult", variant_seed=0
        )
        categories = [item["category"] for item in plan]
        assert categories.count("communication_explain") <= 1, \
            "Difficult plan must not repeat communication_explain more than once"

    def test_career_difficult_plan_escalates_to_depth_categories_early(self):
        plan = _build_fallback_question_plan(
            "career", _ai_backend_resume(), 13, difficulty_mode="difficult", variant_seed=0
        )
        depth_categories = {
            "ownership", "tradeoff_decision", "validation_metrics",
            "challenge_debugging", "role_fit",
        }
        early_cats = {item["category"] for item in plan[:4]}
        assert early_cats & depth_categories, \
            "Difficult plan must include a depth-focused category within the first 4 turns"

    def test_free_basic_plan_is_field_aware_for_non_software(self):
        plan = _build_fallback_question_plan(
            "free", _non_software_resume(), 5, difficulty_mode="basic", variant_seed=0
        )
        categories = [item["category"] for item in plan]
        assert categories[0] == "introduction", "First question must always be introduction"
        assert "studies_background" in categories[:3], \
            "studies_background must appear in first 3 turns for non-software fresher"
        assert "ownership" in categories[:4], \
            "ownership must appear in first 4 turns"


# ---------------------------------------------------------------------------
# Section 21: Family repeat rules
# ---------------------------------------------------------------------------

class TestFamilyRepeatRules:

    def test_second_communication_explain_is_blocked_in_career(self):
        asked = [
            "How would you explain this work to a non-technical interviewer, and why did it matter?"
        ]
        candidate = "Explain that clearly for a non-technical interviewer, then tell me the real impact."
        assert _question_family_from_text(candidate) == "communication_explain", \
            "Candidate must be detected as communication_explain family"
        assert _violates_family_repeat_rules(candidate, asked, plan="career") is True, \
            "Second communication_explain must be blocked in career plan"

    def test_question_family_detects_hire_question(self):
        assert _question_family_from_text("Why should we hire you for this role?") == "role_fit", \
            "Hire-you phrasing must map to role_fit"

    def test_question_family_detects_future_growth_question(self):
        assert _question_family_from_text(
            "Where do you see yourself in the next 3 to 5 years?"
        ) == "learning_growth", \
            "Future-growth phrasing must map to learning_growth"


# ---------------------------------------------------------------------------
# Section 22: Transcript recovery
# ---------------------------------------------------------------------------

class TestTranscriptRecovery:

    def test_technical_recovery_corrects_fastapi_typo(self):
        recovered = recover_technical_intent(
            "I used post ap and contacts filtering before the model response",
            question_text="What tool or method mattered most there, and why?",
            resume_summary=_ai_backend_resume(),
        )
        assert "FastAPI" in recovered, \
            "Technical recovery must normalize 'post ap' to FastAPI"
        assert "context filtering" in recovered.lower()

    def test_career_recovery_preserves_role_fit_language(self):
        recovered = recover_career_intent(
            "this matter because it make the system posted more accurate and more reliable for the role i want",
            question_text="Explain clearly for a non-technical interviewer, then tell me the real impact.",
            resume_summary=_ai_backend_resume(),
        )
        assert "role" in recovered.lower()
        assert "reliable" in recovered.lower()

    def test_summarize_recovered_intent_corrects_tool_names(self):
        summary = summarize_recovered_intent(
            "I use past 8 for backend and this prove I fit the role",
            question_text="Why should we hire you for the role you want next?",
            resume_summary=_ai_backend_resume(),
        )
        assert "fastapi" in summary.lower(), \
            "Summarizer must correct 'past 8' to FastAPI using resume context"
        assert "role" in summary.lower()


# ---------------------------------------------------------------------------
# Section 23: Better answer generation
# ---------------------------------------------------------------------------

class TestBetterAnswerGeneration:

    def test_pro_better_answer_preserves_tool_name(self):
        answer = _fallback_pro_better_answer(
            "What tool or technology did you use there, and what did it do?",
            "I used FastAPI for the backend workflow and structured responses",
            _ai_backend_resume(),
            "technical_depth",
        )
        assert "FastAPI" in answer, "Better answer must preserve the named tool"
        assert "tool" in answer.lower() or "fit" in answer.lower()

    def test_career_better_answer_references_project(self):
        answer = _fallback_career_better_answer(
            "Why are you targeting this kind of role, and what makes you a fit for it?",
            "I built the backend flow and improved answer quality",
            _ai_backend_resume(),
            "communication",
        )
        assert "SignalBrief" in answer or "role" in answer.lower(), \
            "Career better answer must reference the project or role context"

    def test_career_better_answer_preserves_user_decision_and_outcome(self):
        answer = _fallback_career_better_answer(
            "What trade-off mattered most there, and why did you land on that final choice?",
            "I chose context filtering because sending too much context was slow and noisy, "
            "and the result became faster and more accurate.",
            _ai_backend_resume(),
            "technical_depth",
        )
        lowered = answer.lower()
        assert "context filtering" in lowered, "Better answer must preserve the named method"
        assert "faster" in lowered or "accurate" in lowered, "Better answer must preserve the outcome"


# ---------------------------------------------------------------------------
# Section 24: Template quality
# ---------------------------------------------------------------------------

class TestTemplateQuality:

    def test_role_fit_template_references_hiring_or_fit(self):
        q = _question_template_for_category(
            "role_fit", "why a team should hire you for AI Engineer roles", 0, plan="career"
        )
        assert "hire" in q.lower() or "strong fit" in q.lower() or "fit" in q.lower(), \
            "role_fit template must reference hiring or fit"

    def test_closeout_template_references_growth_timeline(self):
        q = _question_template_for_category(
            "closeout", "how you want to grow in this field over the next 3 to 5 years", 0, plan="career"
        )
        assert "next 3 to 5 years" in q.lower() or "grow" in q.lower() or "future" in q.lower(), \
            "closeout template must reference growth or the 3-to-5 year timeline"


# ---------------------------------------------------------------------------
# Section 25: Coercion helpers (robustness)
# ---------------------------------------------------------------------------

class TestCoercionHelpers:

    def test_coerce_runtime_state_handles_dict(self):
        d = {"question_state": "active_question_open"}
        assert coerce_runtime_state(d) == d

    def test_coerce_runtime_state_handles_json_string(self):
        s = '{"question_state": "active_question_open"}'
        result = coerce_runtime_state(s)
        assert result["question_state"] == "active_question_open"

    def test_coerce_runtime_state_returns_empty_on_invalid(self):
        for bad in (None, 123, [], "not json", b"bytes"):
            result = coerce_runtime_state(bad)
            assert isinstance(result, dict), f"Must always return a dict, got: {type(result)}"

    def test_coerce_question_plan_items_handles_list(self):
        plan = [{"turn": 1, "category": "introduction"}, "bad_item", 42]
        result = coerce_question_plan_items(plan)
        assert len(result) == 1, "Must drop non-dict items"
        assert result[0]["turn"] == 1

    def test_coerce_question_plan_items_handles_json_string(self):
        plan_str = '[{"turn": 1, "category": "introduction"}, {"turn": 2, "category": "ownership"}]'
        result = coerce_question_plan_items(plan_str)
        assert len(result) == 2

    def test_coerce_question_plan_items_returns_empty_on_invalid(self):
        for bad in (None, 123, "not json", {}):
            result = coerce_question_plan_items(bad)
            assert isinstance(result, list), f"Must always return a list, got: {type(result)}"
