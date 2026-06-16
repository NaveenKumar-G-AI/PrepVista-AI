"""
PrepVista AI - Evaluator Scoring Engine
Extracted from evaluator.py - the main evaluate_single_question() entry
point, compute_final_score(), readiness summaries, and score interpretation.

Re-exported by evaluator.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict

import structlog

from app.config import CATEGORY_WEIGHTS, PLAN_CONFIG
from app.services.llm import call_llm_json
from app.services.prompts import build_per_question_eval_prompt
from app.services.resume_parser import infer_resume_field_profile
from app.services.transcript import (
    normalize_transcript,
    recover_spoken_meaning,
    recover_technical_intent,
    recover_career_intent,
    summarize_recovered_intent,
)

from app.services.evaluator_grounding import (
    STOPWORDS,
    DETAIL_HINTS,
    PRO_TECH_HINTS,
    CAREER_TECH_HINTS,
    _join_phrases_natural,
    _safe_text,
    _coerce_list,
    _coerce_resume_summary_dict,
    _resume_field_profile,
    _best_resume_project,
    _best_resume_tool,
    _question_family,
    _is_low_value_strength,
    _fallback_strength_from_evaluation,
    _field_label_for_feedback,
    _contains_any,
    _extract_grounding_facts,
    _worked_signal_for_family,
    _missing_signal_for_family,
    _improvement_for_family,
    _score_summary_for_family,
)
from app.services.evaluator_feedback import (
    _tokenize,
    _extract_resume_terms,
    _clamp_score,
    _sentence,
    _trim_to_sentence_count,
    _looks_like_placeholder_rewrite,
    _looks_too_generic_for_question,
    _normalize_user_facing_feedback,
    _normalize_content_label,
    _normalize_communication_label,
    normalize_rubric_category,
    _normalize_pro_answer_status,
    _pro_classification,
    _build_pro_communication_note,
    _build_career_interview_note,
    _fallback_corrected_intent,
    _timeout_status_from_raw,
    _has_answer_marker,
    _normalize_career_answer_status,
    _career_classification,
    _heuristic_pro_components,
    _answer_blueprint_for_family,
    _grounded_better_answer,
    _career_answer_blueprint,
    _heuristic_career_components,
    _free_status_from_metrics,
    _normalize_free_answer_status,
    _free_classification,
    _heuristic_free_components,
    _fallback_free_evaluation,
    _normalize_free_result,
    _fallback_pro_evaluation,
    _normalize_pro_result,
    _career_marker_response,
    _fallback_career_evaluation,
    _normalize_career_result,
    _fallback_evaluation,
    _fallback_better_answer,
    _fallback_pro_better_answer,
    _fallback_career_better_answer,
)

logger = structlog.get_logger("prepvista.evaluator")

async def evaluate_single_question(
    question_text: str,
    raw_answer: str,
    resume_summary: str,
    rubric_category: str,
    plan: str,
) -> dict:
    """
    Evaluate a single question-answer pair using the rubric system.
    Returns structured evaluation data.
    """
    rubric_category = normalize_rubric_category(question_text, rubric_category, plan)
    normalized_answer = (
        recover_spoken_meaning(raw_answer)
        if plan == "free"
        else recover_technical_intent(raw_answer, question_text, resume_summary)
        if plan == "pro"
        else recover_career_intent(raw_answer, question_text, resume_summary)
        if plan == "career"
        else normalize_transcript(raw_answer)
    )

    if _has_answer_marker(raw_answer) or not normalized_answer or normalized_answer in ["[NO_ANSWER_TIMEOUT]", ""]:
        if plan == "career":
            marker_response = _career_marker_response(raw_answer)
            if marker_response:
                return marker_response
        return {
            "classification": "silent",
            "score": 0,
            "relevance_score": 0,
            "clarity_score": 0,
            "specificity_score": 0,
            "structure_score": 0,
            "answer_status": _timeout_status_from_raw(raw_answer) if plan == "career" else "No answer",
            "content_understanding": "None",
            "depth_quality": "None" if plan == "career" else "",
            "communication_clarity": "None",
            "scoring_rationale": (
                "No answer captured for this question."
                if plan in {"free", "pro"}
                else "No answer provided."
            ),
            "missing_elements": (
                ["No answer captured for this question"]
                if plan in {"free", "pro"}
                else ["Candidate did not respond"]
            ),
            "ideal_answer": "",
            "communication_score": 0,
            "communication_notes": (
                _build_career_interview_note(question_text, rubric_category, _timeout_status_from_raw(raw_answer))
                if plan == "career"
                else "No response."
            ),
            "what_worked": (
                "You stayed in the interview flow until this question."
                if plan == "free"
                else "You stayed in the technical interview flow until this question."
                if plan == "pro"
                else "You reached the question."
            ),
            "what_was_missing": (
                "No answer was captured for this question."
                if plan == "free"
                else "No technical answer was captured for this question."
                if plan == "pro"
                else "No answer was given."
            ),
            "how_to_improve": (
                "Next time, start with one short direct sentence."
                if plan == "free"
                else "Next time, start with one direct method or step. A short technical answer is better than no answer."
                if plan == "pro"
                else "Try answering in 1-2 short sentences, even if you are unsure."
            ),
            "answer_blueprint": "Use this structure: direct answer -> one method/detail -> one result." if plan == "career" else "",
            "corrected_intent": "",
            "raw_answer": raw_answer,
            "normalized_answer": normalized_answer,
        }

    if plan == "free":
        eval_prompt = build_per_question_eval_prompt(
            question=question_text,
            normalized_answer=normalized_answer,
            resume_summary=resume_summary,
            rubric_category=rubric_category,
            plan=plan,
        )
        try:
            result = await call_llm_json(
                [{"role": "system", "content": eval_prompt}],
                temperature=0.15,
                max_tokens=420,
                retries=1,
                timeout=2.9,
                fallback_timeout=3.5,
                retry_delay=0.12,
                allow_provider_fallback=False,
            )
            return _normalize_free_result(
                raw_answer=raw_answer,
                normalized_answer=normalized_answer,
                question_text=question_text,
                resume_summary=resume_summary,
                rubric_category=rubric_category,
                llm_result=result if isinstance(result, dict) else {},
            )
        except Exception as exc:
            logger.warning("free_question_evaluation_failed", error=str(exc), question=question_text[:100])
            return _fallback_free_evaluation(
                question_text=question_text,
                raw_answer=raw_answer,
                normalized_answer=normalized_answer,
                resume_summary=resume_summary,
                rubric_category=rubric_category,
            )

    if plan == "pro":
        eval_prompt = build_per_question_eval_prompt(
            question=question_text,
            normalized_answer=normalized_answer,
            resume_summary=resume_summary,
            rubric_category=rubric_category,
            plan=plan,
        )
        try:
            result = await call_llm_json(
                [{"role": "system", "content": eval_prompt}],
                temperature=0.12,
                max_tokens=520,
                retries=1,
                timeout=3.2,
                fallback_timeout=4.0,
                retry_delay=0.12,
                allow_provider_fallback=False,
            )
            return _normalize_pro_result(
                raw_answer=raw_answer,
                normalized_answer=normalized_answer,
                question_text=question_text,
                resume_summary=resume_summary,
                rubric_category=rubric_category,
                llm_result=result if isinstance(result, dict) else {},
            )
        except Exception as exc:
            logger.warning("pro_question_evaluation_failed", error=str(exc), question=question_text[:100])
            return _fallback_pro_evaluation(
                question_text=question_text,
                raw_answer=raw_answer,
                normalized_answer=normalized_answer,
                resume_summary=resume_summary,
                rubric_category=rubric_category,
            )

    if plan == "career":
        eval_prompt = build_per_question_eval_prompt(
            question=question_text,
            normalized_answer=normalized_answer,
            resume_summary=resume_summary,
            rubric_category=rubric_category,
            plan=plan,
        )
        try:
            result = await call_llm_json(
                [{"role": "system", "content": eval_prompt}],
                temperature=0.1,
                max_tokens=620,
                retries=2,
                timeout=4.1,
                fallback_timeout=5.0,
                retry_delay=0.12,
                allow_provider_fallback=True,
            )
            return _normalize_career_result(
                raw_answer=raw_answer,
                normalized_answer=normalized_answer,
                question_text=question_text,
                resume_summary=resume_summary,
                rubric_category=rubric_category,
                llm_result=result if isinstance(result, dict) else {},
            )
        except Exception as exc:
            logger.warning("career_question_evaluation_failed", error=str(exc), question=question_text[:100])
            return _fallback_career_evaluation(
                question_text=question_text,
                raw_answer=raw_answer,
                normalized_answer=normalized_answer,
                resume_summary=resume_summary,
                rubric_category=rubric_category,
            )

    eval_prompt = build_per_question_eval_prompt(
        question=question_text,
        normalized_answer=normalized_answer,
        resume_summary=resume_summary,
        rubric_category=rubric_category,
        plan=plan,
    )

    try:
        result = await call_llm_json(
            [{"role": "system", "content": eval_prompt}],
            temperature=0.2,
            max_tokens=420,
            retries=1,
            timeout=3.2,
            fallback_timeout=4.0,
            retry_delay=0.15,
            allow_provider_fallback=False,
        )

        score = _clamp_score(result.get("score", 0), 10.0)
        comm_score = _clamp_score(result.get("communication_score", 0), 10.0)

        return {
            "classification": result.get("classification", "vague"),
            "score": score,
            "relevance_score": 0,
            "clarity_score": 0,
            "specificity_score": 0,
            "structure_score": 0,
            "answer_status": "",
            "content_understanding": "",
            "depth_quality": "",
            "communication_clarity": "",
            "scoring_rationale": result.get("scoring_rationale", ""),
            "missing_elements": result.get("missing_elements", []),
            "ideal_answer": result.get("ideal_answer", ""),
            "communication_score": comm_score,
            "communication_notes": result.get("communication_notes", ""),
            "what_worked": result.get("what_worked", ""),
            "what_was_missing": result.get("what_was_missing", ""),
            "how_to_improve": result.get("how_to_improve", ""),
            "answer_blueprint": "",
            "corrected_intent": "",
            "raw_answer": raw_answer,
            "normalized_answer": normalized_answer,
        }

    except Exception as exc:
        logger.error("question_evaluation_failed", error=str(exc), question=question_text[:100])
        fallback = _fallback_evaluation(raw_answer, normalized_answer)
        fallback["corrected_intent"] = ""
        return fallback


def _response_time_stats(question_evaluations: list[dict]) -> dict | None:
    times: list[float] = []
    for evaluation in question_evaluations:
        value = evaluation.get("answer_duration_seconds")
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if numeric <= 0:
            continue
        times.append(numeric)

    if not times:
        return None

    avg = sum(times) / len(times)
    return {
        "avg": round(avg, 1),
        "min": round(min(times), 1),
        "max": round(max(times), 1),
    }


def _apply_response_time_guidance(
    strengths: list[str],
    improvements: list[str],
    question_evaluations: list[dict],
) -> None:
    stats = _response_time_stats(question_evaluations)
    if not stats:
        return

    avg = stats["avg"]
    if avg >= 90:
        tip = "Aim to deliver your main point within 60-90 seconds by leading with the result and adding 1-2 key details."
        if tip not in improvements:
            improvements.insert(0, tip)
        return

    if avg <= 12:
        tip = "Take a brief pause to structure answers; aim for 25-60 seconds so your response feels complete."
        if tip not in improvements:
            improvements.insert(0, tip)
        return

    strength = "You kept a steady response pace without long pauses."
    if strength not in strengths and not strengths:
        strengths.append(strength)


def _resolve_expected_questions(plan: str | None, expected_questions: int | None, observed_questions: int) -> int:
    try:
        normalized_expected = int(expected_questions or 0)
    except (TypeError, ValueError):
        normalized_expected = 0

    if normalized_expected > 0:
        return max(observed_questions, normalized_expected)

    plan_cfg = PLAN_CONFIG.get((plan or "free").lower().strip(), PLAN_CONFIG["free"])
    try:
        configured_turns = int(plan_cfg.get("max_turns") or 0)
    except (TypeError, ValueError):
        configured_turns = 0

    return max(observed_questions, configured_turns)


def _top_readiness_dimensions(question_evaluations: list[dict], limit: int = 2) -> list[str]:
    labels = {
        "introduction": "background framing",
        "project_ownership": "ownership",
        "technical_depth": "technical depth",
        "problem_solving": "problem-solving",
        "behavioral": "behavioral examples",
        "communication": "role-fit communication",
        "situational_judgment": "situational judgment",
        "creative_thinking": "creative thinking",
        "ai_tool_fluency": "AI tool fluency",
    }
    grouped: dict[str, list[float]] = {}
    for item in question_evaluations:
        category = _safe_text(item.get("rubric_category", "")).lower()
        if not category:
            continue
        grouped.setdefault(category, []).append(float(item.get("score", 0) or 0))
    ranked = sorted(
        (
            (sum(scores) / max(len(scores), 1), labels.get(category, category.replace("_", " ")))
            for category, scores in grouped.items()
            if scores
        ),
        key=lambda pair: pair[0],
        reverse=True,
    )
    return [label for _, label in ranked[:limit]]


def _best_answer_style_for_evaluations(question_evaluations: list[dict], plan: str = "career") -> str:
    grouped: dict[str, list[float]] = {}
    for item in question_evaluations:
        category = _safe_text(item.get("rubric_category", "")).lower()
        if not category:
            continue
        grouped.setdefault(category, []).append(float(item.get("score", 0) or 0))

    weakest_category = ""
    if grouped:
        weakest_category = min(
            grouped.items(),
            key=lambda pair: sum(pair[1]) / max(len(pair[1]), 1),
        )[0]

    mapping = {
        "introduction": "Best answer style for you: who you are -> strongest area -> proof -> goal.",
        "project_ownership": "Best answer style for you: what you owned -> decision -> result.",
        "technical_depth": "Best answer style for you: method -> why you used it -> what changed.",
        "problem_solving": "Best answer style for you: problem -> action -> result -> lesson.",
        "behavioral": "Best answer style for you: situation -> action -> result -> lesson.",
        "communication": (
            "Best answer style for you: fit signal -> proof point -> why it matters for the role."
            if plan == "career"
            else "Best answer style for you: simple explanation -> impact -> why it mattered."
        ),
    }
    return mapping.get(
        weakest_category,
        "Best answer style for you: start with the context, then explain your action, the reason for that choice, and the final result.",
    )


def _derive_free_strengths_and_improvements(question_evaluations: list[dict]) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    improvements: list[str] = []
    categories = [str(item.get("rubric_category") or "") for item in question_evaluations]
    answered = [item for item in question_evaluations if item.get("classification") != "silent"]
    classifications = [str(item.get("classification") or "") for item in question_evaluations]

    for evaluation in question_evaluations:
        worked = _safe_text(evaluation.get("what_worked", ""))
        improve = _safe_text(evaluation.get("how_to_improve", ""))
        if worked and not _is_low_value_strength(worked) and worked not in strengths:
            strengths.append(_sentence(worked, worked))
        if improve and improve not in improvements:
            improvements.append(_sentence(improve, improve))

    ranked_evaluations = sorted(
        question_evaluations,
        key=lambda item: float(item.get("score", 0) or 0),
        reverse=True,
    )
    for evaluation in ranked_evaluations:
        fallback_strength = _fallback_strength_from_evaluation(evaluation)
        if fallback_strength and fallback_strength not in strengths:
            strengths.append(fallback_strength)
        if len(strengths) >= 2:
            break

    _apply_response_time_guidance(strengths, improvements, question_evaluations)

    fallback_strengths = [
        ("technical_depth" in categories or "project_ownership" in categories, "Shows strong interest in practical project and technology work."),
        ("project_ownership" in categories, "Connects project answers to a real part of the work instead of staying fully generic."),
        (any(cls in classifications for cls in {"strong", "partial"}), "Shows effort to connect answers to real work instead of only giving keywords."),
        (bool(answered), "Stays engaged with the interview instead of skipping difficult questions."),
    ]
    for condition, item in fallback_strengths:
        if condition and item not in strengths:
            strengths.append(item)
        if len(strengths) >= 2:
            break

    fallback_improvements = [
        "Structure your introduction as: background -> skills -> goal.",
        "Explain one concrete feature or step when you describe a project.",
        "Describe one tool with a simple example of how you used it.",
    ]
    for item in fallback_improvements:
        if item not in improvements:
            improvements.append(item)
        if len(improvements) >= 3:
            break

    if not answered:
        strengths = []
        improvements = [
            "Try answering every question in at least one short sentence.",
            "Use a simple structure: main point -> one detail.",
            "If you are unsure, still explain what you remember clearly.",
        ]

    return strengths[:2], improvements[:3]


def _derive_pro_strengths_and_improvements(question_evaluations: list[dict]) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    improvements: list[str] = []

    for evaluation in question_evaluations:
        worked = _safe_text(evaluation.get("what_worked", ""))
        improve = _safe_text(evaluation.get("how_to_improve", ""))
        if worked and not _is_low_value_strength(worked) and not any(term in worked.lower() for term in ["nothing", "lack", "lacks", "weak", "unclear", "failed", "missing"]) and worked not in strengths:
            strengths.append(_sentence(worked, worked))
        if improve and improve not in improvements:
            improvements.append(_sentence(improve, improve))

    ranked_evaluations = sorted(
        question_evaluations,
        key=lambda item: float(item.get("score", 0) or 0),
        reverse=True,
    )
    for evaluation in ranked_evaluations:
        fallback_strength = _fallback_strength_from_evaluation(evaluation)
        if fallback_strength and fallback_strength not in strengths:
            strengths.append(fallback_strength)
        if len(strengths) >= 3:
            break

    _apply_response_time_guidance(strengths, improvements, question_evaluations)

    categories = [str(item.get("rubric_category") or "") for item in question_evaluations]
    classifications = [str(item.get("classification") or "") for item in question_evaluations]

    if len(strengths) < 3:
        fallback_strengths = [
            ("project_ownership" in categories, "You stayed grounded in real project context across technical questions."),
            (any(cat in categories for cat in ["problem_solving", "technical_depth"]), "You showed awareness of technical decisions, testing, or system behavior."),
            (any(cls in classifications for cls in ["strong", "partial"]), "Your answers were often relevant even when they needed more depth."),
            (True, "You tried to connect real work, decisions, or methods instead of speaking only in abstractions."),
        ]
        for condition, item in fallback_strengths:
            if condition and item not in strengths:
                strengths.append(item)
            if len(strengths) >= 3:
                break

    if len(improvements) < 4:
        fallback_improvements = [
            "Answer in this order: method -> reason -> result.",
            "Mention one concrete tool, test, metric, or technical choice in every technical answer.",
            "When explaining a fix, say what changed after the fix.",
            "Use short complete sentences instead of fragmented keyword-only answers.",
        ]
        for item in fallback_improvements:
            if item not in improvements:
                improvements.append(item)
            if len(improvements) >= 4:
                break

    return strengths[:3], improvements[:4]


def build_pro_readiness_summary(
    question_evaluations: list[dict],
    expected_questions: int | None = None,
) -> dict:
    strengths, improvements = _derive_pro_strengths_and_improvements(question_evaluations)
    total = len(question_evaluations)
    resolved_expected_questions = _resolve_expected_questions("pro", expected_questions, total)
    completion_ratio = (
        min(1.0, total / resolved_expected_questions)
        if resolved_expected_questions > 0
        else 1.0
    )

    if total == 0:
        return {
            "technical_interview_impression": "The report does not have enough completed technical answers yet to judge Pro readiness.",
            "current_technical_readiness": "Early",
            "main_blocker": "Too little completed technical interview evidence",
            "fastest_next_improvement": "Complete a full Pro interview with short but usable technical answers.",
        }

    avg_score = round(sum(float(item.get("score", 0)) for item in question_evaluations) / total, 1)
    weak_delivery_count = sum(
        1
        for item in question_evaluations
        if _safe_text(item.get("communication_clarity")) in {"None", "Weak", "Basic"}
    )
    weak_depth_count = sum(
        1
        for item in question_evaluations
        if float(item.get("clarity_score", 0) or 0) < 1.0 or float(item.get("specificity_score", 0) or 0) < 1.0
    )
    first_gap = _safe_text(next((item.get("what_was_missing") for item in question_evaluations if _safe_text(item.get("what_was_missing"))), ""))
    strongest_dims = _top_readiness_dimensions(question_evaluations)
    strongest_dims_phrase = f", especially in {', '.join(strongest_dims)}" if strongest_dims else ""

    if completion_ratio < 0.6:
        readiness = "Early"
        blocker = (
            f"Only {total} of {resolved_expected_questions} planned questions were completed, so the technical signal is still incomplete."
        )
    elif avg_score >= 7.6:
        readiness = "Strong"
        blocker = first_gap or "The main remaining blocker is making every strong idea sound consistently sharp."
    elif avg_score >= 5.8:
        readiness = "Moderate"
        blocker = (
            "Unclear technical delivery is holding back otherwise relevant answers."
            if weak_delivery_count >= max(2, total // 3)
            else first_gap or "The main blocker is inconsistent technical depth across answers."
        )
    elif avg_score >= 4.2:
        readiness = "Moderate-low"
        blocker = (
            "The answers need clearer technical delivery and stronger method detail."
            if weak_depth_count >= max(2, total // 3)
            else first_gap or "The main blocker is inconsistent technical structure."
        )
    else:
        readiness = "Early"
        blocker = first_gap or "The answers were too short or too unclear to show reliable technical depth."

    return {
        "technical_interview_impression": (
            f"This interview shows real technical potential{strongest_dims_phrase}. The strongest next gains will come from sharper method detail and more controlled delivery."
            if avg_score >= 5.8
            else "This interview shows relevant technical signals, but the answers still need clearer structure, better delivery, and stronger concrete detail."
        ),
        "current_technical_readiness": readiness,
        "main_blocker": blocker.rstrip("."),
        "fastest_next_improvement": (
            improvements[0]
            if improvements
            else "Answer technical questions in the order: method -> reason -> result."
        ),
    }


def _is_valid_career_strength(text: str) -> bool:
    normalized = _safe_text(text).lower()
    if not normalized:
        return False
    negative_terms = (
        "nothing",
        "lack",
        "lacks",
        "weak",
        "unclear",
        "failed",
        "missing",
        "no answer",
        "not enough",
        "too short",
        "too shallow",
        "did not",
        "didn't",
        "needs",
    )
    return not any(term in normalized for term in negative_terms)


def _derive_career_strengths_and_improvements(question_evaluations: list[dict]) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    improvements: list[str] = []

    for evaluation in question_evaluations:
        worked = _safe_text(evaluation.get("what_worked", ""))
        improve = _safe_text(evaluation.get("how_to_improve", ""))
        if _is_valid_career_strength(worked) and not _is_low_value_strength(worked) and worked not in strengths:
            strengths.append(_sentence(worked, worked))
        if improve and improve not in improvements:
            improvements.append(_sentence(improve, improve))

    ranked_evaluations = sorted(
        question_evaluations,
        key=lambda item: float(item.get("score", 0) or 0),
        reverse=True,
    )
    for evaluation in ranked_evaluations:
        fallback_strength = _fallback_strength_from_evaluation(evaluation)
        if fallback_strength and fallback_strength not in strengths:
            strengths.append(fallback_strength)
        if len(strengths) >= 4:
            break

    _apply_response_time_guidance(strengths, improvements, question_evaluations)

    categories = [str(item.get("rubric_category") or "") for item in question_evaluations]
    answered = [item for item in question_evaluations if item.get("classification") != "silent"]
    avg_score = round(sum(float(item.get("score", 0)) for item in question_evaluations) / max(len(question_evaluations), 1), 1)

    if len(strengths) < 4:
        fallback_strengths = [
            ("project_ownership" in categories, "Shows clear ownership signals instead of relying on generic project descriptions."),
            ("technical_depth" in categories, "Connects technical choices to how the system actually worked."),
            ("problem_solving" in categories, "Shows awareness of real constraints, fixes, and reliability concerns."),
            ("communication" in categories, "Attempts to explain technical work in a way that recruiters and panels can follow."),
            (avg_score >= 5.5, "You kept several answers relevant to the question even when they still needed sharper structure."),
            (bool(answered), "You used real work examples instead of avoiding difficult interview topics."),
        ]
        for condition, item in fallback_strengths:
            if condition and item not in strengths:
                strengths.append(item)
            if len(strengths) >= 4:
                break

    if len(improvements) < 5:
        fallback_improvements = [
            "Add one measurable result, outcome, or user impact in every important answer.",
            "Use the format: context -> action -> reason -> result.",
            "When describing a technical decision, explain the trade-off or constraint behind it.",
            "State your exact ownership clearly before explaining the broader project.",
            "For technical answers, include one method, one trade-off, and one outcome.",
        ]
        for item in fallback_improvements:
            if item not in improvements:
                improvements.append(item)
            if len(improvements) >= 5:
                break

    return strengths[:4], improvements[:5]


def _infer_best_fit_role(resume_summary) -> str:
    summary = _coerce_resume_summary_dict(resume_summary)
    field_profile = _resume_field_profile(summary)
    target_role_label = _safe_text(field_profile.get("target_role_label"))
    if target_role_label:
        normalized_label = target_role_label.replace(" roles", "").strip()
        if normalized_label:
            return normalized_label[0].upper() + normalized_label[1:]
    inferred_role = _safe_text(summary.get("inferred_role", "")).lower()
    skills_blob = " ".join(_safe_text(item) for item in (summary.get("skills") or []))
    combined = f"{inferred_role} {skills_blob}".lower()

    if any(term in combined for term in ["ai", "llm", "rag", "nlp", "machine learning", "ml", "data science"]):
        return "AI Engineer Intern"
    if any(term in combined for term in ["fastapi", "backend", "api", "postgresql", "supabase"]):
        return "Backend AI Intern"
    if any(term in combined for term in ["model", "evaluation", "training", "classification"]):
        return "ML Intern"
    return "Software Engineer Intern"


def build_career_readiness_summary(
    question_evaluations: list[dict],
    resume_summary,
    expected_questions: int | None = None,
) -> dict:
    strengths, improvements = _derive_career_strengths_and_improvements(question_evaluations)
    total = len(question_evaluations)
    resolved_expected_questions = _resolve_expected_questions("career", expected_questions, total)
    role_fit = _infer_best_fit_role(resume_summary)
    completion_ratio = (
        min(1.0, total / resolved_expected_questions)
        if resolved_expected_questions > 0
        else 1.0
    )
    if total == 0:
        recruiter_impression = "Not enough completed answers were captured to form a reliable hiring-panel impression yet."
        technical_readiness = "Low"
        round_1_likelihood = "Too little evidence to judge round-one readiness"
        main_blocker = "Insufficient completed interview evidence"
        fastest_next = "Complete a full career interview with direct, complete answers."
        next_goals = [
            "Complete a full interview without skipping questions.",
            "Answer every question in clear complete sentences.",
            "Add one concrete example in each answer.",
        ]
        return {
            "recruiter_impression": recruiter_impression,
            "technical_readiness": technical_readiness,
            "role_fit": role_fit,
            "main_blocker": main_blocker,
            "fastest_next_improvement": fastest_next,
            "round_1_likelihood": round_1_likelihood,
            "interview_impression": recruiter_impression,
            "shortlist_signal": round_1_likelihood,
            "top_hiring_risk": main_blocker,
            "fastest_improvement": fastest_next,
            "best_sample_answer_style": _best_answer_style_for_evaluations(question_evaluations, "career"),
            "current_readiness": technical_readiness,
            "best_fit_role": role_fit,
            "main_hiring_blocker": main_blocker,
            "next_practice_goals": next_goals,
        }

    avg_score = round(sum(float(item.get("score", 0)) for item in question_evaluations) / total, 1)
    strong_count = sum(1 for item in question_evaluations if float(item.get("score", 0)) >= 7.5)
    weak_count = sum(1 for item in question_evaluations if float(item.get("score", 0)) < 5.0)
    timed_out = sum(1 for item in question_evaluations if _safe_text(item.get("answer_status")) in {"Timed out", "System cut off"})
    weakest_missing = _safe_text(next((item.get("what_was_missing") for item in question_evaluations if _safe_text(item.get("what_was_missing"))), ""))
    strongest_dims = _top_readiness_dimensions(question_evaluations)
    strongest_dims_phrase = f" The clearest signals are currently in {', '.join(strongest_dims)}." if strongest_dims else ""
    main_blocker = weakest_missing.rstrip(".") if weakest_missing else "The answers need clearer structure and stronger ownership evidence"
    fastest_next = improvements[0] if improvements else "Use context -> action -> reason -> result more consistently."
    next_goals = improvements[:3] if improvements else [
        "Add one measurable outcome in every answer.",
        "State your ownership earlier.",
        "Explain one trade-off in technical answers.",
    ]

    if avg_score >= 7.8 and strong_count >= max(3, total // 4):
        technical_readiness = "Strong"
        round_1_likelihood = "Likely to clear round 1 with a few sharper examples"
        recruiter_impression = f"Strong ownership and decision-making signals are visible, and the interview already feels close to shortlist level.{strongest_dims_phrase}"
    elif avg_score >= 6.2:
        technical_readiness = "Moderate"
        round_1_likelihood = "Borderline for round 1 - sharper structure and outcomes would improve confidence"
        recruiter_impression = f"Technically promising, but the panel would still want clearer structure, stronger outcomes, and more recruiter-ready delivery.{strongest_dims_phrase}"
    else:
        technical_readiness = "Moderate-low" if avg_score >= 5.0 else "Low"
        round_1_likelihood = "Unlikely to clear round 1 yet - the answers need stronger depth and hiring-focused clarity"
        recruiter_impression = f"There are useful raw signals here, but the current answers do not yet build consistent hiring confidence.{strongest_dims_phrase}"

    if timed_out:
        top_risk = "Some answers were not completed, which weakens recruiter confidence even when underlying knowledge may be present."
    elif weak_count >= max(2, total // 3):
        top_risk = weakest_missing or "Several answers stayed too shallow for a premium hiring-panel round."
    else:
        top_risk = "The main hiring risk is inconsistent depth and decision clarity across answers."

    if completion_ratio < 0.6:
        technical_readiness = "Low"
        round_1_likelihood = "Not enough interview evidence yet - too few planned questions were completed"
        main_blocker = (
            f"Only {total} of {resolved_expected_questions} planned questions were completed, "
            "so recruiter confidence would stay low even if some answers were strong."
        )
        top_risk = main_blocker
    elif completion_ratio < 1.0:
        if technical_readiness == "Strong":
            technical_readiness = "Moderate"
        round_1_likelihood = "Partial interview evidence only - finish more questions for a reliable round-one signal"
        if "planned questions" not in top_risk.lower():
            top_risk = (
                f"Only {total} of {resolved_expected_questions} planned questions were completed, "
                "so the hiring signal is still incomplete."
            )
        main_blocker = top_risk.rstrip(".")

    if timed_out and "completed" not in main_blocker.lower():
        main_blocker = "Incomplete answers reduced hiring confidence on some high-signal questions"

    return {
        "recruiter_impression": recruiter_impression,
        "technical_readiness": technical_readiness,
        "role_fit": role_fit,
        "main_blocker": main_blocker,
        "fastest_next_improvement": fastest_next,
        "round_1_likelihood": round_1_likelihood,
        "interview_impression": recruiter_impression,
        "shortlist_signal": round_1_likelihood,
        "top_hiring_risk": top_risk,
        "fastest_improvement": fastest_next,
        "best_sample_answer_style": _best_answer_style_for_evaluations(question_evaluations, "career"),
        "current_readiness": technical_readiness,
        "best_fit_role": role_fit,
        "main_hiring_blocker": main_blocker,
        "next_practice_goals": next_goals,
    }


def compute_final_score(
    question_evaluations: list[dict],
    plan: str | None = None,
    expected_questions: int | None = None,
) -> dict:
    """
    Deterministic final score aggregation from per-question evaluations.
    The LLM does not generate this score. This is computed by the backend.
    """
    if not question_evaluations:
        return {
            "final_score": 0,
            "category_scores": {},
            "total_questions": 0,
            "answered_questions": 0,
            "expected_questions": int(expected_questions or 0) if expected_questions else 0,
            "completion_rate": 0,
            "strongest_category": None,
            "weakest_category": None,
            "strengths": [],
            "weaknesses": [],
        }

    observed_questions = len(question_evaluations)
    resolved_expected_questions = _resolve_expected_questions(plan, expected_questions, observed_questions)

    category_scores = defaultdict(list)
    comm_scores = []
    all_scores = []

    for q in question_evaluations:
        score = float(q.get("score", 0))
        category = q.get("rubric_category", "technical_depth")
        category_scores[category].append(score)
        all_scores.append(score)
        comm_scores.append(float(q.get("communication_score", 0)))

    category_averages = {
        cat: round(sum(scores) / len(scores), 1)
        for cat, scores in category_scores.items()
    }

    if comm_scores:
        category_averages["communication"] = round(sum(comm_scores) / len(comm_scores), 1)

    weighted_sum = 0
    total_weight = 0
    for cat, weight in CATEGORY_WEIGHTS.items():
        if cat in category_averages:
            weighted_sum += category_averages[cat] * weight
            total_weight += weight

    if total_weight > 0:
        base_score = round((weighted_sum / total_weight) * 10)
    else:
        base_score = round(sum(all_scores) / len(all_scores) * 10) if all_scores else 0

    coverage_ratio = (
        min(1.0, observed_questions / resolved_expected_questions)
        if resolved_expected_questions > 0
        else 1.0
    )
    final_score = round(base_score * coverage_ratio)

    final_score = max(0, min(100, final_score))

    sorted_cats = sorted(category_averages.items(), key=lambda item: item[1], reverse=True)
    strongest = sorted_cats[0][0] if sorted_cats else None
    weakest = sorted_cats[-1][0] if sorted_cats else None
    answered = len([q for q in question_evaluations if q.get("classification") != "silent"])

    if plan == "free":
        strengths, weaknesses = _derive_free_strengths_and_improvements(question_evaluations)
    elif plan == "pro":
        strengths, weaknesses = _derive_pro_strengths_and_improvements(question_evaluations)
    elif plan == "career":
        strengths, weaknesses = _derive_career_strengths_and_improvements(question_evaluations)
    else:
        strengths = [f"Strong in {cat.replace('_', ' ')}" for cat, score in sorted_cats if score >= 7][:3]
        weaknesses = [f"Improve {cat.replace('_', ' ')}" for cat, score in sorted_cats if score < 5][:3]

    return {
        "final_score": final_score,
        "category_scores": category_averages,
        "total_questions": observed_questions,
        "answered_questions": answered,
        "expected_questions": resolved_expected_questions,
        "completion_rate": round(coverage_ratio * 100, 1),
        "strongest_category": strongest,
        "weakest_category": weakest,
        "strengths": strengths,
        "weaknesses": weaknesses,
    }


def get_score_interpretation(score: int, plan: str | None = None) -> str:
    """Human-readable interpretation of the final score."""
    if plan == "free":
        if score >= 80:
            return "Strong start - your answers are clear and confident for beginner interviews."
        if score >= 65:
            return "Good progress - keep adding clearer details and examples."
        if score >= 45:
            return "Developing well - your ideas are there, but they need better structure."
        if score >= 25:
            return "Early practice stage - keep answers short, clear, and specific."
        return "Just getting started - answer every question in simple sentences and build from there."

    if plan == "pro":
        if score >= 85:
            return "Strong technical readiness - your answers show clear understanding, relevant detail, and solid follow-through."
        if score >= 70:
            return "Good technical progress - your core understanding is visible, and sharper structure will make the answers stronger."
        if score >= 55:
            return "Developing technical depth - the ideas are often relevant, but the answers need clearer method detail and stronger explanation."
        if score >= 40:
            return "Needs sharper technical answers - focus on method, test, metric, and result in every response."
        return "Early technical practice stage - keep answers short but complete, and explain what you used, why you used it, and what changed."

    if plan == "career":
        if score >= 85:
            return "Strong placement readiness - your answers show ownership, layered technical thinking, and recruiter-ready delivery."
        if score >= 70:
            return "Good career-round performance - the core signals are strong, and sharper outcomes or trade-offs would improve shortlist confidence."
        if score >= 55:
            return "Moderate readiness - your knowledge is visible, but the answers need stronger structure, ownership framing, and impact detail."
        if score >= 40:
            return "Career round needs improvement - focus on context, decision, trade-off, and result in every important answer."
        return "Early career-round stage - build answers that clearly show ownership, method, and final outcome."

    if score >= 85:
        return "Excellent - You're well-prepared for real interviews."
    if score >= 70:
        return "Good - You're close to interview-ready. Focus on your weak areas."
    if score >= 55:
        return "Developing - You have some strengths, but need more practice in key areas."
    if score >= 40:
        return "Needs Work - Significant improvement needed. Focus on fundamentals."
    return "Early Stage - Keep practicing. Review the ideal answers to understand what interviewers expect."
