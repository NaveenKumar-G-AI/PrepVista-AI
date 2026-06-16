"""
PrepVista AI - Interviewer Helpers
Extracted from interviewer.py - pure utility functions for resume parsing,
answer analysis, question signature handling, and turn state management.

Re-exported by interviewer.py (barrel file) for backward compatibility.
"""

import json
import re
from typing import Any

import structlog

from app.services.resume_parser import infer_resume_field_profile

from app.services.interviewer_constants import (
    QUESTION_CUE_PREFIXES,
    QUESTION_INTRO_PREFIXES,
    QUESTION_SIGNATURE_REPLACEMENTS,
    QUESTION_STOP_WORDS,
    QUESTION_STYLE_HINTS,
    FIELD_FOCUS_ANGLES,
    TECHNICAL_SIGNAL_TERMS,
    POSITIVE_SIGNAL_TERMS,
    STUDY_SIGNAL_TERMS,
    ROLE_SIGNAL_TERMS,
    STRENGTH_SIGNAL_TERMS,
    OWNERSHIP_SIGNAL_TERMS,
    WORKFLOW_SIGNAL_TERMS,
    VALIDATION_SIGNAL_TERMS,
    DECISION_SIGNAL_TERMS,
    TEAM_SIGNAL_TERMS,
    GROWTH_SIGNAL_TERMS,
    QUESTION_FAMILIES,
)


from app.services.transcript import normalize_transcript, clean_for_display

logger = structlog.get_logger("prepvista.interviewer")

def _clean_ai_response(text: str) -> str:
    """Strip leaked internal classifier labels and keep one clean interviewer message.

    Only strips lines that look like classifier headers (CLASSIFICATION:, Strong:, etc.)
    from the START of the response.  Valid multi-sentence or multi-line questions are
    preserved — do NOT collapse all newlines to the first line, as that would silently
    truncate legitimate two-part questions.
    """
    cleaned = re.sub(r"^(CLASSIFICATION:?\s*\w+\s*\|?\s*)", "", text or "", flags=re.IGNORECASE).strip()
    cleaned = re.sub(
        r"^(\**\b(Strong|Partial|Vague|Wrong|Silent)\b\**:\s*)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()

    # Collapse excessive internal whitespace but keep intentional line breaks
    # that may separate a transition phrase from the actual question.
    cleaned = re.sub(r"[ \t]+", " ", cleaned).strip()

    # Only collapse to the first non-empty line when the subsequent lines are
    # clearly leaked evaluation artefacts (start with known classifier words).
    if "\n" in cleaned:
        lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
        classifier_pattern = re.compile(
            r"^(CLASSIFICATION|SCORE|RATIONALE|Strong|Partial|Vague|Wrong|Silent)\b",
            re.IGNORECASE,
        )
        # If every line after the first is a classifier artefact, keep only the first.
        if len(lines) > 1 and all(classifier_pattern.match(line) for line in lines[1:]):
            cleaned = lines[0]
        else:
            # Otherwise join as a single space-separated string to avoid rendering
            # issues while still keeping the full question content.
            cleaned = " ".join(lines)

    return cleaned


def _coerce_question_plan(question_plan) -> list[dict]:
    """Normalize stored question-plan data into a list of dict items."""
    if isinstance(question_plan, list):
        return [item for item in question_plan if isinstance(item, dict)]

    if isinstance(question_plan, str):
        try:
            parsed = json.loads(question_plan)
            if isinstance(parsed, list):
                return [item for item in parsed if isinstance(item, dict)]
        except Exception:
            return []

    return []


def _resume_highlight(resume_summary) -> str:
    """Build a short highlight for deterministic fallback prompts."""
    if isinstance(resume_summary, str):
        try:
            resume_summary = json.loads(resume_summary)
        except Exception:
            resume_summary = {}

    if not isinstance(resume_summary, dict):
        return "your background"

    skills = [skill for skill in resume_summary.get("skills", []) if isinstance(skill, str) and skill.strip()]
    projects = [project for project in resume_summary.get("projects", []) if isinstance(project, dict)]
    experience = [item for item in resume_summary.get("experience", []) if isinstance(item, dict)]

    if skills:
        return f"your work with {skills[0]}"
    if projects and projects[0].get("name"):
        return f"your project {projects[0]['name']}"
    if experience and experience[0].get("title"):
        return f"your experience as {experience[0]['title']}"
    return "your background"


def _coerce_resume_summary_dict(resume_summary) -> dict:
    """Normalize stored resume summary payloads into a dictionary."""
    if isinstance(resume_summary, dict):
        return resume_summary

    if isinstance(resume_summary, str):
        try:
            parsed = json.loads(resume_summary)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}

    return {}


