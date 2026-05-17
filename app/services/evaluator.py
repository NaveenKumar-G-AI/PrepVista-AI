"""
PrepVista AI - Evaluator Service
Per-question rubric evaluation plus deterministic final score aggregation.
Free plan uses a simpler, fairer beginner rubric without changing the higher tiers.
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

logger = structlog.get_logger("prepvista.evaluator")

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "did", "do", "for", "from",
    "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "was",
    "what", "which", "with", "you", "your", "tell", "about", "this", "that",
}

DETAIL_HINTS = {
    "api", "backend", "frontend", "python", "javascript", "typescript", "react", "fastapi",
    "mysql", "postgresql", "mongodb", "supabase", "project", "model", "internship",
    "team", "result", "built", "developed", "implemented", "deployed", "tested",
}

PRO_TECH_HINTS = {
    "rag", "workflow", "pipeline", "retrieval", "embedding", "embeddings", "vector",
    "database", "prompt", "engineering", "hallucination", "mitigation", "testing",
    "adversarial", "benchmark", "metric", "metrics", "latency", "recall", "precision",
    "accuracy", "fastapi", "supabase", "llama", "groq", "api", "backend", "frontend",
    "source-aware", "evaluation", "filtering", "ranking",
}

CAREER_TECH_HINTS = PRO_TECH_HINTS | {
    "ownership", "trade-off", "constraint", "stakeholder", "shortlist", "placement",
    "grounding", "ranking", "retrieval", "deployment", "async", "throughput", "stability",
    "false", "positive", "negative", "classification", "nlp", "summarization", "priority",
    "prioritization", "impact", "outcome", "backend", "users",
}


def _join_phrases_natural(parts: list[str] | tuple[str, ...], max_items: int = 3) -> str:
    cleaned = [_safe_text(part) for part in parts if _safe_text(part)]
    cleaned = cleaned[:max_items]
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"


def _safe_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _coerce_list(value) -> list[str]:
    if isinstance(value, list):
        return [_safe_text(item) for item in value if _safe_text(item)]
    if isinstance(value, str):
        text = _safe_text(value)
        return [text] if text else []
    return []


def _coerce_resume_summary_dict(resume_summary) -> dict:
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


def _resume_field_profile(resume_summary) -> dict:
    summary = _coerce_resume_summary_dict(resume_summary)
    if summary.get("broad_field") and summary.get("target_role_label"):
        return {
            "broad_field": str(summary.get("broad_field") or "general_fresher_mixed"),
            "field_confidence": float(summary.get("field_confidence") or 0.4),
            "target_role_label": str(summary.get("target_role_label") or "the role you want next"),
            "strong_signal_sources": list(summary.get("strong_signal_sources") or []),
        }
    return infer_resume_field_profile(summary)


def _best_resume_project(summary: dict, question_text: str = "", normalized_answer: str = "") -> dict:
    projects = [item for item in summary.get("projects", []) or [] if isinstance(item, dict)]
    if not projects:
        return {}
    answer_blob = f"{question_text} {normalized_answer}".lower()
    for project in projects:
        project_name = _safe_text(project.get("name"))
        if project_name and project_name.lower() in answer_blob:
            return project
    return projects[0]


def _best_resume_tool(summary: dict, question_text: str = "", normalized_answer: str = "") -> str:
    skills = [_safe_text(item) for item in (summary.get("skills") or []) if _safe_text(item)]
    if not skills:
        return ""
    answer_blob = f"{question_text} {normalized_answer}".lower()
    for skill in skills:
        if skill.lower() in answer_blob:
            return skill
    return skills[0]


def _question_family(question_text: str, rubric_category: str) -> str:
    question = _safe_text(question_text).lower()
    category = _safe_text(rubric_category).lower()

    if any(
        phrase in question
        for phrase in [
            "tell me about yourself",
            "introduce yourself",
            "briefly introduce yourself",
            "background and focus",
            "background, strongest area",
        ]
    ):
        return "intro"
    if any(
        phrase in question
        for phrase in [
            "what are you studying",
            "which year",
            "current studies",
            "what are you currently learning",
            "where are you building confidence",
            "what are you focusing on right now",
        ]
    ):
        return "studies_background"
    if any(
        phrase in question
        for phrase in [
            "why should we hire",
            "why should a team hire you",
            "fit the role",
            "role you want",
            "targeting this role",
            "stronger fit",
            "compared to others",
            "if we hired you",
            "first priority if",
            "first 30 days",
            "first month",
            "first 90 days",
            "trust you early",
            "add value early",
            "contribute quickly",
            "what makes you stand out",
            "strength makes you",
            "best proves you fit",
            "prove you fit the role",
            "fit the role you want next",
        ]
    ):
        return "role_fit"
    if any(
        phrase in question
        for phrase in [
            "what did you own",
            "what part was mainly yours",
            "personally own",
            "responsibility there",
            "what exactly did you personally own",
            "what project decision best shows your ownership",
        ]
    ):
        return "ownership"
    if any(phrase in question for phrase in ["workflow", "pipeline", "architecture", "process", "walk me through"]):
        return "workflow"
    if any(phrase in question for phrase in ["tool", "technology", "why did you use", "method", "fastapi", "api", "backend"]):
        return "tool_method"
    if any(
        phrase in question
        for phrase in [
            "what changed in the result",
            "what would you improve next",
            "measure",
            "metric",
            "benchmark",
            "evaluation",
            "validate",
            "test",
            "stress test",
            "what evidence",
            "how did you validate",
            "how did you know",
            "what did you compare",
        ]
    ):
        return "validation"
    if any(
        phrase in question
        for phrase in [
            "trade-off",
            "tradeoff",
            "decision",
            "constraint",
            "choice",
            "what options were you balancing",
            "what final choice",
        ]
    ):
        return "tradeoff"
    if any(
        phrase in question
        for phrase in [
            "weakness",
            "growth area",
            "actively improving",
            "get better at",
            "where do you see yourself",
            "five years",
            "ten years",
            "what is one area you are trying to get better at",
            "what is one skill or work habit you are actively improving",
            "how do you want to grow",
        ]
    ):
        return "learning_growth"
    if any(
        phrase in question
        for phrase in [
            "remember you",
            "final point",
            "remember most",
            "leave with",
            "close out",
            "closeout",
            "reason a hiring panel should remember you",
            "what strength, project, or result would make a hiring panel remember you",
        ]
    ):
        return "closeout"
    if any(
        phrase in question
        for phrase in [
            "team",
            "pressure",
            "feedback",
            "ownership under pressure",
            "worked with others",
            "deadline",
            "how did you handle",
            "changed how you worked",
        ]
    ):
        return "behavioral"
    if any(phrase in question for phrase in ["recruiter", "non-technical", "simple terms", "explain that simply"]):
        return "communication"
    if any(phrase in question for phrase in ["challenge", "problem", "debug", "failure", "issue"]):
        return "behavioral" if category == "behavioral" else "problem_solving"
    return (
        "behavioral"
        if category == "behavioral"
        else "communication"
        if category == "communication"
        else "ownership"
        if category == "project_ownership"
        else "tool_method"
        if category == "technical_depth"
        else "problem_solving"
    )


def _is_low_value_strength(text: str) -> bool:
    normalized = _safe_text(text).lower()
    if not normalized:
        return True
    filler_bits = (
        "reached the question",
        "keyword-only answer",
        "steady response pace",
        "stayed in the interview flow",
        "attempted the question",
        "attempted to explain",
        "gave a technically relevant start",
        "gave enough substance for the interviewer to build on",
    )
    return any(bit in normalized for bit in filler_bits)


def _fallback_strength_from_evaluation(evaluation: dict) -> str:
    question_text = _safe_text(evaluation.get("question_text", ""))
    rubric_category = _safe_text(evaluation.get("rubric_category", ""))
    family = _question_family(question_text, rubric_category)
    score = float(evaluation.get("score", 0) or 0)
    classification = _safe_text(evaluation.get("classification", "")).lower()

    if score < 5.0 and classification not in {"strong", "partial"}:
        return ""

    strengths = {
        "intro": "You gave the interviewer a usable summary of your background instead of staying fully generic.",
        "studies_background": "You connected your current learning to the direction you want to grow in.",
        "ownership": "You showed ownership of one real part of the work instead of speaking only at project level.",
        "workflow": "You described how the work actually moved from step to step.",
        "tool_method": "You connected one tool or method to a practical purpose in the work.",
        "validation": "You tried to show how you checked whether the result really improved.",
        "tradeoff": "You showed that a real choice or trade-off shaped the work.",
        "behavioral": "You used a real situation instead of speaking only in general statements.",
        "communication": "You tried to explain the work in a way another person could follow.",
        "role_fit": "You connected your work to the kind of role you want next.",
        "learning_growth": "You pointed to a real area you are working to improve.",
        "closeout": "You tried to leave the interviewer with a clear reason to remember you.",
    }
    return strengths.get(family, "")


def _field_label_for_feedback(resume_summary) -> str:
    broad_field = _resume_field_profile(resume_summary).get("broad_field", "general_fresher_mixed")
    labels = {
        "ai_ml_data": "AI or ML work",
        "software_backend_frontend": "software work",
        "electronics_embedded": "embedded or electronics work",
        "electrical_core": "electrical engineering work",
        "mechanical_core": "mechanical engineering work",
        "civil_core": "civil engineering work",
        "business_analyst_operations": "analysis or operations work",
        "design_creative": "design work",
        "general_fresher_mixed": "practical work",
        "non_technical_general": "practical work",
    }
    return labels.get(str(broad_field), "practical work")


def _contains_any(text: str, phrases: tuple[str, ...] | list[str]) -> bool:
    lowered = _safe_text(text).lower()
    return any(phrase in lowered for phrase in phrases)


def _extract_grounding_facts(question_text: str, normalized_answer: str, resume_summary) -> dict:
    summary = _coerce_resume_summary_dict(resume_summary)
    cleaned_answer = normalize_transcript(normalized_answer or "", aggressive=True)
    lower_answer = cleaned_answer.lower()
    lower_question = _safe_text(question_text).lower()

    project = _best_resume_project(summary, question_text, cleaned_answer)
    project_name = _safe_text(project.get("name")) or "the project"
    project_description = _safe_text(project.get("description"))
    tool = _best_resume_tool(summary, question_text, cleaned_answer)
    target_role = _safe_text(_resume_field_profile(summary).get("target_role_label")) or "the role you want next"
    candidate_name = _safe_text(summary.get("candidate_name") or summary.get("name"))
    education = _coerce_list(summary.get("education"))
    background = education[0] if education else ""
    if not background and _contains_any(lower_answer, ["final year", "student", "computer science", "engineering"]):
        if "final year" in lower_answer and "computer science" in lower_answer:
            background = "final-year Computer Science"
        elif "computer science" in lower_answer:
            background = "Computer Science"
        elif "engineering" in lower_answer:
            background = "engineering"
        else:
            background = "student"
    project_tokens = [token for token in _tokenize(project_name) if len(token) > 2]
    project_grounded = bool(project_tokens) and any(token in lower_answer for token in project_tokens)
    tool_grounded = bool(tool and tool.lower() in lower_answer)

    method = ""
    method_candidates = (
        "context filtering",
        "retrieval and ranking",
        "retrieval",
        "ranking",
        "systematic testing",
        "testing output quality",
        "output quality checks",
        "evaluation metrics",
        "evaluation checks",
        "prompt engineering",
        "RAG workflow",
        "FastAPI",
        "Python",
        "async API handling",
        "backend workflow",
        "structured output",
        "source-aware summaries",
    )
    for candidate in method_candidates:
        if candidate.lower() in lower_answer:
            method = candidate
            break
    if not method:
        method = tool

    workflow_parts: list[str] = []
    workflow_map = [
        ("input", "take the user input"),
        ("retriev", "retrieve the relevant context"),
        ("filter", "filter the context"),
        ("rank", "rank the strongest information"),
        ("generat", "generate the answer"),
        ("output", "return a structured output"),
    ]
    for marker, phrase in workflow_map:
        if marker in lower_answer and phrase not in workflow_parts:
            workflow_parts.append(phrase)

    decision = ""
    if "context filtering" in lower_answer:
        decision = "filter the context before sending it to the model"
    elif _contains_any(
        lower_answer,
        [
            "filter data before",
            "filter the data before",
            "filter the context before",
            "send only relevant data",
            "send only the most relevant data",
            "only relevant data goes",
            "remove noisy parts before",
        ],
    ):
        decision = "filter the context before sending it to the model"
    elif _contains_any(lower_answer, ["reliability instead of adding features", "focus on stability instead of adding features", "focus on reliability instead of adding features"]):
        decision = "prioritize reliability over adding more features"
    elif "retrieval" in lower_answer and "ranking" in lower_answer:
        decision = "improve retrieval and ranking before answer generation"
    elif "prompt engineering" in lower_answer:
        decision = "tighten the prompt so the output stayed structured and grounded"
    elif "async" in lower_answer:
        decision = "use asynchronous backend handling for a faster workflow"
    elif _contains_any(lower_answer, ["focus on reliability", "prioritize reliability", "stability first"]):
        decision = "prioritize reliability before expanding scope"
    elif _contains_any(lower_answer, ["tested output quality", "measure output quality", "systematic testing"]):
        decision = "measure output quality more systematically"

    outcome_parts: list[str] = []
    outcome_map = [
        ("faster", "faster responses"),
        ("speed", "better speed"),
        ("accurate", "more accurate answers"),
        ("accuracy", "better accuracy"),
        ("reliable", "more reliable output"),
        ("stable", "more stable output"),
        ("consisten", "more consistent output"),
        ("focus", "more focused output"),
        ("clar", "clearer output"),
        ("noise", "less noisy output"),
        ("trust", "more trustworthy output"),
    ]
    for marker, phrase in outcome_map:
        if marker in lower_answer and phrase not in outcome_parts:
            outcome_parts.append(phrase)
    outcome = _join_phrases_natural(outcome_parts[:3])

    validation_parts: list[str] = []
    if _contains_any(lower_answer, ["before and after", "comparing", "compared"]):
        validation_parts.append("before-and-after comparisons")
    if _contains_any(lower_answer, ["different queries", "query types", "broad queries", "mixed data"]):
        validation_parts.append("different query types")
    if "relevance" in lower_answer:
        validation_parts.append("relevance")
    if "consisten" in lower_answer:
        validation_parts.append("consistency")
    if "noise" in lower_answer:
        validation_parts.append("noise reduction")
    if "latency" in lower_answer or "speed" in lower_answer:
        validation_parts.append("speed")
    if "accuracy" in lower_answer:
        validation_parts.append("accuracy")

    challenge = ""
    if _contains_any(lower_answer, ["demo deadline", "tight deadline", "deadline", "demo"]):
        challenge = "a tight demo deadline"
    elif _contains_any(lower_answer, ["feedback", "team", "worked with the team", "pressure"]):
        challenge = "a team pressure or feedback situation"
    elif _contains_any(lower_answer, ["inconsistent", "wrong output", "incorrect output", "hallucination"]):
        challenge = "inconsistent or unreliable output"
    elif _contains_any(lower_answer, ["constraint", "trade-off", "tradeoff"]):
        challenge = "a real technical constraint"

    growth_area = ""
    if _contains_any(lower_answer, ["improving", "get better", "working on", "trying to get better"]):
        if "commun" in lower_answer:
            growth_area = "explaining technical work more clearly"
        elif _contains_any(lower_answer, ["testing", "systematic testing", "test output quality"]):
            growth_area = "testing output quality more systematically"
        elif "retrieval" in lower_answer:
            growth_area = "retrieval quality"
        elif _contains_any(lower_answer, ["measure", "evaluation", "metric", "validate"]):
            growth_area = "measuring output quality more clearly"
        else:
            growth_area = "sharpening technical communication and delivery"

    fit_proof = ""
    if tool and project_grounded and project_name != "the project":
        fit_proof = f"hands-on work with {tool} in {project_name}"
    elif tool:
        fit_proof = f"hands-on work with {tool}"
    elif project_grounded and project_name != "the project":
        fit_proof = f"ownership in {project_name}"

    tradeoff = ""
    if "context" in lower_answer and _contains_any(lower_answer, ["speed", "faster", "clarity", "clearer", "noise", "focus"]):
        tradeoff = "sending more context versus keeping the output faster and cleaner"
    elif _contains_any(lower_answer, ["reliability instead of adding features", "stability instead of adding features"]):
        tradeoff = "adding more features versus improving reliability first"
    elif "trade-off" in lower_answer or "tradeoff" in lower_answer:
        tradeoff = "two useful options under a real constraint"

    improve_next = ""
    if _contains_any(lower_answer, ["improve next", "would improve next", "next i would improve", "next i'd improve"]):
        if "retrieval" in lower_answer and "ranking" in lower_answer:
            improve_next = "improve retrieval and ranking next"
        elif "evaluation" in lower_answer or "metric" in lower_answer or "measure" in lower_answer:
            improve_next = "improve evaluation and measurement next"
        elif "testing" in lower_answer or "test" in lower_answer:
            improve_next = "strengthen testing next"
    elif "retrieval" in lower_answer and "ranking" in lower_answer:
        improve_next = "improve retrieval and ranking next"

    strength_signal = ""
    if _contains_any(lower_answer, ["reliable system", "reliable systems", "reliability", "accurate", "consistent"]):
        strength_signal = "building reliable systems"
    elif _contains_any(lower_answer, ["practical thinker", "practical engineer", "execute", "execution", "not only think"]):
        strength_signal = "turning ideas into execution"
    elif _contains_any(lower_answer, ["practical", "real products", "product thinking", "production ready"]):
        strength_signal = "turning project work into practical product-ready systems"
    elif _contains_any(lower_answer, ["ownership", "end to end", "end-to-end"]):
        strength_signal = "taking ownership of end-to-end workflow decisions"

    hiring_reason = ""
    if _contains_any(lower_answer, ["why should we hire", "stronger fit", "stand out", "remember me"]) and strength_signal:
        hiring_reason = strength_signal
    elif strength_signal and fit_proof:
        hiring_reason = f"{strength_signal} backed by {fit_proof}"
    elif strength_signal:
        hiring_reason = strength_signal
    elif fit_proof:
        hiring_reason = fit_proof

    return {
        "candidate_name": candidate_name,
        "project_name": project_name,
        "project_grounded": project_grounded,
        "project_description": project_description,
        "tool": tool,
        "tool_grounded": tool_grounded,
        "method": method,
        "workflow_parts": workflow_parts,
        "decision": decision,
        "outcome": outcome,
        "validation_parts": validation_parts,
        "challenge": challenge,
        "growth_area": growth_area,
        "tradeoff": tradeoff,
        "target_role": target_role,
        "fit_proof": fit_proof,
        "strength_signal": strength_signal,
        "hiring_reason": hiring_reason,
        "improve_next": improve_next,
        "background": background,
        "cleaned_answer": cleaned_answer,
        "question_text": lower_question,
    }


def _worked_signal_for_family(
    question_text: str,
    rubric_category: str,
    resume_summary,
    *,
    has_resume_overlap: bool,
    has_detail_hint: bool,
    has_decision_logic: bool,
    has_tech_hits: bool,
    word_count: int,
    facts: dict | None = None,
) -> str:
    family = _question_family(question_text, rubric_category)
    facts = facts or _extract_grounding_facts(question_text, "", resume_summary)
    project_name = _safe_text(facts.get("project_name")) or "the project"
    project_grounded = bool(facts.get("project_grounded"))
    method = _safe_text(facts.get("method"))
    decision = _safe_text(facts.get("decision"))
    fit_proof = _safe_text(facts.get("fit_proof"))
    growth_area = _safe_text(facts.get("growth_area"))
    challenge = _safe_text(facts.get("challenge"))
    hiring_reason = _safe_text(facts.get("hiring_reason"))
    strength_signal = _safe_text(facts.get("strength_signal"))

    if family == "intro":
        if strength_signal:
            return f"You gave a relevant introduction and highlighted {strength_signal}."
        if fit_proof:
            return f"You gave a relevant snapshot of your background and linked it to {fit_proof}."
        return "You gave a relevant snapshot of your background instead of staying completely generic."
    if family == "studies_background":
        return "You answered directly about your current background and studies."
    if family == "ownership" and (has_resume_overlap or has_decision_logic):
        if decision:
            project_label = project_name if project_grounded else "the work"
            return f"You pointed to a real part of {project_label} and named your decision to {decision}."
        if project_grounded:
            return f"You pointed to a real part of {project_name} that you handled yourself."
        return "You pointed to a real part of the work that you handled yourself."
    if family == "workflow" and (has_tech_hits or has_detail_hint):
        return "You described a real workflow instead of staying generic about the project."
    if family == "tool_method" and (has_tech_hits or has_detail_hint):
        if method:
            return f"You referenced a real method or tool, such as {method}, instead of staying generic."
        return "You referenced a real method, tool, or workflow instead of staying generic."
    if family == "validation" and (has_detail_hint or has_decision_logic):
        return "You tried to explain how you checked whether the result was improving."
    if family == "tradeoff" and has_decision_logic:
        return "You showed that there was a real decision or trade-off behind the work."
    if family == "behavioral":
        if challenge:
            return f"You used a real situation, {challenge}, instead of answering only in abstract terms."
        return "You used a real situation instead of answering only in abstract terms."
    if family == "communication":
        return "You tried to make the explanation understandable instead of using only raw technical terms."
    if family == "role_fit":
        if hiring_reason:
            return f"You connected your background to the role with a concrete hiring reason: {hiring_reason}."
        if fit_proof:
            return f"You connected your background to the role using {fit_proof}."
        return "You connected your background to the role instead of answering only at a generic level."
    if family == "learning_growth":
        if growth_area:
            return f"You named a real growth area, {growth_area}, instead of giving a generic weakness answer."
        return "You pointed to a real area you are trying to improve."
    if family == "closeout":
        if strength_signal:
            return f"You tried to leave the interviewer with a memorable strength: {strength_signal}."
        return "You tried to leave the interviewer with a clear reason to remember you."
    if word_count >= 10:
        return "You gave enough substance for the interviewer to build on."
    return "You stayed engaged with the question instead of skipping it."


def _missing_signal_for_family(question_text: str, rubric_category: str, *, missing_specificity: bool, missing_structure: bool, missing_depth: bool, missing_match: bool) -> str:
    family = _question_family(question_text, rubric_category)
    if family == "intro":
        return "The answer needed a clearer summary of your strongest fit and one concrete proof point."
    if family == "ownership":
        return "The answer needed a clearer statement of exactly what you owned and what changed after your decision."
    if family == "workflow":
        return "The answer needed a cleaner step-by-step flow and one clear reason behind the design."
    if family == "tool_method":
        return "The answer needed a clearer explanation of what the tool handled and why it was a good fit."
    if family == "validation":
        return "The answer needed one clearer check, comparison, or metric to show how you validated the result."
    if family == "tradeoff":
        return "The answer needed the two options, the key constraint, and the reason your final choice was better."
    if family == "behavioral":
        return "The answer needed a clearer situation, action, and final result."
    if family == "communication":
        return "The answer needed a simpler explanation first and then one clear impact or takeaway."
    if family == "role_fit":
        return "The answer needed one stronger proof point showing why your background fits the role."
    if family == "learning_growth":
        return "The answer needed a clearer growth area, the action you are taking, and why it matters."
    if family == "closeout":
        return "The answer needed one clearer hiring reason or memorable final proof point."
    if missing_specificity:
        return "The answer needed one clearer detail about your role, tool, method, or result."
    if missing_structure:
        return "The answer needed a clearer order so the interviewer could follow it more easily."
    if missing_depth or missing_match:
        return "The answer needed stronger depth and a tighter match to the exact question."
    return "The answer could still be made sharper with one clearer example or outcome."


def _improvement_for_family(question_text: str, rubric_category: str, plan: str) -> str:
    family = _question_family(question_text, rubric_category)
    improvements = {
        "intro": "Answer in this order: who you are -> strongest area -> proof -> goal.",
        "studies_background": "Speak in 2-3 short sentences and connect your current background to what you are building toward.",
        "ownership": "Answer in this order: what you owned -> decision you made -> result.",
        "workflow": "Answer in this order: main steps -> why it was shaped that way -> outcome.",
        "tool_method": "Answer in this order: what it handled -> why you chose it -> what changed.",
        "validation": "Name what you checked, how you compared it, and what conclusion you drew.",
        "tradeoff": "Compare the options briefly, name the key constraint, and then explain why your final choice was better.",
        "behavioral": "Use the order: situation -> action -> result -> lesson.",
        "communication": "Start with a simple explanation, then add why it mattered for the user, recruiter, or team.",
        "role_fit": "State the role fit, then back it up with one project, decision, or result.",
        "learning_growth": "State the growth area, what you are doing about it, and why it matters for your next role.",
        "closeout": "End with one hiring reason, one proof point, and the role you are aiming for.",
        "problem_solving": "Answer in this order: problem -> action -> result -> lesson.",
    }
    improvement = improvements.get(family, "Use the order: context -> action -> reason -> result.")
    if plan == "free" and family in {"ownership", "workflow", "tool_method", "problem_solving"}:
        return "Explain one concrete step from the work, then say what result changed."
    return improvement


def _score_summary_for_family(plan: str, question_text: str, rubric_category: str, total_score: float) -> str:
    family = _question_family(question_text, rubric_category)
    weaker = {
        "free": "The score stayed lower because the answer was too short or too unclear to show full understanding.",
        "pro": "The answer showed partial intent, but it was too short or unclear to prove stronger technical understanding.",
        "career": "The answer had some relevant meaning, but it stayed too short or too shallow to show strong interview-ready depth.",
    }
    stronger_map = {
        "free": {
            "intro": "You answered the introduction, but it still needed a clearer background summary and one supporting proof point.",
            "ownership": "You answered the question, but the specific part you handled and the result still needed to be clearer.",
            "workflow": "You gave a useful start, but the process still needed to sound more step-by-step and concrete.",
            "tool_method": "You mentioned a real method or tool, but the answer still needed one clearer reason and result.",
            "behavioral": "You gave a relevant example, but the situation, action, and result still needed to land more clearly.",
            "communication": "You answered the question, but the explanation still needed to be simpler and more specific.",
            "role_fit": "You answered the question, but the role fit still needed one clearer reason and proof point.",
            "learning_growth": "You named a real improvement area, but the action and why it matters still needed to be clearer.",
        },
        "pro": {
            "intro": "You gave a relevant introduction, but it still needed a clearer strongest fit and one concrete proof point.",
            "ownership": "You gave a relevant project answer, but the ownership, decision, and result needed to land more clearly.",
            "workflow": "You gave a relevant technical explanation, but the workflow and reason behind it needed to be sharper.",
            "tool_method": "You mentioned a real method or tool, but the technical fit and outcome needed to be clearer.",
            "validation": "You answered the validation question, but the exact checks, comparisons, or metrics needed to be clearer.",
            "tradeoff": "You showed there was a decision, but the two options, constraint, and final choice needed to be clearer.",
            "behavioral": "You gave a relevant example, but the action and result needed to feel more interview-ready.",
            "communication": "You gave a relevant explanation, but it still needed a cleaner practical summary and impact.",
            "role_fit": "You connected your background to the role, but the strongest proof point still needed to be clearer.",
        },
        "career": {
            "intro": "You answered the question, but the panel still needed a clearer summary of your strongest fit and one proof point.",
            "ownership": "You showed relevant ownership, but the scope, decision, and business or technical result needed to land more clearly.",
            "workflow": "You described the workflow, but the design logic and final outcome still needed to sound sharper.",
            "tool_method": "You gave a relevant method or tool, but the reason it fit and the change it caused needed to be clearer.",
            "validation": "You answered the validation question, but the evidence still needed one clearer check, comparison, or metric.",
            "tradeoff": "You showed judgment was involved, but the trade-off and final choice still needed to sound more deliberate.",
            "behavioral": "You gave a relevant example, but the situation, action, and lesson still needed to feel more complete.",
            "communication": "You answered the question, but the explanation still needed to sound more concise and panel-ready.",
            "role_fit": "You answered the role-fit question, but the hiring reason and proof point still needed to be stronger.",
            "learning_growth": "You pointed to a real growth area, but how you are improving it and why it matters still needed to be clearer.",
            "closeout": "You gave the panel a closing point, but it still needed a more memorable hiring reason and proof point.",
        },
    }
    threshold = 4.0 if plan == "free" else 4.5 if plan == "career" else 4.0
    if total_score < threshold:
        return weaker.get(plan, weaker["free"])
    return stronger_map.get(plan, {}).get(
        family,
        "You answered the question, but the answer still needed clearer detail and stronger structure.",
    )


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z][a-zA-Z0-9.+#-]*", (text or "").lower())


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
    return any(normalized.startswith(prefix) for prefix in placeholder_prefixes)


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
        "corrected_intent": "",
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
    if _looks_too_generic_for_question(better_answer, question_text, rubric_category):
        better_answer = fallback["ideal_answer"]
    why_score = _sentence(
        _normalize_user_facing_feedback(llm_result.get("why_score"), fallback["scoring_rationale"]),
        fallback["scoring_rationale"],
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
        "corrected_intent": "",
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
