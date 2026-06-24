"""
PrepVista AI - Interviewer Question Engine
Extracted from interviewer.py - question generation, follow-up building,
retry logic, clarification handling, and answer signal profiling.

Re-exported by interviewer.py (barrel file) for backward compatibility.
"""

import json
import re
from typing import Any

import structlog

from app.config import PLAN_CONFIG, SESSION_COVERAGE_TARGETS, normalize_difficulty_mode
from app.services.llm import call_llm
from app.services.transcript import normalize_transcript, clean_for_display
from app.services.interview_summary import (
    TURN_OUTCOME_CLARIFICATION,
    TURN_OUTCOME_TIMEOUT,
    TURN_OUTCOME_SYSTEM_CUTOFF,
)

from app.services.interviewer_constants import (
    QUESTION_FAMILIES,
    QUESTION_PLAN_CATEGORY_ALIASES,
    VALID_QUESTION_PLAN_CATEGORIES,
    VALID_QUESTION_PLAN_DIFFICULTIES,
    QUESTION_STYLE_HINTS,
    REPEAT_REQUEST_PHRASES,
    STUDY_SIGNAL_TERMS,
    ROLE_SIGNAL_TERMS,
    STRENGTH_SIGNAL_TERMS,
    DECISION_SIGNAL_TERMS,
    VALIDATION_SIGNAL_TERMS,
    TEAM_SIGNAL_TERMS,
    GROWTH_SIGNAL_TERMS,
    WORKFLOW_SIGNAL_TERMS,
    OWNERSHIP_SIGNAL_TERMS,
    TECHNICAL_SIGNAL_TERMS,
    QUESTION_CUE_PREFIXES,
    QUESTION_INTRO_PREFIXES,
    QUESTION_SIGNATURE_REPLACEMENTS,
    QUESTION_STOP_WORDS,
    POSITIVE_SIGNAL_TERMS,
)
from app.services.interviewer_helpers import (
    _coerce_question_plan,
    _coerce_resume_summary_dict,
    _resume_highlight,
    _clean_ai_response,
    _resume_field_profile,
    _resume_primary_project,
    _resume_primary_skill,
    _resume_target_role,
    _field_focus_angle,
    _get_next_plan_item,
    _normalize_topic_label,
    _contains_any,
    _extract_family_history,
    _trim_family_history,
    _normalize_candidate_name,
    _resume_answer_terms,
    _short_target_role_label,
    _extract_answer_anchor_facts,
    _build_answer_anchor_summary,
    _extract_answer_coverage,
    _derive_redundant_followup_families,
    _build_answer_led_followup,
    _should_force_answer_led_followup,
)

logger = structlog.get_logger("prepvista.interviewer")

def _answer_signal_profile(answer_text: str, resume_summary: dict | None = None) -> dict[str, bool]:
    """Extract a few concrete answer signals to make live follow-ups more human and answer-led."""
    normalized_answer = normalize_transcript(answer_text or "", aggressive=True).lower()
    resume_terms = _resume_answer_terms(resume_summary or {})
    resume_term_hit = any(term and term in normalized_answer for term in resume_terms)

    return {
        "mentions_project": _contains_any(normalized_answer, ["project", "internship", "demo", "system"]) or resume_term_hit,
        "mentions_degree": _contains_any(normalized_answer, list(STUDY_SIGNAL_TERMS)),
        "mentions_role_goal": _contains_any(normalized_answer, list(ROLE_SIGNAL_TERMS)),
        "mentions_strength": _contains_any(normalized_answer, list(STRENGTH_SIGNAL_TERMS)),
        "mentions_decision": _contains_any(normalized_answer, list(DECISION_SIGNAL_TERMS)),
        "mentions_validation": _contains_any(normalized_answer, list(VALIDATION_SIGNAL_TERMS)),
        "mentions_team": _contains_any(normalized_answer, list(TEAM_SIGNAL_TERMS)),
        "mentions_growth": _contains_any(normalized_answer, list(GROWTH_SIGNAL_TERMS)),
        "mentions_workflow": _contains_any(normalized_answer, list(WORKFLOW_SIGNAL_TERMS)),
        "mentions_ownership": _contains_any(normalized_answer, list(OWNERSHIP_SIGNAL_TERMS)),
        "mentions_method": _contains_any(normalized_answer, list(TECHNICAL_SIGNAL_TERMS)),
        "mentions_outcome": _contains_any(
            normalized_answer,
            ["faster", "accuracy", "accurate", "reliable", "consistent", "stable", "focused", "output", "result"],
        ),
    }


def _is_ambiguous_followup_question(question_text: str) -> bool:
    """Detect vague follow-ups that can confuse a beginner after a good answer."""
    normalized = _strip_question_intro(normalize_transcript(question_text or "", aggressive=True).lower())
    if not normalized:
        return False

    ambiguous_openers = (
        "why did that matter",
        "why does that matter",
        "why did that help",
        "how did that help",
        "what changed because of that",
        "what did that change",
        "explain that clearly",
        "explain that simply",
        "tell me more about that",
        "can you explain that",
        "how would you explain that",
    )
    if any(normalized.startswith(prefix) for prefix in ambiguous_openers):
        return True

    return normalized in {
        "why did that matter?",
        "why does that matter?",
        "explain that clearly.",
        "explain that simply.",
    }


def _is_easy_to_understand_question(question_text: str) -> bool:
    """Keep the next question short, concrete, and easy to follow."""
    normalized = _strip_question_intro(normalize_transcript(question_text or "", aggressive=True).lower())
    if not normalized or _is_ambiguous_followup_question(normalized):
        return False

    words = [word for word in re.split(r"\s+", normalized) if word]
    if len(words) > 22:
        return False

    if normalized.count("?") > 1:
        return False

    if normalized.count(" and ") >= 2:
        return False

    return True


def _select_next_plan_item(
    question_plan,
    upcoming_turn: int,
    *,
    avoid_families: set[str] | None = None,
    recent_session_memory: dict[str, Any] | None = None,
) -> dict | None:
    """Pick the next planned item while softly skipping angles the candidate already covered."""
    avoid_families = {family for family in (avoid_families or set()) if family in QUESTION_FAMILIES}
    candidate_items = _get_future_plan_items(question_plan, upcoming_turn)
    if not candidate_items:
        return None

    recent_session_memory = recent_session_memory or {}
    recent_target_signatures = set(recent_session_memory.get("recent_target_signatures") or set())
    recent_angle_signatures = set(recent_session_memory.get("recent_angle_signatures") or set())
    recent_position_signatures = set(recent_session_memory.get("recent_position_signatures") or set())

    scored_non_blocked: list[tuple[tuple[int, int, int], dict]] = []
    scored_blocked: list[tuple[tuple[int, int, int], dict]] = []

    for index, item in enumerate(candidate_items):
        category = _normalize_plan_category(str(item.get("category") or "communication_explain"))
        target = str(item.get("target") or "").strip()
        item_turn = int(item.get("turn", upcoming_turn) or upcoming_turn)
        penalty = 0

        target_signature = _plan_target_signature(category, target) if target else ""
        angle_signature = f"{category}:{_plan_target_angle(category, target)}"
        position_signature = f"{item_turn}:{category}"

        if target_signature and target_signature in recent_target_signatures:
            penalty += 4
        if angle_signature in recent_angle_signatures:
            penalty += 3
        if position_signature in recent_position_signatures:
            penalty += 2

        score = (penalty, max(0, item_turn - upcoming_turn), index)
        if category in avoid_families:
            scored_blocked.append((score, item))
        else:
            scored_non_blocked.append((score, item))

    if scored_non_blocked:
        scored_non_blocked.sort(key=lambda entry: entry[0])
        return scored_non_blocked[0][1]

    if scored_blocked:
        scored_blocked.sort(key=lambda entry: entry[0])
        return scored_blocked[0][1]

    return candidate_items[0]