def _resume_field_profile(resume_summary: dict) -> dict:
    """Use additive resume field routing without breaking older stored summaries."""
    summary = dict(resume_summary or {})
    if not summary:
        return infer_resume_field_profile({})
    if summary.get("broad_field") and summary.get("target_role_label"):
        return {
            "broad_field": str(summary.get("broad_field") or "general_fresher_mixed"),
            "field_confidence": float(summary.get("field_confidence") or 0.4),
            "target_role_label": str(summary.get("target_role_label") or "the role you want next"),
            "strong_signal_sources": list(summary.get("strong_signal_sources") or []),
        }
    inferred = infer_resume_field_profile(summary)
    summary.update(inferred)
    return inferred


def _resume_primary_project(resume_summary: dict, index: int = 0) -> dict | None:
    projects = [project for project in resume_summary.get("projects", []) if isinstance(project, dict)]
    if index < len(projects):
        return projects[index]
    return None


def _resume_primary_skill(resume_summary: dict) -> str:
    skills = [skill for skill in resume_summary.get("skills", []) if isinstance(skill, str) and skill.strip()]
    return skills[0].strip() if skills else ""


def _resume_target_role(resume_summary: dict) -> str:
    """Infer a simple human-readable target role from resume summary signals."""
    field_profile = _resume_field_profile(resume_summary)
    target_role_label = str(field_profile.get("target_role_label") or "").strip()
    if target_role_label:
        return target_role_label

    inferred_role = normalize_transcript(str(resume_summary.get("inferred_role") or ""), aggressive=True).lower()
    if any(term in inferred_role for term in ["ai", "llm", "nlp", "ml", "machine"]):
        return "AI Engineer roles"
    if any(term in inferred_role for term in ["backend", "api", "server"]):
        return "backend engineering roles"
    if any(term in inferred_role for term in ["data", "analytics"]):
        return "data and AI roles"

    experience = [item for item in resume_summary.get("experience", []) if isinstance(item, dict)]
    if experience and experience[0].get("title"):
        return f"{str(experience[0]['title']).strip()} roles"

    return "the role you want next"


def _field_focus_angle(resume_summary: dict, family: str) -> str:
    field_profile = _resume_field_profile(resume_summary)
    broad_field = str(field_profile.get("broad_field") or "general_fresher_mixed")
    field_focus = FIELD_FOCUS_ANGLES.get(broad_field, FIELD_FOCUS_ANGLES["general_fresher_mixed"])
    return field_focus.get(family, "the experience you can explain most clearly")


def _get_next_plan_item(question_plan, upcoming_turn: int) -> dict | None:
    """Return the next planned question item for a turn, if present."""
    return next(
        (
            item for item in _coerce_question_plan(question_plan)
            if int(item.get("turn", 0) or 0) == upcoming_turn
        ),
        None,
    )


