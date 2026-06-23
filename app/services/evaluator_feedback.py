"""
PrepVista AI - Evaluator Feedback & Classification
Extracted from evaluator.py - score normalization, plan-specific
fallback evaluations, heuristic component extraction, classification,
and rubric category normalization.

Re-exported by evaluator.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict

import structlog

from app.config import CATEGORY_WEIGHTS, PLAN_CONFIG
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
    _tokenize,
)

logger = structlog.get_logger("prepvista.evaluator")




def _extract_resume_terms(resume_summary) -> set[str]:
    summary = _coerce_resume_summary_dict(resume_summary)
    terms: set[str] = set()

    for skill in summary.get("skills", []) or []:
        terms.update(_tokenize(_safe_text(skill)))

    for education in summary.get("education", []) or []:
        terms.update(_tokenize(_safe_text(education)))

    for project in summary.get("projects", []) or []:
        if isinstance(project, dict):
            terms.update(_tokenize(_safe_text(project.get("name"))))
            terms.update(_tokenize(_safe_text(project.get("description"))))
            for tech in project.get("tech_stack", []) or []:
                terms.update(_tokenize(_safe_text(tech)))

    for experience in summary.get("experience", []) or []:
        if isinstance(experience, dict):
            terms.update(_tokenize(_safe_text(experience.get("title"))))
            terms.update(_tokenize(_safe_text(experience.get("description"))))

    return {term for term in terms if len(term) > 2}


def _clamp_score(value, maximum: float) -> float:
    try:
        return round(max(0.0, min(maximum, float(value))), 1)
    except Exception:
        return 0.0


def _sentence(text: str, fallback: str) -> str:
    value = _safe_text(text) or fallback
    if not value:
        return ""
    if value[-1:] not in ".!?":
        value += "."
    return value


def _trim_to_sentence_count(text: str, max_sentences: int = 3, max_chars: int = 320) -> str:
    value = re.sub(r"\s+", " ", _safe_text(text)).strip()
    if not value:
        return ""

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", value) if part.strip()]
    if sentences:
        value = " ".join(sentences[:max_sentences])
    else:
        value = " ".join(value.split()[:48]).strip()

    if len(value) > max_chars:
        value = value[:max_chars].rstrip(" ,;:-")

    if value and value[-1:] not in ".!?":
        value += "."
    return value


# Single-letter concept stand-ins (Master Prompt Prohibition 1): a verb or
# connector followed by a lone capital letter used where a real term belongs,
# e.g. "strengthen C", "work with C", "my role was to C", "improve X".
# The char class excludes A (article) and I (pronoun) to avoid false positives;
# the trailing \b means real words like "Class" or "Plan C" wording stays safe.
_PLACEHOLDER_LETTER_RE = re.compile(
    r"\b(?:strengthen|strengthening|improve|improving|improved|work with|working with|"
    r"worked on|work on|working on|use|using|used|leverage|apply|applied|build|building|"
    r"built|handle|handled|own|owned|implement|implemented|focus on|focused on|"
    r"role was to|my role was to|was to)\s+([B-HJ-Z])\b"
)


def _looks_like_placeholder_rewrite(text: str) -> bool:
    normalized = _safe_text(text).lower()
    if not normalized:
        return False
    placeholder_prefixes = (
        "a stronger answer would",
        "a better answer would",
        "this answer should include",
        "the answer should include",
        "a stronger version would",
        "my approach there was",
        "my direct answer is that",
        "i would make it stronger by",
        "the candidate should",
        "the candidate was",
        "i used the method i used",
        "i was balancing two useful options",
        "in the project, i worked on make a practical decision",
    )
    if any(normalized.startswith(prefix) for prefix in placeholder_prefixes):
        return True
    # A grounded better answer is always first person; a slip into "the candidate"
    # means the model narrated about the student instead of speaking as them.
    if "the candidate" in normalized:
        return True
    raw = _safe_text(text)
    # Bracketed/braced/angled template placeholders: [X], [tool name], {name}, <role>.
    # The inner pattern requires a leading letter so math like "x < 5 and y > 3" is safe.
    if re.search(r"[\[\{]\s*[A-Za-z_][\w\s]{0,28}[\]\}]", raw):
        return True
    if re.search(r"<\s*[A-Za-z_][\w\s]{0,28}>", raw):
        return True
    # "option A" / "Option B" used as a concept stand-in.
    if re.search(r"\boption\s+[A-Z]\b", raw):
        return True
    # Scan the original casing — single-letter stand-ins are upper-case.
    return bool(_PLACEHOLDER_LETTER_RE.search(raw))


# Metric-like number: a percentage, a multiplier (3x / "times"), or any figure
# of two or more digits. Single small counts ("two checks", "3 steps") are left
# alone because the grounded templates use them legitimately.
_METRIC_NUMBER_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(%|percent|x|times)?", re.IGNORECASE)


def _contains_invented_metric(text: str, *sources: str) -> bool:
    """True if ``text`` states a metric-like number absent from every source.

    Enforces Master Prompt Prohibition 3 — a better answer may use directional
    language but must never invent a percentage or figure the candidate (or
    their resume / the question) never stated.
    """
    answer = _safe_text(text)
    if not answer:
        return False
    source_blob = " ".join(_safe_text(source) for source in sources).lower()
    for match in _METRIC_NUMBER_RE.finditer(answer):
        number = match.group(1)
        unit = (match.group(2) or "").lower()
        metric_like = bool(unit) or len(number.replace(".", "")) >= 2
        if not metric_like:
            continue
        if number not in source_blob:
            return True
    return False


def _looks_too_generic_for_question(text: str, question_text: str, rubric_category: str) -> bool:
    normalized = _safe_text(text).lower()
    question = _safe_text(question_text).lower()
    if not normalized:
        return True
    generic_prefixes = (
        "in that work, i handled",
        "my project is a strong example because",
        "i'm targeting roles where i can combine",
        "in the project, i worked on make a practical decision",
        "i used the method for the part of the work",
        "i was balancing two useful options under a real constraint",
    )
    if any(normalized.startswith(prefix) for prefix in generic_prefixes):
        return True
    if any(term in question for term in ["tool", "technology", "fastapi", "method"]) and "tool" not in normalized and "method" not in normalized and "fastapi" not in normalized:
        return True
    if rubric_category == "project_ownership" and "owned" not in normalized and "respons" not in normalized:
        return True
    if any(term in question for term in ["measure", "metric", "validate", "benchmark"]) and not any(term in normalized for term in ["measure", "metric", "compare", "check", "validate"]):
        return True
    if any(term in question for term in ["hire you", "fit the role", "stronger fit", "remember you", "stand out", "trust you early", "add value early"]) and not any(term in normalized for term in ["hire", "fit", "role", "remember", "stand out", "value", "contribute", "early"]):
        return True
    if any(term in question for term in ["first priority", "first 30 days", "first month", "if we hired you"]) and not any(term in normalized for term in ["first", "priority", "start", "join", "focus"]):
        return True
    if any(term in question for term in ["pressure", "feedback", "deadline", "team"]) and not any(term in normalized for term in ["pressure", "feedback", "deadline", "team", "learned", "taught"]):
        return True
    return False


def _normalize_user_facing_feedback(text: str, fallback: str = "") -> str:
    value = _safe_text(text) or _safe_text(fallback)
    if not value:
        return ""

    replacements = (
        (r"\bthe candidate's\b", "your"),
        (r"\bcandidate's\b", "your"),
        (r"\bthe candidate\b", "you"),
        (r"\bcandidate\b", "you"),
        (r"\byou did manage to\b", "you"),
        (r"\byou managed to\b", "you"),
        # Mixed-pronoun errors (Master Prompt v4 Phase 7): a second-person clause
        # that slips back into third person about the same candidate. Restricted to
        # a verb whitelist so legitimate "their trust" / "users' needs" survive.
        (
            r"\byou (mentioned|described|said|gave|showed|shared|explained|referenced|noted|talked about|spoke about) (their|his|her)\b",
            r"you \1 your",
        ),
        (r"\btheir (answer|response|reply|intro|introduction)\b", r"your \1"),
    )
    for pattern, replacement in replacements:
        value = re.sub(pattern, replacement, value, flags=re.IGNORECASE)

    value = re.sub(r"\s+", " ", value).strip()
    if value:
        value = value[0].upper() + value[1:]
    return value


def _normalize_content_label(value: str, metric: float) -> str:
    label = _safe_text(value).lower()
    mapping = {
        "none": "None",
        "very weak": "Basic",
        "weak": "Basic",
        "basic": "Basic",
        "fair": "Fair",
        "good": "Good",
        "strong": "Strong",
    }
    if label in mapping:
        return mapping[label]
    if metric >= 4.2:
        return "Strong"
    if metric >= 3.2:
        return "Good"
    if metric >= 2.2:
        return "Fair"
    if metric > 0:
        return "Basic"
    return "None"


def _normalize_communication_label(value: str, metric: float) -> str:
    label = _safe_text(value).lower()
    mapping = {
        "none": "None",
        "weak": "Weak",
        "basic": "Basic",
        "fair": "Basic",
        "clear": "Clear",
        "good": "Clear",
        "strong": "Strong",
    }
    if label in mapping:
        return mapping[label]
    if metric >= 4.2:
        return "Strong"
    if metric >= 3.0:
        return "Clear"
    if metric > 0:
        return "Basic"
    return "None"


def normalize_rubric_category(question_text: str, rubric_category: str, plan: str | None = None) -> str:
    """Tighten category mapping so reports stay credible across all plans."""
    category = _safe_text(rubric_category) or "technical_depth"
    question = _safe_text(question_text).lower()
    category_aliases = {
        "ownership": "project_ownership",
        "workflow_process": "technical_depth",
        "tool_method": "technical_depth",
        "challenge_debugging": "problem_solving",
        "validation_metrics": "technical_depth",
        "tradeoff_decision": "technical_depth",
        "communication_explain": "communication",
        "teamwork_pressure": "behavioral",
        "learning_growth": "behavioral",
        "role_fit": "communication",
        "closeout": "communication",
        "studies_background": "introduction",
        "situational_judgment": "situational_judgment",
        "situational": "situational_judgment",
        "creative_thinking": "creative_thinking",
        "creative": "creative_thinking",
        "ai_tool_fluency": "ai_tool_fluency",
        "ai_fluency": "ai_tool_fluency",
    }
    category = category_aliases.get(category.lower(), category)
    if not question:
        return category

    if any(
        phrase in question
        for phrase in [
            "tell me about yourself",
            "what are you currently studying",
            "what are you studying right now",
            "what are you studying now",
            "which year are you",
            "background",
            "career goal",
        ]
    ):
        return "introduction"
    if any(
        phrase in question
        for phrase in [
            "why should we hire",
            "stronger fit",
            "compared to other",
            "compared to similar",
            "best proves you fit",
            "fit the role",
            "role you want next",
            "first priority if you were hired",
            "first 30 days",
            "first month",
            "first 90 days",
            "if we hired you",
            "focus on first",
            "trust you early",
            "add value early",
            "contribute quickly",
            "hiring panel remember",
            "interviewer should remember",
        ]
    ):
        return "communication"
    if any(phrase in question for phrase in ["explain in simple terms", "simple terms", "how would you explain", "communicate", "walk a non-technical"]):
        return "communication"
    if any(
        phrase in question
        for phrase in [
            "weakness",
            "growth area",
            "what are you improving",
            "actively improving",
            "where do you see yourself",
            "next few years",
            "what changed in your work after that learning or feedback",
        ]
    ):
        return "behavioral"
    if any(phrase in question for phrase in ["conflict", "pressure", "team", "leadership", "collaborat", "stakeholder", "ownership under pressure"]):
        return "behavioral"
    if any(
        phrase in question
        for phrase in [
            "what changed in the result because of that decision",
            "what would you improve next",
        ]
    ):
        return "technical_depth"
    if any(phrase in question for phrase in ["hallucination", "debug", "stress test", "adversarial", "edge case", "failure case", "constraint", "challenge solved", "issue you faced", "issue did you fix", "hardest issue", "how did you fix"]):
        return "problem_solving"
    if any(
        phrase in question
        for phrase in [
            "measure",
            "metrics",
            "trade-off",
            "latency",
            "accuracy",
            "benchmark",
            "technical decision",
            "why did you use",
            "core architecture",
            "pipeline",
            "system design",
            "fastapi",
            "backend",
            "frontend",
            "api",
            "database",
            "tech stack",
            "technology",
            "tool did you use",
            "role fastapi played",
            "workflow",
            "llm",
            "rag",
            "retrieval",
        ]
    ):
        return "technical_depth"
    if any(
        token in question
        for token in [
            "python",
            "sql",
            "fastapi",
            "react",
            "javascript",
            "typescript",
            "api",
            "backend",
            "frontend",
            "tool",
            "technology",
        ]
    ):
        return "technical_depth"
    if any(phrase in question for phrase in ["walk me through", "what was your role", "pipeline you designed", "architecture", "project", "ownership", "role in project"]):
        return "project_ownership"
    if any(
        phrase in question
        for phrase in [
            "what would you do",
            "hypothetical",
            "scenario",
            "if you were",
            "situation where",
            "judgment call",
            "how would you handle",
            "imagine you",
            "what if",
            "priority conflict",
            "ethical dilemma",
        ]
    ):
        return "situational_judgment"
    if any(
        phrase in question
        for phrase in [
            "creative",
            "unconventional",
            "lateral",
            "outside the box",
            "novel approach",
            "brainstorm",
            "innovative",
            "different way",
            "alternative solution",
            "reimagine",
            "rethink",
        ]
    ):
        return "creative_thinking"
    if any(
        phrase in question
        for phrase in [
            "ai tool",
            "chatgpt",
            "copilot",
            "generative ai",
            "prompt engineering",
            "when would you not use ai",
            "ai limitations",
            "ai-assisted",
            "ai augmented",
            "automate with ai",
            "leverage ai",
            "responsible ai",
        ]
    ):
        return "ai_tool_fluency"
    return category


def _normalize_pro_answer_status(value: str, total_score: float, question_match: float, technical_accuracy: float, specificity: float, word_count: int) -> str:
    label = _safe_text(value)
    allowed = {
        "Clarification requested",
        "Relevant but too short",
        "Relevant but unclear",
        "Correct but shallow",
        "Strong",
        "No answer",
    }
    if label in allowed:
        return label
    if label in {"Off-topic", "Wrong"}:
        return "Relevant but unclear"
    if word_count == 0:
        return "No answer"
    if question_match < 0.6:
        return "Relevant but unclear"
    if word_count < 8 or total_score < 3.6:
        return "Relevant but too short"
    if technical_accuracy < 1.0 or specificity < 1.0:
        return "Relevant but unclear"
    if total_score < 7.5:
        return "Correct but shallow"
    return "Strong"


def _pro_classification(answer_status: str) -> str:
    if answer_status in {"No answer", "Clarification requested"}:
        return "silent"
    if answer_status == "Relevant but too short":
        return "vague"
    if answer_status in {"Relevant but unclear", "Correct but shallow"}:
        return "partial"
    return "strong"


def _build_pro_communication_note(technical_understanding: str, communication_clarity: str) -> str:
    if communication_clarity in {"None", "Weak"}:
        return f"Technical understanding: {technical_understanding}. Answer delivery: {communication_clarity}; the idea needs fuller technical sentences."
    if communication_clarity == "Basic":
        return f"Technical understanding: {technical_understanding}. Answer delivery: {communication_clarity}; the answer is understandable but still fragmented."
    return f"Technical understanding: {technical_understanding}. Answer delivery: {communication_clarity}."


def _build_career_interview_note(question_text: str, rubric_category: str, answer_status: str = "") -> str:
    question = _safe_text(question_text).lower()
    category = _safe_text(rubric_category).lower()
    status = _safe_text(answer_status)

    if status in {"Timed out", "System cut off", "User stopped early"}:
        return "Hiring panels still need one clear core point quickly, because incomplete answers weaken confidence even when the candidate may know the topic."
    if status == "Clarification requested":
        return "Clarifying the question is acceptable in a real interview, but the panel will still expect a direct answer once the question is clear."
    if any(term in question for term in ["trade-off", "constraint", "decision", "choice"]):
        return "Hiring panels use this kind of question to judge how you make engineering decisions under constraints, not just what you built."
    if any(term in question for term in ["challenge", "problem", "debug", "failure", "issue", "hallucination"]):
        return "Real interviewers want proof that you can diagnose a problem, choose a fix, and explain what changed afterward."
    if any(term in question for term in ["measure", "metric", "benchmark", "evaluation", "validate"]):
        return "Premium technical rounds look for evidence that you can validate whether a system is reliable enough to trust."
    if category == "project_ownership":
        return "Hiring panels ask this to separate real ownership from general project familiarity."
    if category == "communication":
        return "Recruiters and panels care about whether you can explain technical work clearly to non-technical people as well as engineers."
    if category == "behavioral":
        return "This helps the panel judge ownership, growth, and how you operate with other people under pressure."
    return "This matters because hiring panels want clear proof of ownership, decision-making, and interview-ready communication."


def _fallback_corrected_intent(normalized_answer: str, question_text: str = "", resume_summary=None) -> str:
    return summarize_recovered_intent(
        normalized_answer,
        question_text=question_text,
        resume_summary=resume_summary,
    )


def _timeout_status_from_raw(raw_answer: str) -> str:
    lower = _safe_text(raw_answer)
    if "[SYSTEM_DURATION_EXPIRED]" in lower:
        return "System cut off"
    if "[NO_ANSWER_TIMEOUT]" in lower:
        return "Timed out"
    if "[USER_REQUESTED_END]" in lower:
        return "User stopped early"
    return "No answer"


def _has_answer_marker(raw_answer: str) -> bool:
    return _timeout_status_from_raw(raw_answer) != "No answer"


def _fallback_pro_better_answer(question_text: str, normalized_answer: str, resume_summary, rubric_category: str) -> str:
    return _grounded_better_answer("pro", question_text, normalized_answer, resume_summary, rubric_category)


def _normalize_career_answer_status(
    value: str,
    total_score: float,
    relevance: float,
    depth: float,
    word_count: int,
    raw_answer: str = "",
) -> str:
    marker_status = _timeout_status_from_raw(raw_answer)
    if marker_status != "No answer" and not _safe_text(value):
        return marker_status

    label = _safe_text(value)
    allowed = {
        "Clarification requested",
        "No answer",
        "Relevant but unclear",
        "Timed out",
        "System cut off",
        "User stopped early",
        "Partial answer",
        "Relevant but shallow",
        "Strong",
    }
    if label in allowed:
        return label
    if word_count == 0:
        return "No answer"
    if relevance < 0.6:
        return "Relevant but unclear"
    if word_count < 10 or total_score < 4.0:
        return "Partial answer"
    if depth < 0.9 and total_score < 6.0:
        return "Relevant but unclear"
    if depth < 1.1 or total_score < 7.2:
        return "Relevant but shallow"
    return "Strong"


def _career_classification(answer_status: str) -> str:
    if answer_status in {"Clarification requested", "No answer", "Timed out", "System cut off", "User stopped early"}:
        return "silent"
    if answer_status == "Partial answer":
        return "partial"
    if answer_status in {"Relevant but shallow", "Relevant but unclear"}:
        return "vague"
    return "strong"


def _heuristic_pro_components(question_text: str, normalized_answer: str, resume_summary) -> dict:
    words = _tokenize(normalized_answer)
    question_words = {word for word in _tokenize(question_text) if word not in STOPWORDS}
    answer_words = set(words)
    resume_terms = _extract_resume_terms(resume_summary)
    lower_answer = normalized_answer.lower()
    word_count = len(words)

    overlap_with_question = len(answer_words & question_words)
    overlap_with_resume = len(answer_words & resume_terms)
    tech_hits = len(answer_words & PRO_TECH_HINTS)
    has_number = bool(re.search(r"\b\d+(\.\d+)?\b", normalized_answer))
    has_method_chain = bool(re.search(r"\b(first|then|because|so|after|before|finally|i used|i measured|i tested|i reduced)\b", lower_answer))
    has_sentence_flow = normalized_answer.count(".") > 0 or normalized_answer.count(",") > 0

    question_match = 0.0 if word_count == 0 else 0.5
    if overlap_with_question > 0:
        question_match += 0.9
    if overlap_with_resume > 0:
        question_match += 0.3
    if tech_hits > 0:
        question_match += 0.2
    if word_count >= 8:
        question_match += 0.3
    if "don't know" in lower_answer or "dont know" in lower_answer:
        question_match = min(question_match, 0.6)
    question_match = _clamp_score(question_match, 2.0)

    technical_accuracy = 0.0 if word_count == 0 else 0.4
    if tech_hits > 0:
        technical_accuracy += 0.8
    if overlap_with_resume > 0:
        technical_accuracy += 0.3
    if any(term in lower_answer for term in ["tested", "measured", "reduced", "filtered", "retrieval", "mitigation"]):
        technical_accuracy += 0.4
    if "don't know" in lower_answer or "dont know" in lower_answer:
        technical_accuracy = min(technical_accuracy, 0.6)
    technical_accuracy = _clamp_score(technical_accuracy, 2.0)

    specificity = 0.0 if word_count == 0 else 0.3
    if word_count >= 10:
        specificity += 0.4
    if tech_hits > 1:
        specificity += 0.5
    if has_number:
        specificity += 0.3
    if overlap_with_resume > 0:
        specificity += 0.3
    if any(hint in answer_words for hint in DETAIL_HINTS):
        specificity += 0.3
    specificity = _clamp_score(specificity, 2.0)

    structure = 0.0 if word_count == 0 else 0.3
    if word_count >= 8:
        structure += 0.4
    if has_method_chain:
        structure += 0.8
    elif has_sentence_flow:
        structure += 0.4
    structure = _clamp_score(structure, 2.0)

    communication = 0.0 if word_count == 0 else 0.4
    if word_count >= 6:
        communication += 0.4
    if has_sentence_flow:
        communication += 0.6
    if len(re.findall(r"\b\w+\b", normalized_answer)) >= 12:
        communication += 0.2
    communication = _clamp_score(communication, 2.0)

    return {
        "word_count": word_count,
        "question_match_score": question_match,
        "technical_accuracy_score": technical_accuracy,
        "specificity_score": specificity,
        "structure_score": structure,
        "communication_part_score": communication,
        "has_tech_hits": tech_hits > 0,
        "has_resume_overlap": overlap_with_resume > 0,
    }


def _answer_blueprint_for_family(question_text: str, rubric_category: str) -> str:
    family = _question_family(question_text, rubric_category)
    blueprints = {
        "intro": "Use this structure: who you are -> strongest area -> proof -> goal.",
        "studies_background": "Use this structure: current background -> what you are focusing on -> why it matters.",
        "ownership": "Use this structure: what you owned -> decision you made -> result.",
        "workflow": "Use this structure: main steps -> why it was shaped that way -> outcome.",
        "tool_method": "Use this structure: what the tool or method handled -> why it fit -> result.",
        "validation": "Use this structure: what you checked -> how you compared it -> what conclusion you drew.",
        "tradeoff": "Use this structure: option A -> option B -> key constraint -> your choice -> why.",
        "behavioral": "Use this structure: situation -> action -> result -> lesson.",
        "communication": "Use this structure: simple explanation -> why it mattered -> audience or user impact.",
        "role_fit": "Use this structure: fit signal -> proof from your work -> why it matters for the role.",
        "learning_growth": "Use this structure: growth area -> what you are doing -> why it matters.",
        "closeout": "Use this structure: hiring reason -> proof point -> role or impact.",
        "problem_solving": "Use this structure: problem -> action -> result -> lesson.",
    }
    return blueprints.get(family, "Use this structure: context -> what you did -> why you did it -> result.")


def _grounded_better_answer(plan: str, question_text: str, normalized_answer: str, resume_summary, rubric_category: str) -> str:
    summary = _coerce_resume_summary_dict(resume_summary)
    family = _question_family(question_text, rubric_category)
    field_label = _field_label_for_feedback(summary)
    facts = _extract_grounding_facts(question_text, normalized_answer, summary)
    project_name = _safe_text(facts.get("project_name")) or "the project"
    project_reference = project_name if facts.get("project_grounded") else "the project"
    tool = _safe_text(facts.get("tool"))
    method = _safe_text(facts.get("method")) or tool or "the method"
    decision = _safe_text(facts.get("decision"))
    decision_phrase = decision or (f"strengthen {method}" if method and method != "the method" else "improve the weakest part of the workflow")
    outcome = _safe_text(facts.get("outcome")) or "more reliable output"
    target_role = _safe_text(facts.get("target_role")) or "the role"
    candidate_name = _safe_text(facts.get("candidate_name"))
    background = _safe_text(facts.get("background"))
    workflow_parts = [part for part in (facts.get("workflow_parts") or []) if _safe_text(part)]
    validation_parts = [part for part in (facts.get("validation_parts") or []) if _safe_text(part)]
    challenge = _safe_text(facts.get("challenge")) or "a real project pressure point"
    growth_area = _safe_text(facts.get("growth_area")) or "one area I still want to strengthen"
    tradeoff = _safe_text(facts.get("tradeoff")) or "two useful options under a real constraint"
    fit_proof = _safe_text(facts.get("fit_proof")) or (
        f"real project work in {project_reference}"
        if project_reference != "the project"
        else "hands-on project work"
    )
    strength_signal = _safe_text(facts.get("strength_signal")) or "practical, reliable engineering work"
    hiring_reason = _safe_text(facts.get("hiring_reason")) or fit_proof
    improve_next = _safe_text(facts.get("improve_next")) or "improve the next weak part of the workflow"
    lower_question = _safe_text(question_text).lower()

    intro_name = f"I'm {candidate_name}," if candidate_name else "I'm"
    background_phrase = background or field_label
    workflow_summary = _join_phrases_natural(workflow_parts[:4]) if workflow_parts else ""
    validation_summary = _join_phrases_natural(validation_parts[:3]) if validation_parts else ""
    if background_phrase.lower().startswith(("a ", "an ")):
        intro_background = background_phrase
    else:
        article = "an" if background_phrase[:1].lower() in "aeiou" else "a"
        intro_background = f"{article} {background_phrase} candidate"

    def result_phrase() -> str:
        return outcome or "a more reliable result"

    if family == "intro":
        return _trim_to_sentence_count(
            f"{intro_name} {intro_background} focused on {strength_signal}. In {project_reference}, I worked on {decision_phrase}, which improved {result_phrase()}. I'm targeting {target_role} where I can keep building practical systems that work reliably in real use.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "studies_background":
        return _trim_to_sentence_count(
            f"I'm currently building on {background_phrase} and focusing on {method or field_label}. Right now I'm especially interested in turning that into practical work that leads to {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "ownership":
        return _trim_to_sentence_count(
            f"In {project_reference}, I owned the part of the workflow that handled {workflow_summary or method or 'the main implementation'}. One clear decision I made was to {decision_phrase}. That helped produce {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "workflow":
        return _trim_to_sentence_count(
            f"In {project_reference}, the workflow was to {workflow_summary or 'take the input, process the most relevant information, and return a structured result'}. I shaped it that way so each step had a clear purpose and the system could produce {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "tool_method":
        return _trim_to_sentence_count(
            f"I used {tool or method} in the part of {project_reference} where it had the most impact. It was the right fit because it helped us {decision_phrase} and led to {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "validation":
        if any(term in lower_question for term in ["what changed in the result", "what would you improve next"]):
            return _trim_to_sentence_count(
                f"After the decision to {decision_phrase}, the result became {result_phrase()}. The next improvement I would make is to {improve_next}, so the system can keep improving beyond that first gain.",
                max_sentences=4,
                max_chars=430,
            )
        return _trim_to_sentence_count(
            f"I validated the change by checking {validation_summary or 'before-and-after comparisons'}. I compared the system before and after the decision to {decision_phrase} and saw {result_phrase()}. That told me the change was actually helping.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "tradeoff":
        return _trim_to_sentence_count(
            f"I was balancing {tradeoff}. I chose to {decision_phrase} because it gave the best balance for the situation. The result was {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "behavioral":
        if any(term in lower_question for term in ["what changed in your work after that learning or feedback"]):
            return _trim_to_sentence_count(
                f"After that feedback, I changed my approach to prioritize reliability before extra features. I started testing the output more carefully and refining {method or 'the workflow'} earlier. That made the system more stable and improved {result_phrase()}.",
                max_sentences=4,
                max_chars=430,
            )
        return _trim_to_sentence_count(
            f"In {challenge}, I had to decide what mattered most first. I chose to {decision_phrase}. That helped the team deliver {result_phrase()}, and it taught me to protect reliability before adding extra scope.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "communication":
        return _trim_to_sentence_count(
            f"In simple terms, {project_reference} takes the right information, removes noisy parts, and returns a clearer result. My role was to {decision_phrase}. That mattered because it gave users or the team {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "role_fit":
        if any(term in lower_question for term in ["if we hired you", "if you were hired", "first priority", "focus on first"]):
            return _trim_to_sentence_count(
                f"If I joined that role, my first priority would be to understand the current workflow, identify where quality is being lost, and improve that first. I would start there because my background in {fit_proof} already taught me how to make changes that lead to {result_phrase()}.",
                max_sentences=4,
                max_chars=430,
            )
        if any(term in lower_question for term in ["stronger fit", "compared to others", "stand out"]):
            return _trim_to_sentence_count(
                f"What makes me stand out is {hiring_reason} and the fact that I can explain the decision to {decision_phrase} clearly. That gives me a stronger fit for {target_role} than someone who can only list tools without showing ownership or results.",
                max_sentences=4,
                max_chars=430,
            )
        if any(term in lower_question for term in ["why should", "hire you"]):
            return _trim_to_sentence_count(
                f"A team should hire me for {target_role} because I have already done hands-on work in {project_reference} and made practical decisions like {decision_phrase}. That work helped produce {result_phrase()}, which shows I can contribute beyond just project-level theory.",
                max_sentences=4,
                max_chars=430,
            )
        return _trim_to_sentence_count(
            f"My fit for {target_role} comes from {fit_proof}. In {project_reference}, I worked on {decision_phrase} and helped produce {result_phrase()}. That is why I can contribute to practical work, not only talk about tools.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "learning_growth":
        if any(term in lower_question for term in ["where do you see yourself", "five years", "ten years", "next few years"]):
            return _trim_to_sentence_count(
                f"Over the next few years, I want to grow from strong execution in {field_label} into someone who can own larger decisions and explain them clearly. I want that growth to come from deeper work in areas like {method or growth_area} and from building more projects that lead to {result_phrase()}.",
                max_sentences=4,
                max_chars=430,
            )
        return _trim_to_sentence_count(
            f"One area I am actively improving is {growth_area}. I am working on it by practicing clearer explanations and by checking whether my changes actually lead to {result_phrase()}. That matters because it will make me more effective in {target_role}.",
            max_sentences=4,
            max_chars=430,
        )
    if family == "closeout":
        if any(term in lower_question for term in ["grow", "3 to 5 years", "five years", "ten years"]):
            return _trim_to_sentence_count(
                f"Over the next few years, I want to keep building practical experience in {field_label} and grow into someone who can own larger parts of the product. The path I trust most is continuing to build work like {project_reference}, where I can make decisions such as {decision_phrase} and see {result_phrase()}.",
                max_sentences=4,
                max_chars=430,
            )
        return _trim_to_sentence_count(
            f"The main reason to remember me is that I can take {fit_proof} and turn it into practical results. In {project_reference}, I made a real decision to {decision_phrase}, and that helped deliver {result_phrase()}.",
            max_sentences=4,
            max_chars=430,
        )
    return _trim_to_sentence_count(
        f"In {project_reference}, I would answer this by naming the context, the part I handled, the decision to {decision_phrase}, and the result of {result_phrase()}. That makes the answer specific and interview-ready.",
        max_sentences=4,
        max_chars=430,
    )


def _career_answer_blueprint(question_text: str, rubric_category: str) -> str:
    return _answer_blueprint_for_family(question_text, rubric_category)


def _fallback_career_better_answer(question_text: str, normalized_answer: str, resume_summary, rubric_category: str) -> str:
    return _grounded_better_answer("career", question_text, normalized_answer, resume_summary, rubric_category)


def _heuristic_career_components(question_text: str, normalized_answer: str, resume_summary) -> dict:
    words = _tokenize(normalized_answer)
    question_words = {word for word in _tokenize(question_text) if word not in STOPWORDS}
    answer_words = set(words)
    resume_terms = _extract_resume_terms(resume_summary)
    lower_answer = normalized_answer.lower()
    word_count = len(words)

    overlap_with_question = len(answer_words & question_words)
    overlap_with_resume = len(answer_words & resume_terms)
    tech_hits = len(answer_words & CAREER_TECH_HINTS)
    has_number = bool(re.search(r"\b\d+(\.\d+)?\b", normalized_answer))
    has_structure_flow = bool(re.search(r"\b(first|then|because|after|before|finally|so|I chose|I used|I improved|the result)\b", normalized_answer, re.IGNORECASE))
    has_decision_logic = bool(re.search(r"\b(chose|trade[- ]?off|because|constraint|priority|decision|impact|improved|result)\b", lower_answer))
    has_sentence_flow = normalized_answer.count(".") > 0 or normalized_answer.count(",") > 0

    relevance = 0.0 if word_count == 0 else 0.5
    if overlap_with_question > 0:
        relevance += 0.8
    if overlap_with_resume > 0:
        relevance += 0.3
    if tech_hits > 0:
        relevance += 0.2
    if word_count >= 10:
        relevance += 0.2
    relevance = _clamp_score(relevance, 2.0)

    depth = 0.0 if word_count == 0 else 0.3
    if tech_hits > 0:
        depth += 0.4
    if tech_hits > 1:
        depth += 0.3
    if has_decision_logic:
        depth += 0.5
    if any(term in lower_answer for term in ["trade-off", "constraint", "measured", "tested", "improved", "filtered", "retrieval", "ranking"]):
        depth += 0.4
    depth = _clamp_score(depth, 2.0)

    specificity = 0.0 if word_count == 0 else 0.3
    if word_count >= 12:
        specificity += 0.4
    if has_number:
        specificity += 0.3
    if overlap_with_resume > 0:
        specificity += 0.3
    if tech_hits > 1:
        specificity += 0.4
    if any(hint in answer_words for hint in DETAIL_HINTS):
        specificity += 0.3
    specificity = _clamp_score(specificity, 2.0)

    structure = 0.0 if word_count == 0 else 0.3
    if word_count >= 10:
        structure += 0.3
    if has_structure_flow:
        structure += 0.8
    elif has_sentence_flow:
        structure += 0.4
    structure = _clamp_score(structure, 2.0)

    communication = 0.0 if word_count == 0 else 0.4
    if word_count >= 8:
        communication += 0.4
    if has_sentence_flow:
        communication += 0.6
    if len(re.findall(r"\b\w+\b", normalized_answer)) >= 16:
        communication += 0.2
    communication = _clamp_score(communication, 2.0)

    return {
        "word_count": word_count,
        "relevance_score": relevance,
        "depth_score": depth,
        "specificity_score": specificity,
        "structure_score": structure,
        "communication_part_score": communication,
        "has_tech_hits": tech_hits > 0,
        "has_resume_overlap": overlap_with_resume > 0,
        "has_decision_logic": has_decision_logic,
    }


def _free_status_from_metrics(word_count: int, total_score: float, relevance: float) -> str:
    if word_count == 0:
        return "No answer"
    if word_count < 5 or total_score < 3.0:
        return "Answered briefly"
    if total_score < 6.0 or relevance < 1.5:
        return "Answered partly"
    return "Answered clearly"


def _normalize_free_answer_status(value: str, total_score: float, relevance: float, word_count: int) -> str:
    label = _safe_text(value)
    mapping = {
        "No answer": "No answer",
        "Answered briefly": "Answered briefly",
        "Answered partly": "Answered partly",
        "Answered clearly": "Answered clearly",
        "Answered strongly": "Answered clearly",
        "Partial": "Answered partly",
        "Vague": "Answered briefly",
        "Strong": "Answered clearly",
    }
    if label in mapping:
        return mapping[label]
    return _free_status_from_metrics(word_count, total_score, relevance)


def _free_classification(answer_status: str, total_score: float, relevance: float, basic_accuracy: float, word_count: int) -> str:
    if answer_status == "No answer" or word_count == 0:
        return "silent"
    if relevance <= 0.8 and basic_accuracy <= 0.8 and total_score <= 2.8:
        return "wrong"
    if answer_status == "Answered briefly":
        return "vague"
    if answer_status == "Answered partly":
        return "partial"
    return "strong"


def _fallback_better_answer(question_text: str, normalized_answer: str, resume_summary, rubric_category: str) -> str:
    return _grounded_better_answer("free", question_text, normalized_answer, resume_summary, rubric_category)


def _heuristic_free_components(question_text: str, normalized_answer: str, resume_summary) -> dict:
    words = _tokenize(normalized_answer)
    question_words = {word for word in _tokenize(question_text) if word not in STOPWORDS}
    answer_words = set(words)
    resume_terms = _extract_resume_terms(resume_summary)
    lower_answer = normalized_answer.lower()
    word_count = len(words)

    overlap_with_question = len(answer_words & question_words)
    overlap_with_resume = len(answer_words & resume_terms)
    has_detail_hint = any(hint in answer_words for hint in DETAIL_HINTS) or bool(re.search(r"\b\d+\b", normalized_answer))
    has_structure_hint = bool(re.search(r"\b(first|then|because|so|finally|my role|i used|the result)\b", lower_answer))
    has_complete_sentence = normalized_answer.count(".") > 0 or normalized_answer.count(",") > 0

    relevance = 0.0 if word_count == 0 else 0.6
    if overlap_with_question > 0:
        relevance += 0.7
    elif overlap_with_resume > 0:
        relevance += 0.5
    if word_count >= 8:
        relevance += 0.2
    if "don't know" in lower_answer or "dont know" in lower_answer:
        relevance = min(relevance, 0.8)
    relevance = _clamp_score(relevance, 2.0)

    basic_accuracy = 0.0 if word_count == 0 else 0.5
    if overlap_with_question > 0:
        basic_accuracy += 0.3
    if overlap_with_resume > 0:
        basic_accuracy += 0.4
    if has_detail_hint:
        basic_accuracy += 0.4
    if word_count >= 6:
        basic_accuracy += 0.2
    if "don't know" in lower_answer or "dont know" in lower_answer:
        basic_accuracy = min(basic_accuracy, 0.6)
    basic_accuracy = _clamp_score(basic_accuracy, 2.0)

    specificity = 0.0 if word_count == 0 else 0.3
    if word_count >= 9:
        specificity += 0.4
    if overlap_with_resume > 0:
        specificity += 0.4
    if has_detail_hint:
        specificity += 0.6
    specificity = _clamp_score(specificity, 2.0)

    structure = 0.0 if word_count == 0 else 0.2
    if word_count >= 8:
        structure += 0.4
    if has_structure_hint:
        structure += 0.8
    elif has_complete_sentence:
        structure += 0.4
    structure = _clamp_score(structure, 2.0)

    communication = 0.0 if word_count == 0 else 0.4
    if word_count >= 6:
        communication += 0.4
    if has_complete_sentence:
        communication += 0.6
    if word_count >= 12:
        communication += 0.2
    communication = _clamp_score(communication, 2.0)

    return {
        "word_count": word_count,
        "relevance_score": relevance,
        "clarity_score": basic_accuracy,
        "specificity_score": specificity,
        "structure_score": structure,
        "communication_part_score": communication,
        "has_resume_overlap": overlap_with_resume > 0,
        "has_detail_hint": has_detail_hint,
    }


def _fallback_free_evaluation(
    question_text: str,
    raw_answer: str,
    normalized_answer: str,
    resume_summary,
    rubric_category: str,
) -> dict:
    metrics = _heuristic_free_components(question_text, normalized_answer, resume_summary)
    facts = _extract_grounding_facts(question_text, normalized_answer, resume_summary)
    total_score = round(
        metrics["relevance_score"]
        + metrics["clarity_score"]
        + metrics["specificity_score"]
        + metrics["structure_score"]
        + metrics["communication_part_score"],
        1,
    )
    answer_status = _normalize_free_answer_status("", total_score, metrics["relevance_score"], metrics["word_count"])
    content_understanding = _normalize_content_label("", metrics["relevance_score"] + metrics["clarity_score"])
    communication_clarity = _normalize_communication_label("", metrics["communication_part_score"] + metrics["structure_score"])

    worked_signal = _worked_signal_for_family(
        question_text,
        rubric_category,
        resume_summary,
        has_resume_overlap=metrics["has_resume_overlap"],
        has_detail_hint=metrics["has_detail_hint"],
        has_decision_logic=False,
        has_tech_hits=metrics["has_detail_hint"],
        word_count=metrics["word_count"],
        facts=facts,
    )
    missing_signal = _missing_signal_for_family(
        question_text,
        rubric_category,
        missing_specificity=metrics["specificity_score"] < 1.5,
        missing_structure=metrics["structure_score"] < 1.5,
        missing_depth=False,
        missing_match=metrics["relevance_score"] < 1.5,
    )
    improve = _improvement_for_family(question_text, rubric_category, "free")
    why_score = _score_summary_for_family("free", question_text, rubric_category, total_score)

    return {
        "classification": _free_classification(
            answer_status,
            total_score,
            metrics["relevance_score"],
            metrics["clarity_score"],
            metrics["word_count"],
        ),
        "score": total_score,
        "relevance_score": metrics["relevance_score"],
        "clarity_score": metrics["clarity_score"],
        "specificity_score": metrics["specificity_score"],
        "structure_score": metrics["structure_score"],
        "answer_status": answer_status,
        "content_understanding": content_understanding,
        "depth_quality": "",
        "communication_clarity": communication_clarity,
        "scoring_rationale": _sentence(why_score, "The answer needs clearer details and structure."),
        "missing_elements": [missing_signal],
        "ideal_answer": _trim_to_sentence_count(
            _fallback_better_answer(question_text, normalized_answer, resume_summary, rubric_category),
            max_sentences=3,
        ),
        "communication_score": round(metrics["communication_part_score"] * 5, 1),
        "communication_notes": f"Idea quality: {content_understanding}. Speaking clarity: {communication_clarity}.",
        "what_worked": _sentence(worked_signal, "You attempted the question instead of skipping it."),
        "what_was_missing": _sentence(missing_signal, "The answer needs one clearer detail."),
        "how_to_improve": _sentence(improve, "Speak in 2-3 short sentences and include one clear example."),
        "answer_blueprint": "",
        "corrected_intent": _fallback_corrected_intent(normalized_answer, question_text, resume_summary),
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }


def _normalize_free_result(
    raw_answer: str,
    normalized_answer: str,
    question_text: str,
    resume_summary,
    rubric_category: str,
    llm_result: dict,
) -> dict:
    fallback = _fallback_free_evaluation(
        question_text=question_text,
        raw_answer=raw_answer,
        normalized_answer=normalized_answer,
        resume_summary=resume_summary,
        rubric_category=rubric_category,
    )

    relevance = _clamp_score(llm_result.get("relevance_score", fallback["relevance_score"]), 2.0)
    clarity = _clamp_score(llm_result.get("clarity_score", fallback["clarity_score"]), 2.0)
    specificity = _clamp_score(llm_result.get("specificity_score", fallback["specificity_score"]), 2.0)
    structure = _clamp_score(llm_result.get("structure_score", fallback["structure_score"]), 2.0)
    communication_part = _clamp_score(llm_result.get("communication_score", fallback["communication_score"] / 5), 2.0)
    relevance = _clamp_score(relevance, 2.0)
    total_score = round(relevance + clarity + specificity + structure + communication_part, 1)

    word_count = len(_tokenize(normalized_answer))
    answer_status = _normalize_free_answer_status(
        _safe_text(llm_result.get("answer_status")),
        total_score,
        relevance,
        word_count,
    )
    content_understanding = _normalize_content_label(
        _safe_text(llm_result.get("content_understanding")),
        relevance + clarity,
    )
    communication_clarity = _normalize_communication_label(
        _safe_text(llm_result.get("communication_clarity")),
        communication_part + structure,
    )

    what_worked = _sentence(
        _normalize_user_facing_feedback(llm_result.get("what_worked"), fallback["what_worked"]),
        fallback["what_worked"],
    )
    what_was_missing = _sentence(
        _normalize_user_facing_feedback(llm_result.get("what_was_missing"), fallback["what_was_missing"]),
        fallback["what_was_missing"],
    )
    how_to_improve = _sentence(
        _normalize_user_facing_feedback(llm_result.get("how_to_improve"), fallback["how_to_improve"]),
        fallback["how_to_improve"],
    )
    better_answer = _trim_to_sentence_count(
        _safe_text(llm_result.get("better_answer")) or fallback["ideal_answer"],
        max_sentences=3,
    )
    if _looks_like_placeholder_rewrite(better_answer):
        better_answer = fallback["ideal_answer"]
    if _looks_too_generic_for_question(better_answer, question_text, rubric_category):
        better_answer = fallback["ideal_answer"]
    if _contains_invented_metric(better_answer, normalized_answer, question_text, resume_summary):
        better_answer = fallback["ideal_answer"]
    why_score = _sentence(
        _normalize_user_facing_feedback(llm_result.get("why_score"), fallback["scoring_rationale"]),
        fallback["scoring_rationale"],
    )

    corrected_intent = _sentence(
        llm_result.get("corrected_intent"),
        fallback["corrected_intent"] or normalized_answer,
    )

    missing_elements = _coerce_list(llm_result.get("missing_elements"))
    if not missing_elements:
        missing_elements = _coerce_list(fallback["missing_elements"])

    return {
        "classification": _free_classification(answer_status, total_score, relevance, clarity, word_count),
        "score": total_score,
        "relevance_score": relevance,
        "clarity_score": clarity,
        "specificity_score": specificity,
        "structure_score": structure,
        "answer_status": answer_status,
        "content_understanding": content_understanding,
        "depth_quality": "",
        "communication_clarity": communication_clarity,
        "scoring_rationale": why_score,
        "missing_elements": missing_elements[:3],
        "ideal_answer": better_answer,
        "communication_score": round(communication_part * 5, 1),
        "communication_notes": f"Idea quality: {content_understanding}. Speaking clarity: {communication_clarity}.",
        "what_worked": what_worked,
        "what_was_missing": what_was_missing,
        "how_to_improve": how_to_improve,
        "answer_blueprint": "",
        "corrected_intent": corrected_intent,
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }


def _fallback_pro_evaluation(
    question_text: str,
    raw_answer: str,
    normalized_answer: str,
    resume_summary,
    rubric_category: str,
) -> dict:
    metrics = _heuristic_pro_components(question_text, normalized_answer, resume_summary)
    facts = _extract_grounding_facts(question_text, normalized_answer, resume_summary)
    total_score = round(
        metrics["question_match_score"]
        + metrics["technical_accuracy_score"]
        + metrics["specificity_score"]
        + metrics["structure_score"]
        + metrics["communication_part_score"],
        1,
    )
    answer_status = _normalize_pro_answer_status(
        "",
        total_score,
        metrics["question_match_score"],
        metrics["technical_accuracy_score"],
        metrics["specificity_score"],
        metrics["word_count"],
    )
    technical_understanding = _normalize_content_label(
        "",
        metrics["question_match_score"] + metrics["technical_accuracy_score"],
    )
    communication_clarity = _normalize_communication_label(
        "",
        metrics["communication_part_score"] + metrics["structure_score"],
    )

    worked_signal = _worked_signal_for_family(
        question_text,
        rubric_category,
        resume_summary,
        has_resume_overlap=metrics["has_resume_overlap"],
        has_detail_hint=metrics["specificity_score"] >= 1.1,
        has_decision_logic=metrics["structure_score"] >= 1.1,
        has_tech_hits=metrics["has_tech_hits"],
        word_count=metrics["word_count"],
        facts=facts,
    )
    missing_signal = _missing_signal_for_family(
        question_text,
        rubric_category,
        missing_specificity=metrics["specificity_score"] < 1.1,
        missing_structure=metrics["structure_score"] < 1.1,
        missing_depth=metrics["technical_accuracy_score"] < 1.1,
        missing_match=metrics["question_match_score"] < 1.1,
    )
    improvement = _improvement_for_family(question_text, rubric_category, "pro")

    why_score = _score_summary_for_family("pro", question_text, rubric_category, total_score)

    return {
        "classification": _pro_classification(answer_status),
        "score": total_score,
        "relevance_score": metrics["question_match_score"],
        "clarity_score": metrics["technical_accuracy_score"],
        "specificity_score": metrics["specificity_score"],
        "structure_score": metrics["structure_score"],
        "answer_status": answer_status,
        "content_understanding": technical_understanding,
        "communication_clarity": communication_clarity,
        "scoring_rationale": _sentence(why_score, "The answer needs stronger technical depth and structure."),
        "missing_elements": [missing_signal],
        "ideal_answer": _fallback_pro_better_answer(question_text, normalized_answer, resume_summary, rubric_category),
        "communication_score": round(metrics["communication_part_score"] * 5, 1),
        "communication_notes": _build_pro_communication_note(technical_understanding, communication_clarity),
        "what_worked": _sentence(worked_signal, "You gave a technically relevant start."),
        "what_was_missing": _sentence(missing_signal, "The answer needs clearer technical detail."),
        "how_to_improve": _sentence(improvement, "Answer in this order: method -> reason -> result."),
        "corrected_intent": _fallback_corrected_intent(normalized_answer, question_text, resume_summary),
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }


def _normalize_pro_result(
    raw_answer: str,
    normalized_answer: str,
    question_text: str,
    resume_summary,
    rubric_category: str,
    llm_result: dict,
) -> dict:
    fallback = _fallback_pro_evaluation(
        question_text=question_text,
        raw_answer=raw_answer,
        normalized_answer=normalized_answer,
        resume_summary=resume_summary,
        rubric_category=rubric_category,
    )

    question_match = _clamp_score(llm_result.get("question_match_score", fallback["relevance_score"]), 2.0)
    technical_accuracy = _clamp_score(llm_result.get("technical_accuracy_score", fallback["clarity_score"]), 2.0)
    specificity = _clamp_score(llm_result.get("specificity_score", fallback["specificity_score"]), 2.0)
    structure = _clamp_score(llm_result.get("structure_score", fallback["structure_score"]), 2.0)
    communication_part = _clamp_score(llm_result.get("communication_score", fallback["communication_score"] / 5), 2.0)
    total_score = round(question_match + technical_accuracy + specificity + structure + communication_part, 1)

    word_count = len(_tokenize(normalized_answer))
    answer_status = _normalize_pro_answer_status(
        _safe_text(llm_result.get("answer_status")),
        total_score,
        question_match,
        technical_accuracy,
        specificity,
        word_count,
    )
    technical_understanding = _normalize_content_label(
        _safe_text(llm_result.get("technical_understanding") or llm_result.get("content_understanding")),
        question_match + technical_accuracy,
    )
    communication_clarity = _normalize_communication_label(
        _safe_text(llm_result.get("communication_clarity")),
        communication_part + structure,
    )

    corrected_intent = _sentence(
        llm_result.get("corrected_intent"),
        fallback["corrected_intent"] or normalized_answer,
    )
    what_worked = _sentence(
        _normalize_user_facing_feedback(llm_result.get("what_worked"), fallback["what_worked"]),
        fallback["what_worked"],
    )
    what_was_missing = _sentence(
        _normalize_user_facing_feedback(llm_result.get("what_was_missing"), fallback["what_was_missing"]),
        fallback["what_was_missing"],
    )
    how_to_improve = _sentence(
        _normalize_user_facing_feedback(llm_result.get("how_to_improve"), fallback["how_to_improve"]),
        fallback["how_to_improve"],
    )
    llm_better_answer = _safe_text(llm_result.get("better_answer"))
    better_answer = (
        fallback["ideal_answer"]
        if not llm_better_answer or _looks_like_placeholder_rewrite(llm_better_answer)
        else _trim_to_sentence_count(llm_better_answer, max_sentences=4, max_chars=420)
    )
    if _looks_too_generic_for_question(better_answer, question_text, rubric_category):
        better_answer = fallback["ideal_answer"]
    if _contains_invented_metric(better_answer, normalized_answer, question_text, resume_summary):
        better_answer = fallback["ideal_answer"]
    why_score = _sentence(
        _normalize_user_facing_feedback(llm_result.get("why_score"), fallback["scoring_rationale"]),
        fallback["scoring_rationale"],
    )

    missing_elements = _coerce_list(llm_result.get("missing_elements"))
    if not missing_elements:
        missing_elements = _coerce_list(fallback["missing_elements"])

    return {
        "classification": _pro_classification(answer_status),
        "score": total_score,
        "relevance_score": question_match,
        "clarity_score": technical_accuracy,
        "specificity_score": specificity,
        "structure_score": structure,
        "answer_status": answer_status,
        "content_understanding": technical_understanding,
        "communication_clarity": communication_clarity,
        "scoring_rationale": why_score,
        "missing_elements": missing_elements[:3],
        "ideal_answer": better_answer,
        "communication_score": round(communication_part * 5, 1),
        "communication_notes": _build_pro_communication_note(technical_understanding, communication_clarity),
        "what_worked": what_worked,
        "what_was_missing": what_was_missing,
        "how_to_improve": how_to_improve,
        "corrected_intent": corrected_intent,
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }


def _career_marker_response(raw_answer: str) -> dict | None:
    status = _timeout_status_from_raw(raw_answer)
    if status == "No answer":
        return None

    if status == "Timed out":
        rationale = "The candidate did not complete the answer before the silence timeout."
        improve = "Use a 3-part answer: problem -> action -> result. Start with the main point in the first sentence."
    elif status == "System cut off":
        rationale = "The interview timer ended before the answer was completed."
        improve = "Lead with the main decision first, then add one method detail and one result so the core answer lands quickly."
    else:
        rationale = "The interview ended before the answer was completed."
        improve = "Use short complete sentences and finish the core point before adding extra detail."

    return {
        "classification": "silent",
        "score": 0,
        "relevance_score": 0,
        "clarity_score": 0,
        "specificity_score": 0,
        "structure_score": 0,
        "answer_status": status,
        "content_understanding": "None",
        "depth_quality": "None",
        "communication_clarity": "None",
        "scoring_rationale": rationale,
        "missing_elements": ["A complete answer was not captured"],
        "ideal_answer": "",
        "communication_score": 0,
        "communication_notes": _build_career_interview_note("", "", status),
        "what_worked": "You stayed in the interview flow until this question.",
        "what_was_missing": "A complete answer was not captured for evaluation.",
        "how_to_improve": improve,
        "answer_blueprint": "Use this structure: direct answer -> one method/detail -> one result.",
        "corrected_intent": "",
        "raw_answer": raw_answer,
        "normalized_answer": "",
    }


def _fallback_career_evaluation(
    question_text: str,
    raw_answer: str,
    normalized_answer: str,
    resume_summary,
    rubric_category: str,
) -> dict:
    marker_response = _career_marker_response(raw_answer)
    if marker_response:
        return marker_response

    metrics = _heuristic_career_components(question_text, normalized_answer, resume_summary)
    facts = _extract_grounding_facts(question_text, normalized_answer, resume_summary)
    total_score = round(
        metrics["relevance_score"]
        + metrics["depth_score"]
        + metrics["specificity_score"]
        + metrics["structure_score"]
        + metrics["communication_part_score"],
        1,
    )
    answer_status = _normalize_career_answer_status(
        "",
        total_score,
        metrics["relevance_score"],
        metrics["depth_score"],
        metrics["word_count"],
        raw_answer,
    )
    content_quality = _normalize_content_label("", metrics["relevance_score"] + metrics["specificity_score"])
    depth_quality = _normalize_content_label("", metrics["depth_score"] + metrics["specificity_score"])
    communication_quality = _normalize_communication_label("", metrics["communication_part_score"] + metrics["structure_score"])

    worked_signal = _worked_signal_for_family(
        question_text,
        rubric_category,
        resume_summary,
        has_resume_overlap=metrics["has_resume_overlap"],
        has_detail_hint=metrics["specificity_score"] >= 1.1,
        has_decision_logic=metrics["has_decision_logic"],
        has_tech_hits=metrics["has_tech_hits"],
        word_count=metrics["word_count"],
        facts=facts,
    )
    missing_signal = _missing_signal_for_family(
        question_text,
        rubric_category,
        missing_specificity=metrics["specificity_score"] < 1.1,
        missing_structure=metrics["structure_score"] < 1.1,
        missing_depth=metrics["depth_score"] < 1.1,
        missing_match=metrics["relevance_score"] < 1.1,
    )
    improve = _improvement_for_family(question_text, rubric_category, "career")

    why_score = _score_summary_for_family("career", question_text, rubric_category, total_score)
    why_this_matters = _build_career_interview_note(question_text, rubric_category, answer_status)

    return {
        "classification": _career_classification(answer_status),
        "score": total_score,
        "relevance_score": metrics["relevance_score"],
        "clarity_score": metrics["depth_score"],
        "specificity_score": metrics["specificity_score"],
        "structure_score": metrics["structure_score"],
        "answer_status": answer_status,
        "content_understanding": content_quality,
        "depth_quality": depth_quality,
        "communication_clarity": communication_quality,
        "scoring_rationale": _sentence(why_score, "The answer needs stronger depth and structure."),
        "missing_elements": [missing_signal],
        "ideal_answer": _fallback_career_better_answer(question_text, normalized_answer, resume_summary, rubric_category),
        "communication_score": round(metrics["communication_part_score"] * 5, 1),
        "communication_notes": why_this_matters,
        "what_worked": _sentence(worked_signal, "You gave the interviewer something relevant to build on."),
        "what_was_missing": _sentence(missing_signal, "The answer needed stronger depth and detail."),
        "how_to_improve": improve,
        "answer_blueprint": _career_answer_blueprint(question_text, rubric_category),
        "corrected_intent": _fallback_corrected_intent(normalized_answer, question_text, resume_summary),
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }


def _normalize_career_result(
    raw_answer: str,
    normalized_answer: str,
    question_text: str,
    resume_summary,
    rubric_category: str,
    llm_result: dict,
) -> dict:
    fallback = _fallback_career_evaluation(
        question_text=question_text,
        raw_answer=raw_answer,
        normalized_answer=normalized_answer,
        resume_summary=resume_summary,
        rubric_category=rubric_category,
    )

    if fallback["answer_status"] in {"Timed out", "System cut off", "User stopped early"}:
        return fallback

    relevance = _clamp_score(llm_result.get("relevance_score", fallback["relevance_score"]), 2.0)
    depth = _clamp_score(llm_result.get("depth_score", fallback["clarity_score"]), 2.0)
    specificity = _clamp_score(llm_result.get("specificity_score", fallback["specificity_score"]), 2.0)
    structure = _clamp_score(llm_result.get("structure_score", fallback["structure_score"]), 2.0)
    communication_part = _clamp_score(llm_result.get("communication_score", fallback["communication_score"] / 5), 2.0)
    total_score = round(relevance + depth + specificity + structure + communication_part, 1)

    word_count = len(_tokenize(normalized_answer))
    answer_status = _normalize_career_answer_status(
        _safe_text(llm_result.get("answer_status")),
        total_score,
        relevance,
        depth,
        word_count,
        raw_answer,
    )
    content_quality = _normalize_content_label(
        _safe_text(llm_result.get("content_quality") or llm_result.get("content_understanding")),
        relevance + specificity,
    )
    depth_quality = _normalize_content_label(
        _safe_text(llm_result.get("depth_quality")),
        depth + specificity,
    )
    communication_quality = _normalize_communication_label(
        _safe_text(llm_result.get("communication_quality") or llm_result.get("communication_clarity")),
        communication_part + structure,
    )

    corrected_intent = _sentence(
        llm_result.get("corrected_intent"),
        fallback["corrected_intent"] or normalized_answer,
    )
    what_worked = _sentence(
        _normalize_user_facing_feedback(llm_result.get("what_worked"), fallback["what_worked"]),
        fallback["what_worked"],
    )
    what_was_missing = _sentence(
        _normalize_user_facing_feedback(llm_result.get("what_was_missing"), fallback["what_was_missing"]),
        fallback["what_was_missing"],
    )
    how_to_improve = _sentence(
        _normalize_user_facing_feedback(llm_result.get("how_to_improve"), fallback["how_to_improve"]),
        fallback["how_to_improve"],
    )
    better_answer = _safe_text(llm_result.get("better_answer")) or fallback["ideal_answer"]
    if _looks_like_placeholder_rewrite(better_answer):
        better_answer = fallback["ideal_answer"]
    better_answer = _trim_to_sentence_count(better_answer, max_sentences=4, max_chars=430) or fallback["ideal_answer"]
    if _looks_too_generic_for_question(better_answer, question_text, rubric_category):
        better_answer = fallback["ideal_answer"]
    if _contains_invented_metric(better_answer, normalized_answer, question_text, resume_summary):
        better_answer = fallback["ideal_answer"]
    why_score = _sentence(
        _normalize_user_facing_feedback(llm_result.get("why_score"), fallback["scoring_rationale"]),
        fallback["scoring_rationale"],
    )
    answer_blueprint = _sentence(
        _normalize_user_facing_feedback(llm_result.get("answer_blueprint"), fallback["answer_blueprint"]),
        fallback["answer_blueprint"],
    )
    why_this_matters = _sentence(
        _normalize_user_facing_feedback(llm_result.get("why_this_matters"), fallback["communication_notes"]),
        fallback["communication_notes"],
    )

    missing_elements = _coerce_list(llm_result.get("missing_elements"))
    if not missing_elements:
        missing_elements = _coerce_list(fallback["missing_elements"])

    return {
        "classification": _career_classification(answer_status),
        "score": total_score,
        "relevance_score": relevance,
        "clarity_score": depth,
        "specificity_score": specificity,
        "structure_score": structure,
        "answer_status": answer_status,
        "content_understanding": content_quality,
        "depth_quality": depth_quality,
        "communication_clarity": communication_quality,
        "scoring_rationale": why_score,
        "missing_elements": missing_elements[:3],
        "ideal_answer": better_answer,
        "communication_score": round(communication_part * 5, 1),
        "communication_notes": why_this_matters,
        "what_worked": what_worked,
        "what_was_missing": what_was_missing,
        "how_to_improve": how_to_improve,
        "answer_blueprint": answer_blueprint,
        "corrected_intent": corrected_intent,
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }


def _fallback_evaluation(raw_answer: str, normalized_answer: str) -> dict:
    answer_length = len(normalized_answer.split())

    if answer_length <= 3:
        return {
            "classification": "vague",
            "score": 2,
            "scoring_rationale": "The answer is too short to evaluate depth or relevance accurately.",
            "missing_elements": ["More detail", "Specific examples"],
            "ideal_answer": "",
            "communication_score": 2,
            "communication_notes": "Expand the answer with more complete sentences.",
            "what_worked": "You attempted the question.",
            "what_was_missing": "The answer was too short to show clear understanding.",
            "how_to_improve": "Use 2-3 short sentences and include one concrete detail.",
            "depth_quality": "",
            "answer_blueprint": "",
            "corrected_intent": "",
            "raw_answer": raw_answer,
            "normalized_answer": normalized_answer,
        }

    if answer_length <= 18:
        return {
            "classification": "partial",
            "score": 5,
            "scoring_rationale": "The answer contains relevant meaning but needs more structure and detail.",
            "missing_elements": ["More specifics", "Clearer impact or reasoning"],
            "ideal_answer": "",
            "communication_score": 5,
            "communication_notes": "Add more detail and a clearer structure.",
            "what_worked": "You included relevant information.",
            "what_was_missing": "The answer needs clearer detail and stronger structure.",
            "how_to_improve": "Explain your role, what you used, and the result in order.",
            "depth_quality": "",
            "answer_blueprint": "",
            "corrected_intent": "",
            "raw_answer": raw_answer,
            "normalized_answer": normalized_answer,
        }

    return {
        "classification": "partial",
        "score": 6,
        "scoring_rationale": "The answer appears relevant, but it still needs stronger specifics and clearer structure.",
        "missing_elements": ["Sharper structure", "Stronger specifics"],
        "ideal_answer": "",
        "communication_score": 6,
        "communication_notes": "The answer is understandable and should be made more precise.",
        "what_worked": "You gave a meaningful answer.",
        "what_was_missing": "The answer still needs more exact detail.",
        "how_to_improve": "Add a stronger example and explain the impact more clearly.",
        "depth_quality": "",
        "answer_blueprint": "",
        "corrected_intent": "",
        "raw_answer": raw_answer,
        "normalized_answer": normalized_answer,
    }