def _extract_skip_topics(skip_topics_value: Any) -> list[str]:
    """Safely normalize stored skip-topics data."""
    if isinstance(skip_topics_value, list):
        return [str(item).strip() for item in skip_topics_value if str(item).strip()]
    if isinstance(skip_topics_value, str):
        try:
            parsed = json.loads(skip_topics_value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            if skip_topics_value.strip():
                return [skip_topics_value.strip()]
    return []


def _trim_skip_topics(skip_topics: list[str], max_items: int = 8) -> list[str]:
    """Keep skip-topics bounded so prompt/context stays small."""
    deduped: list[str] = []
    for topic in skip_topics:
        topic_clean = topic.strip()
        if topic_clean and topic_clean not in deduped:
            deduped.append(topic_clean)
    return deduped[-max_items:]


def _safe_json_dumps(value: Any) -> str:
    """Serialize safely for DB JSON columns.

    ✅ IMPROVED: Now logs a structured warning on failure so unexpected
    un-serializable objects surface in the log stream instead of silently
    defaulting to an empty container. The fallback behaviour is unchanged —
    buyers and enterprise auditors expect every mutation to be traceable.
    """
    try:
        return json.dumps(value)
    except Exception as exc:
        logger.warning(
            "safe_json_dumps_failed",
            value_type=type(value).__name__,
            error=str(exc),
        )
        return json.dumps([] if isinstance(value, list) else {})


def _question_retry_limit(plan: str, difficulty_mode: str) -> int:
    """Return a stable per-question retry limit without changing the public plan shape."""
    cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
    selected_mode = normalize_difficulty_mode(difficulty_mode)
    if selected_mode == "basic":
        return 1
    return max(1, int(cfg.get("question_retry_limit") or 1))


def _record_turn_outcome(
    runtime_state: dict,
    outcome: str,
    *,
    question_state: str,
    answer_duration_seconds: int | None = None,
    exited_early: bool | None = None,
) -> dict:
    """Keep bounded runtime counters so reports and finish scoring share the same truth."""
    next_state = dict(runtime_state or {})
    next_state["last_outcome"] = outcome
    next_state["question_state"] = question_state

    if outcome == TURN_OUTCOME_CLARIFICATION:
        next_state["clarification_count"] = int(next_state.get("clarification_count") or 0) + 1
    elif outcome == TURN_OUTCOME_TIMEOUT:
        next_state["timeout_count"] = int(next_state.get("timeout_count") or 0) + 1
    elif outcome == TURN_OUTCOME_SYSTEM_CUTOFF:
        next_state["system_cutoff_count"] = int(next_state.get("system_cutoff_count") or 0) + 1

    if exited_early is not None:
        next_state["exited_early"] = bool(exited_early)

    if answer_duration_seconds is not None and answer_duration_seconds >= 0:
        durations = next_state.get("question_response_times")
        if not isinstance(durations, list):
            durations = []
        durations = [int(item) for item in durations[-24:] if isinstance(item, (int, float))]
        durations.append(int(answer_duration_seconds))
        next_state["question_response_times"] = durations[-24:]

    return next_state


def _dedupe_preserve_order(values: list[str], max_items: int) -> list[str]:
    """Keep the most recent ordered strings without duplicates.

    Iterates from the end of the list so that when max_items is reached,
    the newest entries are retained rather than the oldest.  The result
    is returned in original (chronological) order.
    """
    seen: set[str] = set()
    kept: list[str] = []
    for value in reversed(values):
        cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        kept.append(cleaned)
        if len(kept) >= max_items:
            break
    # Restore chronological order (most recent last)
    kept.reverse()
    return kept


def _plan_target_signature(category: str, target: str) -> str:
    """Normalize a question-plan target for cross-session cooldown checks."""
    return f"{_normalize_plan_category(category, fallback='communication_explain')}:{_normalize_topic_label(target)}"


def _question_angle_from_text(question_text: str, fallback_category: str = "communication_explain") -> str:
    """Capture the finer interview angle so semantic repeats are easier to block."""
    normalized = normalize_transcript(question_text or "", aggressive=True).lower()
    family = _question_family_from_text(question_text, fallback_category)
    if not normalized:
        return family

    if family in {"role_fit", "closeout"}:
        if any(term in normalized for term in ["first 30 days", "first month", "first 90 days", "first priority", "focus on first", "if we hired you", "joined this role"]):
            return "early_impact"
        if any(term in normalized for term in ["stand out", "stronger fit", "compared to", "choose you over"]):
            return "differentiation"
        if any(term in normalized for term in ["why should we hire", "trust you early", "add value early", "contribute quickly"]):
            return "hireability"
        if any(term in normalized for term in ["remember you", "remember most", "final point", "leave with"]):
            return "memorable_close"
        if any(term in normalized for term in ["why this role", "right next step", "targeting", "interests you"]):
            return "motivation"
        if any(term in normalized for term in ["best proves you fit", "fit the role", "background fit", "good fit"]):
            return "fit_proof"
    if family == "learning_growth":
        if any(term in normalized for term in ["five years", "ten years", "next few years", "grow over"]):
            return "future_growth"
        return "current_growth"
    if family == "teamwork_pressure":
        if any(term in normalized for term in ["conflict", "disagreement", "stakeholder"]):
            return "conflict_feedback"
        if any(term in normalized for term in ["deadline", "pressure", "time pressure"]):
            return "deadline_pressure"
        if "feedback" in normalized:
            return "feedback_change"
        return "teamwork_example"
    if family == "communication_explain":
        if any(term in normalized for term in ["non-technical", "recruiter", "simple terms"]):
            return "nontechnical_explain"
        return "practical_explain"
    if family == "validation_metrics":
        if any(term in normalized for term in ["what would you improve next", "what changed in the result"]):
            return "result_and_next"
        return "measurement"
    if family == "challenge_debugging":
        if any(term in normalized for term in ["constraint", "failure", "judgment"]):
            return "constraint_judgment"
        return "problem_fix"
    # ✅ ADDED: sub-angles for new families so angle-repeat rules work correctly.
    if family == "situational_judgment":
        if any(term in normalized for term in ["ethical", "skip a step", "adjust a number", "integrity"]):
            return "sjt_ethics"
        if any(term in normalized for term in ["team member", "underperforming", "not contributing"]):
            return "sjt_team"
        if any(term in normalized for term in ["conflicting", "two seniors", "contradicting"]):
            return "sjt_conflict"
        if any(term in normalized for term in ["deadline", "quality", "on time with gaps"]):
            return "sjt_deadline"
        return "sjt_general"
    if family == "creative_thinking":
        if any(term in normalized for term in ["how many", "estimate", "fermi"]):
            return "creative_estimation"
        if any(term in normalized for term in ["sell", "pitch"]):
            return "creative_pitch"
        if any(term in normalized for term in ["improve", "redesign", "product"]):
            return "creative_product"
        return "creative_general"
    if family == "ai_tool_fluency":
        if any(term in normalized for term in ["verify", "check", "validate", "how do you know"]):
            return "ai_verification"
        if any(term in normalized for term in ["when would you not", "when not to use", "limits", "limitations"]):
            return "ai_limits"
        if any(term in normalized for term in ["integrity", "disclose", "yours", "genuinely"]):
            return "ai_integrity"
        return "ai_usage"
    # ✅ ADDED: sub-angles for the four new families so angle-repeat rules work.
    if family == "self_assessment":
        if any(term in normalized for term in ["rate yourself", "scale of", "score yourself", "where would you rate", "rate your"]):
            return "self_rating"
        return "self_critique"
    if family == "programming_language":
        return "language_depth"
    if family == "skill_verification":
        return "skill_depth"
    if family == "certification":
        return "cert_application"
    return family


def _plan_target_angle(category: str, target: str) -> str:
    normalized_category = _normalize_plan_category(category, fallback="communication_explain")
    seed_text = f"{normalized_category} {target}".strip()
    return _question_angle_from_text(seed_text, normalized_category)


def _is_recruiter_language_question(text: str) -> bool:
    normalized = normalize_transcript(text or "", aggressive=True).lower()
    recruiter_terms = (
        "recruiter",
        "hiring panel",
        "non-technical",
        "role you want",
        "why should we hire",
        "remember you",
    )
    return any(term in normalized for term in recruiter_terms)


def _question_family_from_text(question_text: str, fallback_category: str = "communication_explain") -> str:
    normalized = normalize_transcript(question_text or "", aggressive=True).lower()
    fallback_family = _normalize_plan_category(fallback_category, fallback="communication_explain")
    if not normalized:
        return fallback_family

    if any(phrase in normalized for phrase in ["tell me about yourself", "introduce yourself", "background and strongest"]):
        return "introduction"
    if any(phrase in normalized for phrase in ["what are you studying", "which year are you", "current studies", "background are you in"]):
        return "studies_background"
    if any(phrase in normalized for phrase in ["strength", "strongest fit", "why should we hire", "best proves you fit", "better than other", "compared to others", "first priority if you were hired", "if we hired you", "first thing you would focus on", "first 30 days", "first month", "first 90 days", "trust you early", "add value early", "contribute quickly"]):
        return "role_fit"
    if any(phrase in normalized for phrase in ["what did you personally own", "what part was mainly yours", "your responsibility", "what exactly did you own"]):
        return "ownership"
    if any(phrase in normalized for phrase in ["workflow", "architecture", "pipeline", "process from", "walk me through the flow"]):
        return "workflow_process"
    if any(phrase in normalized for phrase in ["what tool", "what technology", "why did you use", "what did that tool", "what method"]):
        return "tool_method"
    if any(phrase in normalized for phrase in ["what changed in the result", "what would you improve next", "how did you validate", "what evidence", "measure", "metric", "benchmark", "validate", "validation", "tested", "test case"]):
        return "validation_metrics"
    if any(phrase in normalized for phrase in ["trade-off", "tradeoff", "what choice", "what decision", "balanced", "final choice"]):
        return "tradeoff_decision"
    if any(phrase in normalized for phrase in ["challenge", "bug", "debug", "failure", "issue", "constraint", "problem"]):
        return "challenge_debugging"
    if any(phrase in normalized for phrase in ["team", "pressure", "feedback", "deadline", "ownership under pressure", "worked with others"]):
        return "teamwork_pressure"
    if any(phrase in normalized for phrase in ["improving", "growth", "learning", "weakness", "what are you actively improving", "where do you see yourself", "five years", "ten years"]):
        return "learning_growth"
    if _is_recruiter_language_question(normalized):
        if any(phrase in normalized for phrase in ["why should we hire", "role you want", "fit for", "why are you targeting"]):
            return "role_fit"
        if any(phrase in normalized for phrase in ["remember you", "closeout", "final"]):
            return "closeout"
        return "communication_explain"
    if any(phrase in normalized for phrase in ["why this role", "fit for the role", "targeting this role", "strong fit"]):
        return "role_fit"
    if any(phrase in normalized for phrase in ["what should the panel remember", "final reason", "close out", "closeout", "first 30 days", "first month", "first 90 days"]):
        return "closeout"
    if any(phrase in normalized for phrase in ["explain that simply", "simple terms", "clear way", "non technical"]):
        return "communication_explain"
    # ✅ ADDED: classifiers for the four new families. Placed BEFORE the
    # situational/creative/ai checks because those use broad phrases (e.g.
    # "how would you handle", "how many") that would otherwise swallow a
    # specific programming/skill question. Each phrase below is deliberately
    # narrow so genuine SJT/creative questions are not mis-attributed.
    if any(phrase in normalized for phrase in [
        "rate yourself", "how would you rate yourself", "on a scale of", "score yourself",
        "where would you rate yourself", "how do you assess your own", "honest self assessment",
        "estimate yourself", "overestimate", "underestimate", "over-estimate", "under-estimate",
        "how do you evaluate your own", "how strong would you say you are",
        "rate your strongest", "rate your own",
    ]):
        return "self_assessment"
    if any(phrase in normalized for phrase in [
        "certification", "certificate", "certified", "credential",
        "the course you completed", "what did you learn from the", "online course you",
        "from your aws", "from your google", "from your azure",
    ]):
        return "certification"
    if any(phrase in normalized for phrase in [
        "in python", "in java", "in c++", "in javascript", "in sql", "in c#", "in golang",
        "syntax", "language feature", "list and tuple", "list vs tuple", "pointer",
        "memory management", "time complexity", "garbage collection", "data type",
        "this language", "that language", "the language you", "language behind",
    ]):
        return "programming_language"
    if any(phrase in normalized for phrase in [
        "you list", "you listed", "rate your skill", "prove your skill", "how proficient",
        "how strong is your", "how deep is your", "you put down", "skill on your resume",
        "your real depth in", "your depth in", "how comfortable are you with",
    ]):
        return "skill_verification"
    # ✅ ADDED: Three new families (Report §3.3, §3.4, §3.8 / §6.2 categories #15-17).
    # These are already in QUESTION_FAMILIES/QUESTION_PLAN_CATEGORY_ALIASES (lines 443-481)
    # but were never classifiable from question text, so retry / followup / coverage
    # tracking silently fell back to communication_explain for every SJT/creative/AI question.
    if any(phrase in normalized for phrase in [
        "what would you do if", "what would you do when", "how would you handle",
        "how would you respond if", "how do you proceed", "what would be your next step if",
        "imagine you are", "suppose your", "you discover a mistake after",
        "two seniors give you", "one team member is not contributing",
        "client is frustrated", "asked to skip a step",
    ]):
        return "situational_judgment"
    if any(phrase in normalized for phrase in [
        "how many", "estimate how", "fermi", "if you were a household",
        "sell me this", "sell me a", "analogy", "lateral thinking",
        "no budget", "no internet", "how would you improve",
        "improve this app", "pattern in this sequence", "next number in",
    ]):
        return "creative_thinking"
    if any(phrase in normalized for phrase in [
        "how do you use ai", "chatgpt", "copilot", "cursor", "llm",
        "ai-generated", "ai generated", "ai output", "verify ai", "check ai",
        "when would you not use ai", "when would you choose not to use",
        "ai-assisted work", "ai tool", "prompt engineering",
        "academic integrity", "professional integrity around ai",
    ]):
        return "ai_tool_fluency"
    return fallback_family


def _recent_question_families(asked_questions: list[str], limit: int = 3) -> list[str]:
    families: list[str] = []
    for question in asked_questions[-limit:]:
        families.append(_question_family_from_text(question))
    return families


def _recent_question_angles(asked_questions: list[str], limit: int = 3) -> list[str]:
    angles: list[str] = []
    for question in asked_questions[-limit:]:
        angles.append(_question_angle_from_text(question))
    return angles


def _violates_family_repeat_rules(
    candidate_text: str,
    asked_questions: list[str] | None,
    *,
    plan: str,
    allow_same_family: bool = False,
) -> bool:
    if allow_same_family:
        return False
    asked_questions = asked_questions or []
    candidate_family = _question_family_from_text(candidate_text)
    candidate_angle = _question_angle_from_text(candidate_text)
    recent_families = _recent_question_families(asked_questions, limit=2)
    recent_angles = _recent_question_angles(asked_questions, limit=2)
    family_counts: dict[str, int] = {}
    angle_counts: dict[str, int] = {}
    for question in asked_questions:
        family = _question_family_from_text(question)
        angle = _question_angle_from_text(question)
        family_counts[family] = family_counts.get(family, 0) + 1
        angle_counts[angle] = angle_counts.get(angle, 0) + 1

    if recent_families and recent_families[-1] == candidate_family:
        return True
    if recent_angles and recent_angles[-1] == candidate_angle and candidate_angle in {
        "hireability",
        "differentiation",
        "fit_proof",
        "memorable_close",
        "early_impact",
        "motivation",
        "current_growth",
        "future_growth",
    }:
        return True
    if len(recent_families) == 2 and recent_families[0] == recent_families[1] == candidate_family:
        return True
    if len(recent_angles) == 2 and recent_angles[0] == recent_angles[1] == candidate_angle and candidate_angle not in {
        "ownership",
        "workflow_process",
        "tool_method",
        "validation_metrics",
        "tradeoff_decision",
    }:
        return True
    hard_limits = {
        "free": {
            "introduction": 1,
            "studies_background": 1,
            "communication_explain": 1,
            "closeout": 1,
        },
        "pro": {
            "introduction": 1,
            "studies_background": 1,
            "communication_explain": 1,
            "closeout": 1,
            "learning_growth": 1,
            "role_fit": 2,
            # ✅ ADDED: new families — each adds genuine variety; more than one in a
            # session makes the interview feel repetitive rather than comprehensive.
            "situational_judgment": 1,
            "creative_thinking": 1,
            "ai_tool_fluency": 1,
            # ✅ ADDED: four new families — one appearance per session each.
            "programming_language": 1,
            "skill_verification": 1,
            "certification": 1,
            "self_assessment": 1,
        },
        "career": {
            "introduction": 1,
            "studies_background": 1,
            "communication_explain": 1,
            "closeout": 1,
            "learning_growth": 1,
            "role_fit": 2,
            # ✅ ADDED: same as pro — limit each new family to one appearance per session.
            "situational_judgment": 1,
            "creative_thinking": 1,
            "ai_tool_fluency": 1,
            # ✅ ADDED: four new families — one appearance per session each.
            "programming_language": 1,
            "skill_verification": 1,
            "certification": 1,
            "self_assessment": 1,
        },
    }.get(plan, {})
    if family_counts.get(candidate_family, 0) >= int(hard_limits.get(candidate_family, 99)):
        return True
    angle_limits = {
        "free": {
            "hireability": 1,
            "differentiation": 1,
            "fit_proof": 1,
            "memorable_close": 1,
            "early_impact": 1,
            "motivation": 1,
            "current_growth": 1,
            "future_growth": 1,
        },
        "pro": {
            "hireability": 1,
            "differentiation": 1,
            "fit_proof": 1,
            "memorable_close": 1,
            "early_impact": 1,
            "motivation": 1,
            "future_growth": 1,
            # ✅ ADDED: self-assessment sub-angles capped once each (pro + career).
            "self_rating": 1,
            "self_critique": 1,
        },
        "career": {
            "hireability": 1,
            "differentiation": 1,
            "fit_proof": 1,
            "memorable_close": 1,
            "early_impact": 1,
            "motivation": 1,
            "future_growth": 1,
            # ✅ ADDED: self-assessment sub-angles capped once each (pro + career).
            "self_rating": 1,
            "self_critique": 1,
        },
    }.get(plan, {})
    if angle_counts.get(candidate_angle, 0) >= int(angle_limits.get(candidate_angle, 99)):
        return True
    if plan == "career" and candidate_family == "communication_explain":
        communication_count = sum(
            1 for question in asked_questions
            if _question_family_from_text(question) == "communication_explain"
        )
        if communication_count >= 1:
            return True
    return False


def _resolve_item_difficulty(plan: str, item_difficulty: str, difficulty_mode: str) -> str:
    """Blend plan difficulty with the selected difficulty mode."""
    selected_mode = normalize_difficulty_mode(difficulty_mode)
    normalized_item = _normalize_plan_difficulty(item_difficulty or "medium")

    if selected_mode == "auto":
        return normalized_item
    if selected_mode == "basic":
        return "easy"
    if selected_mode == "medium":
        if plan == "free":
            return "easy"
        return "medium"
    if selected_mode == "difficult":
        if plan == "free":
            return "medium"
        return "hard"
    return normalized_item


def _normalize_plan_category(value: str, fallback: str = "communication") -> str:
    normalized = normalize_transcript(value or "", aggressive=True).lower().strip().replace(" ", "_")
    if normalized in QUESTION_PLAN_CATEGORY_ALIASES:
        return QUESTION_PLAN_CATEGORY_ALIASES[normalized]
    if normalized in VALID_QUESTION_PLAN_CATEGORIES:
        return normalized
    fallback_normalized = normalize_transcript(fallback or "communication_explain", aggressive=True).lower().strip().replace(" ", "_")
    return QUESTION_PLAN_CATEGORY_ALIASES.get(fallback_normalized, "communication_explain")


def _normalize_plan_difficulty(value: str, fallback: str = "medium") -> str:
    normalized = normalize_transcript(value or "", aggressive=True).lower().strip()
    return normalized if normalized in VALID_QUESTION_PLAN_DIFFICULTIES else fallback


def _sanitize_plan_target(category: str, target: str, fallback_target: str = "") -> str:
    """Keep plan targets short and subject-like so generated questions stay natural."""
    cleaned = clean_for_display(target or "") or ""
    cleaned = re.sub(r"\s+", " ", cleaned).strip()[:180]
    fallback_clean = clean_for_display(fallback_target or "") or cleaned
    fallback_clean = re.sub(r"\s+", " ", fallback_clean).strip()[:180]
    if not cleaned:
        return fallback_clean

    normalized = normalize_transcript(cleaned, aggressive=True).lower().strip()
    normalized_category = _normalize_plan_category(category, fallback="communication_explain")
    word_count = len([word for word in cleaned.split() if word.strip()])
    connector_count = normalized.count(" or ") + normalized.count(",") + normalized.count(" and ")

    if "?" in cleaned or normalized.startswith(
        (
            "what ",
            "how ",
            "why ",
            "which ",
            "who ",
            "where ",
            "when ",
            "tell ",
            "share ",
            "give ",
            "walk me through",
            "explain ",
            "can you",
            "could you",
        )
    ):
        return fallback_clean
    if word_count > 18:
        return fallback_clean
    if connector_count >= 3 and word_count >= 10:
        return fallback_clean

    noisy_fragments = (
        "question",
        "candidate",
        "interview",
        "learning curve",
        "project, internship, or practical example",
        "from your resume",
    )
    if any(fragment in normalized for fragment in noisy_fragments) and normalized_category in {
        "challenge_debugging",
        "validation_metrics",
        "tradeoff_decision",
        "role_fit",
        "closeout",
    }:
        return fallback_clean

    category_cues = {
        "role_fit": ("role", "fit", "hire", "strength", "stand out", "remember", "first priority", "30 days", "focus on first"),
        "closeout": ("remember", "final", "first priority", "30 days", "grow", "leave"),
        "teamwork_pressure": ("team", "pressure", "feedback", "deadline", "conflict", "stakeholder"),
        "learning_growth": ("improv", "growth", "weakness", "better", "years"),
        "communication_explain": ("explain", "simple", "non technical", "practical", "clear"),
        "ownership": ("own", "respons", "handled", "built", "implemented"),
        "validation_metrics": ("measure", "metric", "compare", "validate", "check", "evidence"),
        "tradeoff_decision": ("trade", "choice", "decision", "constraint", "option"),
    }
    cues = category_cues.get(normalized_category)
    if cues and not any(cue in normalized for cue in cues) and (word_count >= 8 or connector_count >= 2):
        return fallback_clean

    return cleaned


def _normalize_generated_question_plan(
    plan: str,
    question_plan,
    resume_summary,
    max_turns: int,
    difficulty_mode: str = "auto",
    variant_seed: int = 0,
) -> list[dict]:
    """Validate and normalize a generated question plan, then backfill gaps safely."""
    from app.services.interviewer_coverage import _build_fallback_question_plan
    fallback_plan = _build_fallback_question_plan(
        plan,
        resume_summary,
        max_turns,
        difficulty_mode=difficulty_mode,
        variant_seed=variant_seed,
    )
    raw_items = [item for item in (question_plan or []) if isinstance(item, dict)]
    if not raw_items:
        return fallback_plan

    def _normalize_candidate(source_item: dict, fallback_item: dict | None = None) -> dict | None:
        fallback_item = fallback_item or {}
        category = _normalize_plan_category(
            str(source_item.get("category") or fallback_item.get("category") or "communication"),
            fallback=str(fallback_item.get("category") or "communication"),
        )
        difficulty = _normalize_plan_difficulty(
            str(source_item.get("difficulty") or fallback_item.get("difficulty") or "medium"),
            fallback=str(fallback_item.get("difficulty") or "medium"),
        )
        target = _sanitize_plan_target(
            category,
            str(source_item.get("target") or ""),
            str(fallback_item.get("target") or ""),
        )
        target = re.sub(r"\s+", " ", target).strip()[:180]
        if not target:
            return None
        return {
            "category": category,
            "family": category,
            "target": target,
            "difficulty": _resolve_item_difficulty(plan, difficulty, difficulty_mode),
            "_signature": f"{category}:{_normalize_topic_label(target)}",
        }

    normalized_raw_candidates: list[dict] = []
    seen_raw_signatures: set[str] = set()
    for raw_item in raw_items:
        candidate = _normalize_candidate(raw_item)
        if not candidate:
            continue
        signature = str(candidate.get("_signature") or "")
        if signature in seen_raw_signatures:
            continue
        seen_raw_signatures.add(signature)
        normalized_raw_candidates.append(candidate)

    if not normalized_raw_candidates:
        return fallback_plan

    raw_by_category: dict[str, list[dict]] = {}
    for candidate in normalized_raw_candidates:
        raw_by_category.setdefault(str(candidate.get("category") or "communication_explain"), []).append(candidate)

    used_signatures: set[str] = set()
    normalized_items: list[dict] = []

    def _take_category_candidate(category: str) -> dict | None:
        for candidate in raw_by_category.get(category, []):
            signature = str(candidate.get("_signature") or "")
            if signature and signature not in used_signatures:
                used_signatures.add(signature)
                return candidate
        return None

    for fallback_item in fallback_plan[:max_turns]:
        fallback_candidate = _normalize_candidate(fallback_item, fallback_item)
        if not fallback_candidate:
            continue
        category = str(fallback_candidate.get("category") or "communication_explain")
        candidate = _take_category_candidate(category) or fallback_candidate
        normalized_items.append(
            {
                "turn": len(normalized_items) + 1,
                "category": category,
                "family": category,
                "target": str(candidate.get("target") or fallback_candidate.get("target") or ""),
                "difficulty": str(candidate.get("difficulty") or fallback_candidate.get("difficulty") or "medium"),
            }
        )

    if not normalized_items:
        return fallback_plan

    # If the raw plan supplied one extra strong category not present in fallback, use it to replace
    # the weakest repeated late slot instead of keeping a repetitive generated plan.
    selected_categories = [str(item.get("category") or "") for item in normalized_items]
    available_extras = [
        candidate for candidate in normalized_raw_candidates
        if str(candidate.get("_signature") or "") not in used_signatures
        and str(candidate.get("category") or "") not in selected_categories
    ]
    if available_extras and len(normalized_items) >= 4:
        replace_index = len(normalized_items) - 2
        replacement = available_extras[0]
        normalized_items[replace_index] = {
            "turn": replace_index + 1,
            "category": str(replacement.get("category") or "communication_explain"),
            "family": str(replacement.get("category") or "communication_explain"),
            "target": str(replacement.get("target") or ""),
            "difficulty": str(replacement.get("difficulty") or "medium"),
        }

    normalized_items = normalized_items[:max_turns]
    for index, item in enumerate(normalized_items, start=1):
        item["turn"] = index
    return normalized_items


def _style_variant_index(plan: str, category: str, target: str, style_hint: str) -> int:
    seed_text = f"{plan}|{category}|{target}|{style_hint}"
    return sum(ord(ch) for ch in seed_text)


def _humanize_question_target(target: str, family: str) -> str:
    """Convert planner-style target text into a natural subject for spoken questions."""
    cleaned = clean_for_display(str(target or "")) or str(target or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    lowered = normalize_transcript(cleaned, aggressive=True).lower().strip()

    default_targets = {
        "introduction": "your background",
        "studies_background": "your current studies or focus",
        "ownership": "one project or practical example",
        "workflow_process": "one project or practical example",
        "tool_method": "one project or practical example",
        "challenge_debugging": "one project or practical example",
        "validation_metrics": "your work",
        "tradeoff_decision": "your work",
        "communication_explain": "your work",
        "teamwork_pressure": "one real situation",
        "learning_growth": "your current growth area",
        "role_fit": "the role you want next",
        "closeout": "your fit for the role",
        # ✅ ADDED: defaults for the four new families.
        "programming_language": "a programming language you know well",
        "skill_verification": "one skill from your resume",
        "certification": "a certification you completed",
        "self_assessment": "an honest self-assessment of your skills",
    }
    if not lowered:
        return default_targets.get(family, "your recent work")

    exact_map = {
        "self introduction": "your background",
        "self-introduction": "your background",
        "specific project from resume": "one project from your resume",
        "specific project or example from your resume": "one project or example from your resume",
        "project internship or practical example from your resume": "one project, internship, or practical example from your resume",
        "project or practical example from your resume": "one project or practical example from your resume",
        "project or practical example": "one project or practical example",
        "project or practical process you can explain best": "the project or practical example you can explain best",
        "the project or practical process you can explain best": "the project or practical example you can explain best",
        "tool subject or method you used most clearly": "the tool or method you used most clearly",
        "the tool subject or method you used most clearly": "the tool or method you used most clearly",
        "tool or method that mattered most": "the tool or method that mattered most",
        "the role you want next": "the role you want next",
        "why this role": "the role you want next",
        "first 30 days": "your first 30 days in the role",
        "first month": "your first month in the role",
        "first 90 days": "your first 90 days in the role",
    }
    if lowered in exact_map:
        return exact_map[lowered]

    if "project" in lowered and "resume" in lowered:
        if "internship" in lowered or "practical example" in lowered:
            return "one project, internship, or practical example from your resume"
        return "one project from your resume"
    if "project" in lowered and "practical example" in lowered:
        return "one project or practical example"
    if "workflow" in lowered or "process" in lowered:
        return "your work"
    if "tool" in lowered or "method" in lowered:
        return "your work"
    if "role" in lowered and any(term in lowered for term in ["want", "target", "next", "fit"]):
        return "the role you want next"
    if any(term in lowered for term in ["first 30", "first month", "30 days", "90 days"]):
        return "your first few weeks in the role"
    if any(term in lowered for term in ["strength", "stand out", "hire you", "remember you"]):
        return "your strongest fit for the role"

    cleaned = re.sub(r"\bfrom your resume\b", "", cleaned, flags=re.IGNORECASE).strip(" ,.")
    return cleaned or default_targets.get(family, "your recent work")


def _humanize_live_question_text(question_text: str) -> str:
    """Remove planner-like phrasing so spoken questions sound more human."""
    question = re.sub(r"\s+", " ", question_text or "").strip()
    if not question:
        return ""

    replacements = (
        (r"\bproject or practical process you can explain best\b", "project or practical example you can explain best"),
        (r"\bthe project or practical process you can explain best\b", "the project or practical example you can explain best"),
        (r"\btool, subject, or method\b", "tool or method"),
        (r"\btool subject or method\b", "tool or method"),
        (r"\bproject, internship, or practical example from your resume\b", "project, internship, or practical example from your background"),
        (r"\bwhat part of your background or current studies\b", "what part of your background or studies"),
        (r"\bwhat kind of role are you preparing for next, and why does the role you want next fit that\b", "what kind of role are you preparing for next, and why does it fit you"),
        (r"\bwhy does the role you want next fit that\b", "why does it fit you"),
    )
    for pattern, replacement in replacements:
        question = re.sub(pattern, replacement, question, flags=re.IGNORECASE)

    question = re.sub(r"\s+", " ", question).strip()
    return question


def _apply_question_style_hints(plan: str, question_plan: list[dict], seed_text: str) -> list[dict]:
    """Attach a deterministic wording hint so repeated interviews feel less identical."""
    plan_key = (plan or "free").lower().strip()
    style_pool = QUESTION_STYLE_HINTS.get(plan_key, QUESTION_STYLE_HINTS["free"])
    if not question_plan:
        return []

    seed_value = sum(ord(ch) for ch in (seed_text or plan_key))
    styled_items: list[dict] = []
    for index, item in enumerate(question_plan):
        style_hint = style_pool[(seed_value + index * 3) % len(style_pool)]
        styled_items.append({**item, "style_hint": str(item.get("style_hint") or style_hint)})
    return styled_items


def _extract_question_portion(text: str) -> str:
    """Extract the actual question portion from an interviewer response."""
    cleaned = clean_for_display(text or "") or (text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return ""

    clauses = [part.strip(" -:") for part in re.split(r"(?<=[?.!])\s+|\n+", cleaned) if part.strip()]
    if not clauses:
        return cleaned

    for clause in reversed(clauses):
        normalized_clause = normalize_transcript(clause, aggressive=True).lower().strip()
        if "?" in clause or normalized_clause.startswith(QUESTION_CUE_PREFIXES):
            return clause.rstrip("?.! ").strip()

    if len(clauses) >= 2:
        return clauses[-1].rstrip("?.! ").strip()
    return cleaned.rstrip("?.! ").strip()


def _looks_like_interviewer_question(text: str) -> bool:
    """Check whether a text turn looks like a single interviewer question."""
    portion = _extract_question_portion(text)
    normalized = normalize_transcript(portion or text, aggressive=True).lower().strip()
    if not normalized:
        return False

    if "?" in (portion or text):
        return True

    if normalized.startswith(QUESTION_CUE_PREFIXES):
        return True

    return normalized.startswith(("give me", "name one", "share one"))


def _finalize_interviewer_turn(text: str, is_greeting: bool) -> str:
    """Normalize a model turn into one clean interviewer message."""
    cleaned = _clean_ai_response(text)
    if not cleaned:
        return ""

    if is_greeting:
        return cleaned

    question = _extract_question_portion(cleaned).strip()
    question = re.sub(r"\s+", " ", question).strip()
    question = _humanize_live_question_text(question)
    if not question:
        return cleaned

    normalized_question = normalize_transcript(question, aggressive=True).lower().strip()
    if "?" not in question and normalized_question.startswith(
        ("what ", "how ", "why ", "which ", "who ", "where ", "when ", "can you", "could you", "would you", "do you", "did you", "have you")
    ):
        question = question.rstrip(".! ") + "?"

    return question


def _strip_question_intro(text: str) -> str:
    """Remove encouragement and wrapper phrases before duplicate comparison."""
    normalized = normalize_transcript(text or "", aggressive=True).lower().strip()
    for prefix in QUESTION_INTRO_PREFIXES:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):].strip(" ,.:;!-")
    return normalized


def _question_signature(text: str) -> str:
    """Build a normalized signature for duplicate-question detection."""
    portion = _extract_question_portion(text)
    normalized = _strip_question_intro(portion or "")
    normalized = re.sub(r"[^a-z0-9\s]+", " ", normalized)
    for pattern, replacement in QUESTION_SIGNATURE_REPLACEMENTS:
        normalized = re.sub(pattern, replacement, normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized[:160]


def _question_core_tokens(text: str) -> set[str]:
    """Extract content-heavy question tokens for fuzzy duplicate detection."""
    signature = _question_signature(text)
    return {
        token
        for token in signature.split()
        if len(token) >= 3 and token not in QUESTION_STOP_WORDS
    }


def _extract_asked_question_signatures(history_rows) -> set[str]:
    """Collect normalized signatures for already-asked interviewer questions."""
    signatures: set[str] = set()
    for row in history_rows:
        if row["role"] != "assistant":
            continue
        signature = _question_signature(str(row["content"] or ""))
        if signature:
            signatures.add(signature)
    return signatures


def _collect_asked_questions(history_rows) -> list[str]:
    """Return all unique interviewer questions in session order."""
    items: list[str] = []
    seen: set[str] = set()
    for row in history_rows:
        if row["role"] != "assistant":
            continue
        question_text = _extract_question_portion(str(row["content"] or "")).strip()
        signature = _question_signature(question_text)
        if question_text and signature and signature not in seen:
            seen.add(signature)
            items.append(question_text)
    return items


def _collect_recent_asked_questions(history_rows, limit: int = 6) -> list[str]:
    """Return recent interviewer questions for prompt-level repeat avoidance."""
    items = _collect_asked_questions(history_rows)
    return items[-limit:]


async def _load_recent_session_question_memory(
    conn,
    user_id: str,
    plan: str,
    limit_sessions: int = 50,  # ✅ FIXED: was 5. With 5, memory resets every 6 sessions.
    # A student doing 300+ interviews gets session-1 questions again at session 6.
    # 50 sessions = persistent deduplication across a full semester of practice.
    exclude_session_id: str | None = None,
) -> dict[str, Any]:
    """Collect recent cross-session interview memory so new sessions feel fresher."""
    if exclude_session_id:
        session_rows = await conn.fetch(
            """SELECT id, question_plan
               FROM interview_sessions
               WHERE user_id = $1 AND plan = $2 AND id <> $3
               ORDER BY created_at DESC
               LIMIT $4""",
            user_id,
            plan,
            exclude_session_id,
            limit_sessions,
        )
    else:
        session_rows = await conn.fetch(
            """SELECT id, question_plan
               FROM interview_sessions
               WHERE user_id = $1 AND plan = $2
               ORDER BY created_at DESC
               LIMIT $3""",
            user_id,
            plan,
            limit_sessions,
        )

    session_ids = [row["id"] for row in session_rows]
    recent_targets_raw: list[str] = []
    recent_target_signatures: set[str] = set()
    recent_angle_signatures: set[str] = set()
    recent_position_signatures: set[str] = set()

    for row in session_rows:
        for index, item in enumerate(_coerce_question_plan(row["question_plan"] or []), start=1):
            category = str(item.get("category") or "communication")
            target = str(item.get("target") or "").strip()
            normalized_category = _normalize_plan_category(category)
            recent_position_signatures.add(f"{index}:{normalized_category}")
            if not target:
                continue
            signature = _plan_target_signature(normalized_category, target)
            angle_signature = f"{normalized_category}:{_plan_target_angle(normalized_category, target)}"
            if signature not in recent_target_signatures:
                recent_target_signatures.add(signature)
                recent_targets_raw.append(f"{normalized_category.replace('_', ' ')}: {target}")
            recent_angle_signatures.add(angle_signature)

    question_rows = []
    if session_ids:
        question_rows = await conn.fetch(
            """SELECT content
               FROM conversation_messages
               WHERE session_id = ANY($1::uuid[]) AND role = 'assistant'
               ORDER BY created_at DESC, id DESC
               LIMIT $2""",
            session_ids,
            # ✅ PERF: reduced from max(12, limit_sessions * 10) → max(12, limit_sessions * 4).
            # Old formula with limit_sessions=50 fetched 500 rows per session creation.
            # 500 concurrent users × 500 rows = 250k rows/sec from this query alone.
            # 4× gives 200 rows — more than enough variety signal across 50 sessions.
            max(12, len(session_ids) * 4),
        )

    recent_questions_raw: list[str] = []
    recent_question_signatures: set[str] = set()
    for row in question_rows:
        question_text = _extract_question_portion(str(row["content"] or "")).strip()
        signature = _question_signature(question_text)
        if question_text and signature and signature not in recent_question_signatures:
            recent_question_signatures.add(signature)
            recent_questions_raw.append(question_text)
            recent_angle_signatures.add(
                f"{_question_family_from_text(question_text)}:{_question_angle_from_text(question_text)}"
            )

    return {
        "recent_session_count": len(session_rows),
        "recent_targets": _dedupe_preserve_order(recent_targets_raw, max_items=10),
        "recent_target_signatures": recent_target_signatures,
        "recent_angle_signatures": recent_angle_signatures,
        "recent_position_signatures": recent_position_signatures,
        "recent_questions": _dedupe_preserve_order(recent_questions_raw, max_items=8),
        "recent_question_signatures": recent_question_signatures,
    }


def _is_duplicate_question(
    candidate_text: str,
    asked_question_signatures: set[str] | None,
    asked_questions: list[str] | None,
) -> bool:
    """Detect exact or near-duplicate question intent against prior interviewer turns."""
    signature = _question_signature(candidate_text)
    if not signature:
        return False

    asked_question_signatures = asked_question_signatures or set()
    asked_questions = asked_questions or []

    if signature in asked_question_signatures:
        return True

    candidate_core = _question_core_tokens(signature)
    if not candidate_core:
        return False

    for previous_question in asked_questions:
        previous_signature = _question_signature(previous_question)
        if not previous_signature:
            continue

        if signature == previous_signature:
            return True

        if len(signature) >= 20 and (signature in previous_signature or previous_signature in signature):
            return True

        previous_core = _question_core_tokens(previous_signature)
        if not previous_core:
            continue

        overlap = len(candidate_core & previous_core)
        shorter = min(len(candidate_core), len(previous_core))
        union = len(candidate_core | previous_core)

        if shorter >= 4 and overlap >= max(4, shorter - 1):
            return True
        if overlap >= 5 and union and (overlap / union) >= 0.7:
            return True

    return False


def _build_positive_boost(plan: str, user_text: str, is_timeout: bool, is_idk: bool) -> str:
    """Return a short confidence boost when the candidate gives a strong answer."""
    if is_timeout or is_idk:
        return ""

    normalized = normalize_transcript(user_text or "", aggressive=True).lower()
    if not normalized:
        return ""

    words = [word for word in normalized.split() if word.strip()]
    technical_hits = sum(1 for term in TECHNICAL_SIGNAL_TERMS if term in normalized)
    positive_hits = sum(1 for term in POSITIVE_SIGNAL_TERMS if term in normalized)
    selector = sum(ord(ch) for ch in normalized[:80])

    boost_variants = {
        "free": ["Thanks, that helps.", "Good, I follow that.", "Okay, that makes sense."],
        "pro": ["Clear answer.", "Thanks, that's useful.", "Good, that gives me enough to work with."],
        "career": ["Thanks, that's helpful.", "That gives me useful context.", "Good, that gives me a clearer picture."],
    }

    def pick(plan_key: str) -> str:
        options = boost_variants.get(plan_key, [])
        if not options:
            return ""
        return options[selector % len(options)]

    if len(words) >= 28 and (technical_hits >= 2 or positive_hits >= 2):
        if plan in {"free", "pro"}:
            return pick(plan)
        return ""

    if len(words) >= 18 and (technical_hits >= 1 or positive_hits >= 1):
        if plan in {"free", "pro", "career"}:
            return pick(plan)
        return ""

    return ""


def _merge_boost_with_question(boost_text: str, question_text: str) -> str:
    """Combine a short encouragement with the next question."""
    question_text = (question_text or "").strip()
    if not boost_text:
        return question_text
    if not question_text:
        return boost_text.strip()
    return f"{boost_text.strip()} {question_text}"


def _get_future_plan_items(question_plan, upcoming_turn: int, max_items: int = 8) -> list[dict]:
    """Return upcoming planned question items sorted by turn."""
    items = sorted(
        _coerce_question_plan(question_plan),
        key=lambda item: int(item.get("turn", 0) or 0),
    )
    future_items = [item for item in items if int(item.get("turn", 0) or 0) >= upcoming_turn]
    return future_items[:max_items] if future_items else items[:max_items]


def _get_plan_item_for_turn(question_plan, turn_number: int) -> dict | None:
    """Return the planned item for one specific turn."""
    return next(
        (
            item for item in _coerce_question_plan(question_plan)
            if int(item.get("turn", 0) or 0) == int(turn_number or 0)
        ),
        None,
    )


def _infer_free_retry_category(previous_question: str, fallback_category: str) -> str:
    """Infer the beginner question category so silence retries stay supportive."""
    return _question_family_from_text(previous_question, fallback_category or "communication_explain")


def _build_free_retry_question(previous_question: str, fallback_category: str, silence_count: int) -> str:
    """Return a calmer retry question for the free plan after silence."""
    category = _infer_free_retry_category(previous_question, fallback_category)

    if silence_count <= 1:
        retry_questions = {
            "introduction": "Give me a short introduction with your background and current goal.",
            "studies_background": "What are you studying right now, and what part interests you most?",
            "ownership": "What part was mainly yours there, and what changed because of it?",
            "workflow_process": "What was the main flow there, in simple steps?",
            "tool_method": "Which tool or method mattered most there, and what did it help with?",
            "challenge_debugging": "What issue came up there, and what did you do about it?",
            "communication_explain": "Explain that project, idea, or decision simply one more time, then tell me why it mattered.",
            "teamwork_pressure": "Tell me about one time pressure, teamwork, or feedback changed what you did.",
            "learning_growth": "What are you trying to improve right now, and why?",
            "role_fit": "What role are you aiming for next, and why does it fit you?",
        }
        return retry_questions.get(category, "What are you studying right now?")

    if silence_count == 2:
        simplified_questions = {
            "introduction": "Share 2 or 3 short points about yourself.",
            "studies_background": "What course or degree are you doing?",
            "ownership": "Name one thing you mainly handled.",
            "workflow_process": "Name the main step or process there.",
            "tool_method": "Name one tool or method you used.",
            "challenge_debugging": "Name one problem you handled.",
            "communication_explain": "Give one simple explanation.",
            "teamwork_pressure": "Share one short learning example.",
            "learning_growth": "Name one thing you are improving.",
            "role_fit": "Name one role you are aiming for.",
        }
        return simplified_questions.get(category, "Tell me one short thing about your background.")

    switch_questions = {
        "introduction": "Which project are you most comfortable explaining?",
        "studies_background": "Which project or work example are you most comfortable explaining?",
        "ownership": "Which project or work example are you most comfortable explaining next?",
        "workflow_process": "Which project or example can you explain best?",
        "tool_method": "Which project or example can you explain best?",
        "challenge_debugging": "Which project or example can you explain best?",
        "teamwork_pressure": "Tell me about one short teamwork or pressure example you handled.",
    }
    return switch_questions.get(category, "Tell me about yourself.")


def _build_repeat_question(plan: str, previous_question: str, fallback_category: str) -> str:
    """Repeat the last question once in simpler wording without scoring it."""
    if plan == "free":
        return _build_free_retry_question(previous_question, fallback_category, 1)
    if plan == "pro":
        return _build_pro_retry_question(previous_question, fallback_category, 1)
    if plan == "career":
        return _build_career_retry_question(previous_question, fallback_category, 1)
    return previous_question or "Could you answer that once more?"


def _build_clarification_question(
    plan: str,
    previous_question: str,
    fallback_category: str,
    clarification_text: str,
) -> str:
    """Return a more helpful rephrase when the candidate asks for clarification."""
    normalized = normalize_transcript(clarification_text or "", aggressive=True).lower()
    family = _question_family_from_text(previous_question, fallback_category)
    repeated_question = _build_repeat_question(plan, previous_question, fallback_category)

    if any(phrase in normalized for phrase in ["which project", "what project", "project do you mean"]):
        if plan == "career":
            return (
                "You can choose the project, internship, or practical example that best proves your fit and that you can explain confidently. "
                f"{repeated_question}"
            )
        if plan == "pro":
            return (
                "You can choose the project or practical example from your resume that you know best. "
                f"{repeated_question}"
            )
        return (
            "You can pick any project or example you are most comfortable explaining. "
            f"{repeated_question}"
        )

    if any(phrase in normalized for phrase in ["which role", "what role do you mean", "role do you mean"]):
        return (
            "I mean the role you are preparing for next, or the one that best matches your strongest work so far. "
            f"{repeated_question}"
        )

    if any(
        phrase in normalized
        for phrase in [
            "can you give an example",
            "give me an example",
            "what kind of answer",
            "what should i answer",
            "what should i say",
            "what do i say",
            "what should i tell you",
            "what do i tell you",
            "what do you want me to say",
        ]
    ):
        answer_shape = {
            "introduction": "Give a short answer with who you are, your strongest area, and one proof point.",
            "studies_background": "Give a short answer with what you are studying, what interests you, and one relevant project or skill.",
            "ownership": "Give a short answer with what you handled, one decision you made, and what changed.",
            "workflow_process": "Give the main steps, then say why the flow was designed that way.",
            "tool_method": "Name the tool or method, what it handled, and why it was a good fit.",
            "challenge_debugging": "Name the problem, the choice you made, and what changed after it.",
            "validation_metrics": "Say what you checked, how you compared it, and what conclusion you reached.",
            "tradeoff_decision": "Name the options, the key constraint, and why your final choice was better.",
            "communication_explain": "Explain it simply first, then say why it mattered.",
            "teamwork_pressure": "Use situation, action, result, and lesson.",
            "learning_growth": "Name the growth area, what you are doing about it, and why it matters.",
            "role_fit": "Link one strength or project to the role you want next.",
            "closeout": "Give one hiring reason, one proof point, and the role or impact you want remembered.",
        }.get(family, "Give one short direct answer with one concrete proof point.")
        return f"{answer_shape} {repeated_question}"

    if any(phrase in normalized for phrase in ["do you mean", "are you asking about", "what exactly are you asking", "clarify", "explain the question"]):
        clarification = {
            "introduction": "I am asking for a short self-introduction, not your full resume.",
            "studies_background": "I am asking what you are studying or focusing on right now and how it connects to your work.",
            "ownership": "I am asking which part was clearly yours, not what the whole team did.",
            "workflow_process": "I am asking for the main flow in simple steps, not every small detail.",
            "tool_method": "I am asking which tool or method mattered most and why it fit the work.",
            "challenge_debugging": "I am asking about the problem that tested you most and what you chose to do.",
            "validation_metrics": "I am asking how you checked whether the result really improved.",
            "tradeoff_decision": "I am asking what options you were balancing and why you chose one.",
            "communication_explain": "I am asking you to explain it simply, like to a non-expert.",
            "teamwork_pressure": "I am asking for one real situation where pressure, teamwork, or feedback changed your action.",
            "learning_growth": "I am asking what you are actively improving and what you are doing about it.",
            "role_fit": "I am asking why your background matches the role you want next.",
            "closeout": "I am asking what one point an interviewer should remember about you.",
        }.get(family, "I am asking for one short, direct answer.")
        return f"{clarification} {repeated_question}"

    return repeated_question


def _build_timeout_retry_question(plan: str, previous_question: str, fallback_category: str, retry_count: int) -> str:
    """Return the next retry wording for the same logical question after silence."""
    safe_retry_count = max(1, int(retry_count or 1))
    if plan == "free":
        return _build_free_retry_question(previous_question, fallback_category, safe_retry_count)
    if plan == "pro":
        return _build_pro_retry_question(previous_question, fallback_category, safe_retry_count)
    if plan == "career":
        return _build_career_retry_question(previous_question, fallback_category, safe_retry_count)
    return previous_question or "Give one short direct answer."


def _infer_pro_retry_category(previous_question: str, fallback_category: str) -> str:
    """Infer the Pro question category so silence retries stay technical but fair."""
    return _question_family_from_text(previous_question, fallback_category or "workflow_process")


def _build_free_followup_question(previous_question: str, user_text: str, resume_summary: dict | None = None) -> str:
    """Deterministic Free follow-up when we want one human next question instead of a static plan hop."""
    previous_family = _question_family_from_text(previous_question)
    signals = _answer_signal_profile(user_text)
    summary = _coerce_resume_summary_dict(resume_summary or {})
    facts = _extract_answer_anchor_facts(user_text, summary)
    project_name = facts.get("project_name") or ""
    metric_claim = facts.get("metric_claim") or ""
    outcome_phrase = facts.get("outcome_phrase") or ""
    target_role = facts.get("target_role") or _resume_target_role(summary)

    # Resume-derived fallbacks so questions are NEVER vague
    primary_proj = _resume_primary_project(summary)
    primary_project_name = (primary_proj.get("name") or "").strip() if primary_proj else ""
    primary_skill = _resume_primary_skill(summary)
    education_list = [item for item in summary.get("education", []) if isinstance(item, str) and item.strip()]
    edu_context = education_list[0].strip() if education_list else ""

    # ✅ FIXED: Each signal path previously returned one hardcoded string.
    # Same answer → identical followup question in every session for every student.
    # Fix: derive a per-answer rotation index from answer text hash so the chosen
    # variant changes even if the same student gives a very similar answer twice.
    _ans_hash = sum(ord(ch) * (i + 1) for i, ch in enumerate((user_text or "")[:64])) % 997

    def _pick(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[_ans_hash % len(usable)] if usable else ""

    # Resolved subject: always prefer answer-detected project > resume primary project > primary skill > "your strongest project"
    subject = project_name or primary_project_name or (f"your {primary_skill} work" if primary_skill else "your strongest project")

    if previous_family == "introduction":
        if project_name and metric_claim:
            return _pick(
                f"I noticed you worked on {project_name}. You mentioned {metric_claim}. Can you explain what you changed to get that result?",
                f"You brought up {project_name} and mentioned {metric_claim}. What specific decision led to that outcome?",
                f"That result you mentioned from {project_name} — what was the most important thing you personally did to make it happen?",
            )
        if signals["mentions_project"] and (signals["mentions_decision"] or signals["mentions_ownership"]):
            return _pick(
                f"Out of all your work, {subject} stands out. What part was mainly yours, and what changed because of it?",
                f"I want to understand your personal contribution in {subject}. What did you specifically own there?",
                f"What was the most important decision you made in {subject}, and what did it change?",
            )
        if signals["mentions_project"] and signals["mentions_role_goal"]:
            if project_name and outcome_phrase:
                return _pick(
                    f"That helps explain your work better. From {project_name}, what result best shows why {target_role} fits you?",
                    f"You mentioned a goal around {target_role}. Which part of {project_name} best proves you are ready for that?",
                    f"What does {outcome_phrase} in {project_name} tell a recruiter about your readiness for {target_role}?",
                )
            return _pick(
                f"You mentioned a specific role goal. Which project from your resume best supports {target_role}, and why?",
                f"What from your background most directly points toward {target_role}?",
                f"Which one project or experience from your resume best shows you are ready for {target_role}?",
            )
        if signals["mentions_role_goal"] and signals["mentions_strength"]:
            return _pick(
                f"That is a great strength for {target_role}. What example from your work best shows that strength in action?",
                f"How does that strength show up in a real project or situation from your resume?",
                f"Which experience from your background best proves that strength matters for {target_role}?",
            )
        if signals["mentions_degree"] and signals["mentions_project"]:
            return _pick(
                f"I see you have been working on {subject}. Which part of that project are you most comfortable explaining?",
                f"From {subject}, what contribution are you most confident talking through step by step?",
                f"What part of {subject} best shows what you learned from combining your studies with that project?",
            )
        if signals["mentions_degree"] and signals["mentions_role_goal"]:
            if primary_project_name:
                return _pick(
                    f"What about your work on {primary_project_name} best shows why you want {target_role}?",
                    f"How does {primary_project_name} connect to the kind of work you want in {target_role}?",
                    f"Which part of {primary_project_name} would be most useful in {target_role}?",
                )
            return _pick(
                f"What project or example best shows why you want {target_role}?",
                f"Which experience from your background connects most directly to {target_role}?",
                f"What have you worked on that makes {target_role} feel like the right next step?",
            )
        if signals["mentions_degree"]:
            if primary_project_name:
                return _pick(
                    f"I can see you have worked on {primary_project_name}. Which part of that project best shows what you are building toward?",
                    f"From {primary_project_name}, what did you learn that you most want to use in your next role?",
                    f"What part of {primary_project_name} are you most confident explaining in an interview?",
                )
            return _pick(
                f"{'As a ' + edu_context + ', w' if edu_context else 'W'}hich project or example best shows what you are building toward?",
                f"{'Given your background in ' + edu_context + ', w' if edu_context else 'W'}hat kind of work do you feel most ready to take on?",
                f"What is the best example of your work that connects to what you want to do next?",
            )
        if signals["mentions_project"]:
            return _pick(
                f"I want to understand your personal contribution clearly. In {subject}, what part did you personally handle or build?",
                f"What was your specific role in {subject}, and what changed because of your contribution?",
                f"In {subject}, what decision or action was clearly yours?",
            )
        if edu_context:
            return _pick(
                f"I can see from your resume that you are {'a ' + edu_context if edu_context else 'studying'}. What are you currently focusing on right now?",
                f"As {'a ' + edu_context if edu_context else 'a student'}, what area of your course or project work feels most job-ready?",
                f"What part of your {'work as a ' + edu_context if edu_context else 'studies'} would be most useful to explain to a recruiter?",
            )
        return _pick(
            f"I can see your background.{' You have skills in ' + primary_skill + '.' if primary_skill else ''} What are you currently studying or focusing on right now?",
            f"{'You have skills in ' + primary_skill + '.' if primary_skill else 'I can see your background.'} What project or experience feels most ready to talk through?",
            f"What part of your work or studies right now feels most connected to the role you want next?",
        )
    if previous_family == "studies_background":
        if signals["mentions_project"] and (signals["mentions_method"] or signals["mentions_workflow"]):
            return _pick(
                f"Every good project includes important workflow choices. How would you explain {subject} in a few simple steps?",
                f"I want to understand the flow behind {subject}. What were the main steps, and which one mattered most?",
                f"Walk me through how {subject} worked, and tell me which part you found most interesting to solve.",
            )
        if signals["mentions_role_goal"]:
            return _pick(
                f"That clarifies your background. Why are you preparing for {target_role}, and what draws you to it?",
                f"What about {target_role} feels like the right next step based on what you are learning now?",
                f"How does what you are studying now prepare you for {target_role}?",
            )
        if primary_project_name:
            return _pick(
                f"I noticed you worked on {primary_project_name}. How does that project connect to what you are studying?",
                f"How did {primary_project_name} help you apply what you have been learning?",
                f"What part of {primary_project_name} taught you the most relevant thing for the role you want?",
            )
        return _pick(
            f"Which project or example from your resume best connects to {'your ' + edu_context + ' studies' if edu_context else 'what you are studying'}?",
            f"What is the strongest project or example you have right now that shows your studies are paying off?",
            f"Which piece of work from your resume best shows what you have learned so far?",
        )
    if previous_family == "ownership":
        if project_name and outcome_phrase:
            return _pick(
                f"Now I want to understand the impact of your work in {project_name}. Why did {outcome_phrase} matter to the user, team, or project?",
                f"You mentioned {outcome_phrase} in {project_name}. Who benefited from that, and how?",
                f"That result in {project_name} sounds meaningful. What would have happened if you had not made that change?",
            )
        if signals["mentions_outcome"]:
            return _pick(
                f"That helps explain your work in {subject} better. Why did that result matter to the user, team, or project?",
                f"Who did that result affect, and how did it change things for them?",
                f"That outcome you described — what would have been different if you had not acted on it?",
            )
        return _pick(
            f"Now I want to understand the impact of your work. What changed or improved because of the action you took in {subject}, and why did it matter?",
            f"What was the most important thing that changed because of what you did in {subject}?",
            f"If I asked your team what your biggest contribution in {subject} was, what would they say?",
        )
    if previous_family == "workflow_process":
        if signals["mentions_method"]:
            return _pick(
                f"Every process has a critical phase. Which step mattered most in {subject}, and why was it important?",
                f"Out of all the steps you described, which one was the hardest to get right, and why?",
                f"Which phase of that workflow would have caused the most problems if it had gone wrong?",
            )
        return _pick(
            f"I want to understand your technical choices. What tool or method mattered most in {subject}, and what did it help with?",
            f"What was the most important technical decision in that workflow, and why did you make it?",
            f"Which choice in that process do you feel most confident defending in an interview?",
        )
    if previous_family == "tool_method":
        if signals["mentions_outcome"]:
            return _pick(
                f"Every good project includes some important choices. In {subject}, why was that the right choice, and what result changed because of it?",
                f"What would have been harder or worse in {subject} if you had chosen a different approach?",
                f"That choice sounds like it had real impact. How would you explain why it was the right call to someone who doubts it?",
            )
        return _pick(
            f"That sounds like an important decision in {subject}. What result changed after you used that approach?",
            f"What did using that tool or method actually change in the outcome of {subject}?",
            f"How would {subject} have turned out differently if you had used a different approach?",
        )
    if previous_family == "teamwork_pressure":
        if signals["mentions_decision"] and signals["mentions_outcome"]:
            return _pick(
                f"That explains how you handle real-world situations{' like in ' + project_name if project_name else ''}. What did that experience teach you for future work?",
                f"What would you do differently in a similar situation now, based on what you learned?",
                f"How has that experience changed the way you approach team challenges or pressure situations?",
            )
        return _pick(
            f"Now I want to understand the impact of your choices. What changed because of the action you took in {subject}?",
            f"What did the people around you notice about how you handled that situation?",
            f"What was the most important lesson you took away from that experience?",
        )
    if previous_family == "learning_growth":
        if signals["mentions_role_goal"]:
            return _pick(
                f"Why do you think improving that area matters for {target_role}?",
                f"How will getting better at that help you specifically in {target_role}?",
                f"What will that improvement let you do in {target_role} that you cannot do as well today?",
            )
        return _pick(
            "What are you doing right now to improve that area?",
            "What is one concrete step you have taken recently to work on that?",
            "How are you measuring whether you are actually getting better at that?",
        )
    if previous_family == "role_fit":
        if signals["mentions_project"] and signals["mentions_outcome"]:
            return _pick(
                f"That explains your work better. What result from {subject} best proves you fit {target_role} in a real-world situation?",
                f"Which outcome from {subject} would be hardest for other candidates at your level to match?",
                f"How would you use that result from {subject} to convince a hiring manager you are ready for {target_role}?",
            )
        return _pick(
            f"What strength do you think helps you most for {target_role}?",
            f"Which one quality or experience makes you most confident about {target_role}?",
            f"If a recruiter asked for one proof point about your fit for {target_role}, what would you give them?",
        )
    if previous_family == "communication_explain":
        if signals["mentions_outcome"]:
            return _pick(
                f"That helps explain your idea in {subject} clearly. Why did that result matter to the user, team, or project?",
                f"You explained that well. What would have changed for the team or user if that result had not happened?",
                f"Who was most affected by that outcome in {subject}, and how did it change things for them?",
            )
        return _pick(
            f"That sounds like important work. What result or decision from {subject} do you think would matter most to a recruiter or team?",
            f"Which part of what you just described would be most relevant to someone hiring for {target_role}?",
            f"If you had 30 seconds to tell a recruiter the most important thing about {subject}, what would you say?",
        )
    if any(term in (user_text or "").lower() for term in ["team", "deadline", "pressure", "feedback"]):
        return _pick(
            f"Now I want to understand the impact. What did that situation change in how you approach {subject} now?",
            f"How do you handle similar situations differently now because of what you learned there?",
            f"What would you tell a new teammate who was facing the same kind of pressure you described?",
        )
    if primary_project_name:
        return _pick(
            f"That explains your background well. I noticed you worked on {primary_project_name}. Tell me more about that project — what part are you most proud of?",
            f"I want to dig into {primary_project_name}. What was the most important thing you personally contributed there?",
            f"From {primary_project_name}, what would you want an interviewer to know about how you work?",
        )
    return _pick(
        f"That explains your background well.{' You have skills in ' + primary_skill + '.' if primary_skill else ''} What part of your resume do you feel is the strongest to talk about?",
        f"Which experience from your background would you most want a recruiter to ask you more about?",
        f"What is the strongest proof point you have right now for the kind of role you want next?",
    )


def _build_pro_retry_question(previous_question: str, fallback_category: str, silence_count: int) -> str:
    """Return a shorter or narrower Pro retry question after silence."""
    category = _infer_pro_retry_category(previous_question, fallback_category)

    if silence_count <= 1:
        retry_questions = {
            "introduction": "Give me a short intro with your background and main skills.",
            "ownership": "What part of that project did you personally own?",
            "workflow_process": "What was the main workflow there?",
            "tool_method": "What exactly did that tool or method handle?",
            "challenge_debugging": "What issue did you fix, and how?",
            "validation_metrics": "How did you check whether it improved?",
            "tradeoff_decision": "What choice did you make there, and why?",
            "communication_explain": "Explain that decision in one clear technical way.",
            "teamwork_pressure": "Tell me about one time you handled ownership or pressure.",
            "learning_growth": "What are you actively improving right now?",
            "role_fit": "Why does your background fit the role you want next?",
        }
        return retry_questions.get(category, "What exactly did you handle there?")

    if silence_count == 2:
        narrowed_questions = {
            "introduction": "Name your background, one skill, and one goal.",
            "ownership": "What did you personally build or change there?",
            "workflow_process": "Name the main step in that workflow.",
            "tool_method": "Name one tool or method that mattered most.",
            "challenge_debugging": "Name one bug or challenge you fixed.",
            "validation_metrics": "Name one thing you checked or measured.",
            "tradeoff_decision": "Name the main trade-off you made.",
            "communication_explain": "Explain it in one short technical sentence.",
            "teamwork_pressure": "Give one short ownership example.",
            "learning_growth": "Name one thing you are improving.",
            "role_fit": "Name one reason you fit the role you want.",
        }
        return narrowed_questions.get(category, "Name one technical step that mattered most.")

    switch_questions = {
        "introduction": "What project decision best shows your technical judgment?",
        "ownership": "What technical result or improvement are you most confident explaining?",
        "workflow_process": "Tell me about one technical decision you made and why you made it.",
        "tool_method": "Tell me about one technical decision you made and why you made it.",
        "challenge_debugging": "Which technical result or improvement are you most confident explaining?",
        "validation_metrics": "Which technical result or improvement are you most confident explaining?",
        "communication_explain": "What technical result or improvement are you most confident explaining?",
        "teamwork_pressure": "Tell me about one technical decision you made and why you made it.",
    }
    return switch_questions.get(category, "Tell me about one technical decision you made and why you made it.")


def _infer_career_retry_category(previous_question: str, fallback_category: str) -> str:
    """Infer the Career question category so silence retries stay premium and relevant."""
    return _question_family_from_text(previous_question, fallback_category or "communication_explain")


def _build_career_retry_question(previous_question: str, fallback_category: str, silence_count: int) -> str:
    """Return a shorter or narrower Career retry question after silence."""
    category = _infer_career_retry_category(previous_question, fallback_category)

    if silence_count <= 1:
        retry_questions = {
            "introduction": "Give me a short introduction with your background and the role you want.",
            "ownership": "What did you personally own there?",
            "workflow_process": "What key workflow or design choice mattered most there?",
            "tool_method": "What key tool or method mattered most there?",
            "challenge_debugging": "What challenge did you handle, and what changed after your fix?",
            "validation_metrics": "How did you know the result really improved?",
            "tradeoff_decision": "What trade-off mattered most there, and what did you choose?",
            "communication_explain": "Explain it in one clear non-technical way.",
            "teamwork_pressure": "Tell me about one time you handled ownership, pressure, or growth well.",
            "learning_growth": "What is one area you are actively improving right now?",
            "role_fit": "Why does your background fit the role you want next?",
            "closeout": "What should a hiring panel remember about you?",
            # ✅ ADDED: three new families
            "situational_judgment": "What would your first instinct be, and why?",
            "creative_thinking": "Walk me through your first few steps — no right answer here.",
            "ai_tool_fluency": "Give me one real example — how you used it and what you did with the output.",
            # ✅ ADDED: four new families
            "programming_language": "Name one concept in that language you have used, and what for.",
            "skill_verification": "Tell me one real thing you have done with that skill.",
            "certification": "What is one useful thing that certification taught you?",
            "self_assessment": "On a scale of 1 to 10, how would you rate yourself, and why?",
        }
        return retry_questions.get(category, "What project or experience best shows your ownership?")

    if silence_count == 2:
        narrowed_questions = {
            "introduction": "Name your background, one core skill, and one career goal.",
            "ownership": "Name one thing you personally built or changed.",
            "workflow_process": "Name one workflow or design choice that mattered most.",
            "tool_method": "Name one tool or method that mattered most.",
            "challenge_debugging": "Name one issue, your fix, and the result.",
            "validation_metrics": "Name one check or metric you used.",
            "tradeoff_decision": "Name the main trade-off and your final choice.",
            "communication_explain": "Give one short simple explanation.",
            "teamwork_pressure": "Give one short example of ownership or improvement.",
            "learning_growth": "Name one area you are improving right now.",
            "role_fit": "Name one reason you fit the role you want.",
            "closeout": "Name one thing the hiring panel should remember.",
            # ✅ ADDED: three new families
            "situational_judgment": "Just name the first step you would take.",
            "creative_thinking": "Name one assumption you are making and go from there.",
            "ai_tool_fluency": "Name one AI tool and one way you have actually used it.",
            # ✅ ADDED: four new families
            "programming_language": "Name one feature of that language you have used.",
            "skill_verification": "Name one concrete thing you did with that skill.",
            "certification": "Name one thing you learned from that certification.",
            "self_assessment": "Just give yourself a number from 1 to 10 and one reason.",
        }
        return narrowed_questions.get(category, "Give one short answer with the main point first.")

    switch_questions = {
        "introduction": "Which project best proves you are ready for the role you want?",
        "ownership": "Why are you targeting this kind of role next?",
        "workflow_process": "What project decision best shows your judgment?",
        "tool_method": "What project decision best shows your judgment?",
        "challenge_debugging": "Which skill or project result are you most confident explaining?",
        "validation_metrics": "Which result or check best shows your judgment?",
        "communication_explain": "What project decision best shows your ownership and judgment?",
        "teamwork_pressure": "What is one area you are actively improving as a professional?",
        "learning_growth": "What is one area you are actively improving as a professional?",
        "role_fit": "Which part of your background best proves your fit for the role you want?",
        "closeout": "What one thing should the hiring panel remember about you?",
        # ✅ ADDED: three new families
        "situational_judgment": "What value or principle guides how you make hard calls?",
        "creative_thinking": "Pick any problem from your project and walk me through your thinking.",
        "ai_tool_fluency": "How do you decide whether to trust an AI output?",
        # ✅ ADDED: four new families
        "programming_language": "Which skill or language are you most confident explaining in depth?",
        "skill_verification": "Which skill from your resume are you most confident proving?",
        "certification": "Which thing you have learned recently are you most proud of applying?",
        "self_assessment": "What is one strength you would rate yourself highest on, and why?",
    }
    return switch_questions.get(category, "Which project best proves you are ready for the role you want?")


def _build_emergency_unique_question(
    plan: str,
    asked_question_signatures: set[str],
    asked_questions: list[str] | None = None,
    boost_prefix: str = "",
    difficulty_mode: str = "auto",
    avoid_families: set[str] | None = None,
    recent_angle_signatures: set[str] | None = None,
) -> str:
    """Guarantee a fresh question if both the model and fallback repeat themselves."""
    from app.services.interviewer_templates import _adapt_question_for_difficulty
    asked_questions = asked_questions or []
    avoid_families = {family for family in (avoid_families or set()) if family in QUESTION_FAMILIES}
    recent_angle_signatures = set(recent_angle_signatures or set())
    # ✅ FIXED: was 4 candidates per plan in fixed order. Same student always got
    # the first unused one — effectively always the same emergency question.
    # Fix: expanded to 10 candidates and rotate entry point by asked-question hash
    # so the iteration order differs across sessions.
    emergency_candidates = {
        "free": [
            "Which project or example from your resume are you most comfortable explaining next?",
            "What is one strength that helps you in the kind of role you want next?",
            "Tell me about a time teamwork, pressure, or feedback changed what you did.",
            "What kind of role are you preparing for next, and why does it fit you?",
            "What is one area you are actively working to improve right now?",
            "Which part of your resume best shows what you have learned so far?",
            "What is the most important thing you want an interviewer to remember about you?",
            "Tell me about one decision you made in a project and why you made it.",
            "What would you focus on first if you were given the role you want next?",
            "What is one thing from your work or studies that you are most proud of?",
        ],
        "pro": [
            "Tell me about one technical decision you made and why you made it.",
            "What debugging approach helped you the most in a recent project?",
            "How did you validate whether one recent change actually improved the result?",
            "Which project or decision best proves you fit the kind of role you want next?",
            "What trade-off did you make in a recent project, and why was it the right call?",
            "Tell me about one technical failure and what you learned from fixing it.",
            "What is one technical area you are actively improving right now, and how?",
            "Which part of your technical background would be hardest for another candidate to match?",
            "What is the most technically complex thing you have explained to a non-technical stakeholder?",
            "What would you do differently in your most recent project if you started today?",
        ],
        "career": [
            "What project decision best shows your ownership and judgment?",
            "Which part of your background best proves you fit the role you want next?",
            "What trade-off or constraint taught you the most in your recent work?",
            "Why should a team hire you for the role you want next?",
            "What result from your career are you most confident defending to a hiring panel?",
            "What is the most important thing a hiring manager should know about how you work?",
            "Which experience in your background would be hardest for other candidates to replicate?",
            "What would your first 30 days look like if you were hired into the role you want?",
            "What is one professional habit or judgment call that has made you a better contributor?",
            "How do you want to grow over the next three to five years, and why does your background support that?",
            # ✅ ADDED: one emergency candidate per new family
            "Walk me through a difficult situation you have faced at work or in a project — what was your first step?",
            "How do you actually use AI tools in your day-to-day work? Give me one specific honest example.",
            "Estimate something for me — pick any real-world quantity and walk me through your reasoning step by step.",
        ],
    }.get(plan, [])

    # Rotate entry point by a hash of asked questions so iteration order varies per session
    _rotation_offset = (sum(len(q) for q in asked_questions) + len(asked_questions) * 7) % max(1, len(emergency_candidates))
    rotated_candidates = emergency_candidates[_rotation_offset:] + emergency_candidates[:_rotation_offset]

    for candidate in rotated_candidates:
        candidate_family = _question_family_from_text(candidate)
        candidate_angle_signature = f"{candidate_family}:{_question_angle_from_text(candidate)}"
        if candidate_family in avoid_families:
            continue
        if candidate_angle_signature in recent_angle_signatures:
            continue
        if not _is_duplicate_question(candidate, asked_question_signatures, asked_questions):
            return _merge_boost_with_question(
                boost_prefix,
                _adapt_question_for_difficulty(
                    candidate,
                    plan=plan,
                    category="role_fit" if plan == "career" else "communication_explain",
                    difficulty_mode=difficulty_mode,
                    planned_difficulty="medium",
                ),
            )

    for candidate in rotated_candidates:
        candidate_family = _question_family_from_text(candidate)
        if candidate_family in avoid_families:
            continue
        if not _is_duplicate_question(candidate, asked_question_signatures, asked_questions):
            return _merge_boost_with_question(
                boost_prefix,
                _adapt_question_for_difficulty(
                    candidate,
                    plan=plan,
                    category="role_fit" if plan == "career" else "communication_explain",
                    difficulty_mode=difficulty_mode,
                    planned_difficulty="medium",
                ),
            )

    return _merge_boost_with_question(
        boost_prefix,
        _adapt_question_for_difficulty(
            "What is one thing you would improve in your recent work next time?",
            plan=plan,
            category="learning_growth",
            difficulty_mode=difficulty_mode,
            planned_difficulty="medium",
        ),
    )