def _normalize_topic_label(value: str) -> str:
    """Create a compact topic label for skip/follow-up tracking."""
    normalized = normalize_transcript(value or "", aggressive=True).lower()
    normalized = re.sub(r"[^a-z0-9\s_-]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized[:120]


def _contains_any(text: str, phrases: list[str] | tuple[str, ...] | set[str]) -> bool:
    lowered = normalize_transcript(text or "", aggressive=True).lower()
    return any(str(phrase).lower() in lowered for phrase in phrases)


def _extract_family_history(value: Any) -> list[str]:
    """Safely normalize stored family-history data from runtime state."""
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            if value.strip():
                return [value.strip()]
    return []


def _trim_family_history(families: list[str], max_items: int = 16) -> list[str]:
    """Keep tracked family history small and deduplicated in order."""
    cleaned: list[str] = []
    for family in families:
        family_name = _normalize_plan_category(str(family or ""), fallback="communication_explain")
        if family_name and family_name not in cleaned:
            cleaned.append(family_name)
    return cleaned[-max_items:]


def _normalize_candidate_name(name: str) -> str:
    """Normalize noisy extracted names so greetings sound natural instead of letter-by-letter."""
    cleaned = clean_for_display(name or "") or ""
    cleaned = re.sub(r"[^A-Za-z\s.'-]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return "Candidate"

    if re.fullmatch(r"(?:[A-Za-z]\s+){1,}[A-Za-z]", cleaned):
        cleaned = cleaned.replace(" ", "")

    words: list[str] = []
    for word in cleaned.split():
        if len(word) == 1:
            words.append(word.upper())
            continue
        if word.isupper():
            words.append(word.capitalize())
            continue
        words.append(word[0].upper() + word[1:])

    normalized = " ".join(words).strip()
    return normalized[:40] or "Candidate"


def _resume_answer_terms(resume_summary: dict) -> set[str]:
    """Collect a small set of resume-grounded terms that help detect covered angles."""
    summary = _coerce_resume_summary_dict(resume_summary)
    terms: set[str] = set()

    for skill in [item for item in summary.get("skills", []) if isinstance(item, str)]:
        normalized_skill = normalize_transcript(skill, aggressive=True).lower().strip()
        if normalized_skill and len(normalized_skill) >= 3:
            terms.add(normalized_skill)

    for project in [item for item in summary.get("projects", []) if isinstance(item, dict)]:
        project_name = normalize_transcript(str(project.get("name") or ""), aggressive=True).lower().strip()
        if project_name and len(project_name) >= 3:
            terms.add(project_name)

    inferred_role = normalize_transcript(str(summary.get("inferred_role") or ""), aggressive=True).lower().strip()
    if inferred_role:
        terms.add(inferred_role.replace("_", " "))

    return terms


def _short_target_role_label(resume_summary: dict | None = None) -> str:
    """Return a cleaner human role label for anchored live questions."""
    role = _resume_target_role(_coerce_resume_summary_dict(resume_summary or {}))
    role = re.sub(r"\s+roles?$", "", role or "", flags=re.IGNORECASE).strip()
    return role or "the role you want next"


def _extract_answer_anchor_facts(answer_text: str, resume_summary: dict | None = None) -> dict[str, str]:
    """Pull a few concrete facts from the last answer so follow-ups can sound interviewer-led."""
    summary = _coerce_resume_summary_dict(resume_summary or {})
    cleaned_answer = clean_for_display(normalize_transcript(answer_text or "", aggressive=True) or answer_text or "") or ""
    lowered_answer = cleaned_answer.lower()

    project_name = ""
    projects = [project for project in summary.get("projects", []) if isinstance(project, dict)]
    for project in projects:
        raw_name = clean_for_display(str(project.get("name") or "")) or ""
        normalized_name = normalize_transcript(raw_name, aggressive=True).lower().strip()
        if not raw_name or not normalized_name:
            continue
        tokens = [token for token in normalized_name.split() if len(token) >= 3]
        if normalized_name in lowered_answer or (tokens and sum(token in lowered_answer for token in tokens) >= max(1, min(2, len(tokens)))):
            project_name = raw_name
            break

    if not project_name:
        primary_project = _resume_primary_project(summary)
        fallback_project_name = clean_for_display(str((primary_project or {}).get("name") or "")) or ""
        if fallback_project_name and any(term in lowered_answer for term in ["project", "system", "workflow", "demo", "internship"]):
            project_name = fallback_project_name

    metric_claim = ""
    metric_number = re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent|ms|milliseconds?|seconds?|sec|x)\b", lowered_answer)
    metric_keyword = next(
        (
            term for term in [
                "latency",
                "response time",
                "accuracy",
                "precision",
                "recall",
                "speed",
                "reliability",
                "consistency",
                "noise",
                "performance",
            ]
            if term in lowered_answer
        ),
        "",
    )
    if metric_keyword and metric_number:
        window_start = max(0, min(lowered_answer.find(metric_keyword), metric_number.start()) - 28)
        window_end = min(len(lowered_answer), max(lowered_answer.find(metric_keyword) + len(metric_keyword), metric_number.end()) + 28)
        metric_window = lowered_answer[window_start:window_end]
        if any(term in metric_window for term in ["reduce", "reduced", "drop", "dropped", "lower", "lowered"]):
            metric_claim = f"{metric_keyword} dropped by {metric_number.group(0)}"
        elif any(term in metric_window for term in ["improve", "improved", "increase", "increased", "better"]):
            metric_claim = f"{metric_keyword} improved by {metric_number.group(0)}"
        else:
            metric_claim = f"{metric_keyword} changed by {metric_number.group(0)}"

    method_phrase = ""
    for phrase in [
        "context filtering",
        "retrieval ranking",
        "structured output",
        "adversarial testing",
        "systematic testing",
        "grounded retrieval",
        "reranking",
        "caching",
        "async processing",
    ]:
        if phrase in lowered_answer:
            method_phrase = phrase
            break
    if not method_phrase:
        # Limit capture to 40 chars and stop at common clause connectors to avoid
        # greedily absorbing the next sentence.
        decision_match = re.search(
            r"\b(?:decided to|decision was to|chose to|used|implemented|introduced|added|built|focused on|prioritized|shifted to)\s+([a-z0-9][a-z0-9 \-_/]{2,40})",
            lowered_answer,
        )
        if decision_match:
            candidate = re.split(
                r"\b(?:because|which|that|so that|to improve|to reduce|to make|and|but|since)\b",
                decision_match.group(1),
            )[0]
            method_phrase = candidate.strip(" ,.-")[:40]

    outcome_phrase = ""
    for phrase in [
        "faster responses",
        "more accurate answers",
        "more reliable output",
        "more consistent output",
        "more stable output",
        "less noisy output",
        "lower latency",
        "better accuracy",
        "better speed",
        "clearer output",
        "better output quality",
    ]:
        if phrase in lowered_answer:
            outcome_phrase = phrase
            break
    if not outcome_phrase:
        outcome_match = re.search(
            r"\b(?:more|less|better|lower)\s+(?:accurate|reliable|consistent|stable|focused|clear|noisy|fast|faster|latency|speed|quality|output)\b(?:\s+\w+){0,2}",
            lowered_answer,
        )
        if outcome_match:
            outcome_phrase = outcome_match.group(0).strip()

    strength_phrase = ""
    strength_match = re.search(r"\b(?:strength|strongest area|good at|best at)\s+(?:is|was)?\s*([a-z0-9][a-z0-9 \-_/]{2,42})", lowered_answer)
    if strength_match:
        strength_phrase = strength_match.group(1).strip(" ,.-")

    return {
        "project_name": project_name,
        "metric_claim": metric_claim,
        "method_phrase": method_phrase,
        "outcome_phrase": outcome_phrase,
        "strength_phrase": strength_phrase,
        "target_role": _short_target_role_label(summary),
    }


def _build_answer_anchor_summary(answer_text: str, resume_summary: dict | None = None) -> str:
    """Compress the last answer into a short fact list for the live follow-up prompt."""
    facts = _extract_answer_anchor_facts(answer_text, resume_summary)
    parts: list[str] = []
    if facts.get("project_name"):
        parts.append(f"project={facts['project_name']}")
    if facts.get("metric_claim"):
        parts.append(f"claim={facts['metric_claim']}")
    elif facts.get("outcome_phrase"):
        parts.append(f"result={facts['outcome_phrase']}")
    if facts.get("method_phrase"):
        parts.append(f"method={facts['method_phrase']}")
    if facts.get("strength_phrase"):
        parts.append(f"strength={facts['strength_phrase']}")
    return "; ".join(parts[:4])


def _extract_answer_coverage(question_text: str, answer_text: str, resume_summary: dict | None = None) -> set[str]:
    """Infer which interview families the latest answer already covered well enough to avoid immediate repeats."""
    normalized_answer = normalize_transcript(answer_text or "", aggressive=True).lower()
    if not normalized_answer:
        return set()

    covered = {_question_family_from_text(question_text or "", fallback_category="communication_explain")}
    resume_terms = _resume_answer_terms(resume_summary or {})

    if any(term in normalized_answer for term in ["i am", "my name is", "i'm", "background", "final year", "student"]):
        covered.add("introduction")

    if any(term in normalized_answer for term in STUDY_SIGNAL_TERMS):
        covered.add("studies_background")

    if any(term in normalized_answer for term in ROLE_SIGNAL_TERMS):
        covered.add("role_fit")

    if any(term in normalized_answer for term in OWNERSHIP_SIGNAL_TERMS):
        covered.add("ownership")

    if any(term in normalized_answer for term in WORKFLOW_SIGNAL_TERMS):
        covered.add("workflow_process")

    if any(term in normalized_answer for term in VALIDATION_SIGNAL_TERMS):
        covered.add("validation_metrics")

    if any(term in normalized_answer for term in DECISION_SIGNAL_TERMS):
        covered.add("tradeoff_decision")

    if any(term in normalized_answer for term in TEAM_SIGNAL_TERMS):
        covered.add("teamwork_pressure")

    if any(term in normalized_answer for term in GROWTH_SIGNAL_TERMS):
        covered.add("learning_growth")

    if any(term in normalized_answer for term in TECHNICAL_SIGNAL_TERMS) or any(
        term in normalized_answer for term in resume_terms
    ):
        covered.add("tool_method")

    if any(term in normalized_answer for term in ["project", "internship", "demo", "deadline", "feedback"]):
        covered.add("challenge_debugging")

    if any(term in normalized_answer for term in ["remember", "stand out", "why hire", "strong fit", "best fit"]):
        covered.add("closeout")

    return {family for family in covered if family in QUESTION_FAMILIES}


def _derive_redundant_followup_families(previous_question: str, answer_text: str, resume_summary: dict | None = None) -> set[str]:
    """Turn answer coverage into a small next-turn family blocklist to avoid awkward repeated prompts."""
    previous_family = _question_family_from_text(previous_question or "", fallback_category="communication_explain")
    covered = _extract_answer_coverage(previous_question, answer_text, resume_summary)
    blocked = {previous_family}

    if previous_family == "introduction":
        blocked.update(
            family
            for family in covered
            if family in {"introduction", "studies_background", "role_fit", "closeout", "communication_explain"}
        )
    elif previous_family == "studies_background":
        blocked.update(
            family
            for family in covered
            if family in {"studies_background", "introduction", "role_fit", "communication_explain"}
        )
    elif previous_family == "role_fit":
        blocked.update(family for family in covered if family in {"role_fit", "closeout", "introduction"})
    elif previous_family == "learning_growth":
        blocked.update(family for family in covered if family in {"learning_growth"})
    elif previous_family == "teamwork_pressure":
        blocked.update(family for family in covered if family in {"teamwork_pressure"})
    elif previous_family == "communication_explain":
        blocked.update(family for family in covered if family in {"communication_explain", "role_fit", "closeout"})

    return {family for family in blocked if family in QUESTION_FAMILIES}


def _build_answer_led_followup(plan: str, previous_question: str, user_text: str, resume_summary: dict | None = None) -> str:
    """Return a deterministic next question when the last answer already implies the right next step."""
    if plan == "free":
        return _build_free_followup_question(previous_question, user_text, resume_summary or {})
    if plan == "pro":
        return _build_pro_followup_question(previous_question, user_text, resume_summary or {})
    if plan == "career":
        return _build_career_followup_question(previous_question, user_text, resume_summary or {})
    return ""


def _should_force_answer_led_followup(previous_question: str, user_text: str, candidate_question: str) -> bool:
    """Detect when the generated next question ignores what the candidate just answered."""
    previous_family = _question_family_from_text(previous_question)
    candidate_family = _question_family_from_text(candidate_question)
    candidate_lower = normalize_transcript(candidate_question or "", aggressive=True).lower()
    signals = _answer_signal_profile(user_text)

    if _is_ambiguous_followup_question(candidate_question):
        return True

    if previous_family in {
        "introduction",
        "studies_background",
        "ownership",
        "workflow_process",
        "tool_method",
        "validation_metrics",
        "tradeoff_decision",
        "communication_explain",
        "teamwork_pressure",
        "learning_growth",
        "role_fit",
    } and not _is_easy_to_understand_question(candidate_question):
        return True

    if previous_family == "introduction":
        if candidate_family in {"introduction", "studies_background", "communication_explain"}:
            return True
        if signals["mentions_degree"] and signals["mentions_role_goal"] and candidate_family not in {
            "ownership",
            "workflow_process",
            "tool_method",
            "role_fit",
            "challenge_debugging",
        }:
            return True
        if signals["mentions_project"] and signals["mentions_degree"] and any(
            term in candidate_lower for term in ["study", "studying", "background", "degree", "course"]
        ):
            return True
        if signals["mentions_project"] and not any(
            term in candidate_lower for term in [
                "project",
                "example",
                "work",
                "owned",
                "own",
                "part",
                "decision",
                "result",
                "role",
                "strength",
                "fit",
            ]
        ):
            return True
        if signals["mentions_project"] and not (
            signals["mentions_decision"] or signals["mentions_ownership"] or signals["mentions_workflow"]
        ) and candidate_family == "communication_explain":
            return True

    if previous_family == "studies_background":
        if candidate_family in {"studies_background", "communication_explain"}:
            return True
        if signals["mentions_project"] and not any(
            term in candidate_lower for term in ["project", "example", "workflow", "part", "role", "skill", "tool"]
        ):
            return True

    if previous_family == "role_fit":
        if candidate_family in {"role_fit", "closeout"}:
            return True
        if signals["mentions_project"] and signals["mentions_outcome"] and not any(
            term in candidate_lower for term in ["project", "decision", "result", "proof", "first", "hire", "fit"]
        ):
            return True

    if previous_family == "ownership" and signals["mentions_outcome"] and candidate_family in {"ownership", "communication_explain"}:
        return True

    if previous_family == "workflow_process" and (
        signals["mentions_workflow"] or signals["mentions_method"] or signals["mentions_outcome"]
    ) and candidate_family in {"workflow_process", "communication_explain"}:
        return True

    if previous_family == "tool_method" and (
        signals["mentions_method"] or signals["mentions_outcome"]
    ) and candidate_family in {"tool_method", "communication_explain"}:
        return True

    if previous_family == "validation_metrics" and signals["mentions_validation"] and (
        signals["mentions_outcome"] or signals["mentions_decision"]
    ) and candidate_family in {"validation_metrics", "communication_explain"}:
        return True

    if previous_family == "tradeoff_decision" and signals["mentions_decision"] and (
        signals["mentions_outcome"] or signals["mentions_method"]
    ) and candidate_family in {"tradeoff_decision", "communication_explain"}:
        return True

    if previous_family == "teamwork_pressure" and signals["mentions_outcome"] and candidate_family == "teamwork_pressure":
        return True

    if previous_family == "learning_growth" and signals["mentions_role_goal"] and candidate_family == "learning_growth":
        return True

    if previous_family == "communication_explain" and signals["mentions_outcome"] and candidate_family == "communication_explain":
        return True

    return False

from app.services.interviewer_question_engine import (
    _normalize_plan_category,
    _question_family_from_text,
    _build_free_followup_question,
    _answer_signal_profile,
    _is_ambiguous_followup_question,
    _is_easy_to_understand_question,
)

from app.services.interviewer_templates import (
    _build_pro_followup_question,
    _build_career_followup_question,
)
