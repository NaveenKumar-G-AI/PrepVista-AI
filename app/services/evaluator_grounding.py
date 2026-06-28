"""
PrepVista AI - Evaluator Grounding & Signal Extraction
Extracted from evaluator.py — constants, utility helpers, question family
detection, grounding fact extraction, and deterministic signal generation.

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
def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z][a-zA-Z0-9.+#-]*", (text or "").lower())
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
        # Preserve the student's own named method — a grounded "better answer"
        # should sharpen their actual decision, not paraphrase the named
        # technique away.
        decision = "use context filtering so only the most relevant context reaches the model"
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
        ("reliable", "more reliable results"),
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

