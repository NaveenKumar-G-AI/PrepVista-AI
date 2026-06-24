"""
PrepVista AI - Interview Summary Contracts & Premium HR Evaluation Engine
=========================================================================
Shared turn-outcome constants, canonical summary computation, and a full
HR-grade report generator used by finish scoring, PDF, analytics, and
user-facing reports.

Backward-compatible: all existing public names, constants, and return shapes
are preserved exactly. New capabilities are purely additive:
  - CANONICAL_RUBRIC_CATEGORIES / CANONICAL_CATEGORY_DISPLAY_NAMES and the
    *_SCORE_SCALE_MAX constants + normalize_score_to_100() are the shared
    source of truth for analytics.py's category vocabulary and score scaling
    (see module docstring section "CROSS-FILE CONTRACTS" below).
  - compute_premium_interview_report gained one new top-level key,
    "integrity_and_ownership_signals" — safe for existing callers to ignore.
  - extract_cohort_session_metrics() and generate_report_export_summary()
    are new pure reshaping functions for cohort persistence and short
    "headline" exports respectively.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import PLAN_CONFIG

logger = logging.getLogger("prepvista.interview_summary")


# ---------------------------------------------------------------------------
# Turn-state constants  (preserved — imported by interviewer.py)
# ---------------------------------------------------------------------------
TURN_STATE_ACTIVE_QUESTION_OPEN  = "active_question_open"
TURN_STATE_WAITING_CLARIFICATION = "waiting_clarification"
TURN_STATE_ANSWER_RECORDED       = "answer_recorded"
TURN_STATE_QUESTION_CLOSED       = "question_closed"

# ---------------------------------------------------------------------------
# Turn-outcome constants  (preserved — imported by interviewer.py)
# ---------------------------------------------------------------------------
TURN_OUTCOME_ANSWERED      = "answered"
TURN_OUTCOME_CLARIFICATION = "clarification"
TURN_OUTCOME_TIMEOUT       = "timeout"
TURN_OUTCOME_SKIPPED       = "skipped"
TURN_OUTCOME_EXITED        = "exited"
TURN_OUTCOME_SYSTEM_CUTOFF = "system_cutoff"

TURN_OUTCOME_VALUES: frozenset[str] = frozenset({
    TURN_OUTCOME_ANSWERED,
    TURN_OUTCOME_CLARIFICATION,
    TURN_OUTCOME_TIMEOUT,
    TURN_OUTCOME_SKIPPED,
    TURN_OUTCOME_EXITED,
    TURN_OUTCOME_SYSTEM_CUTOFF,
})

# Statuses that must NOT count as a genuine answered turn
_NON_ANSWER_STATUSES: frozenset[str] = frozenset({
    "clarification requested",
    "clarification",
    "no answer",
    "timed out",
    "timeout",
    "system cut off",
    "system_cutoff",
    "skipped",
    "user stopped early",
    "silent",
})

# Open-question states where the current question is still in progress
_OPEN_QUESTION_STATES: frozenset[str] = frozenset({
    TURN_STATE_ACTIVE_QUESTION_OPEN,
    TURN_STATE_WAITING_CLARIFICATION,
})

# ---------------------------------------------------------------------------
# HR readiness level constants  (additive)
# ---------------------------------------------------------------------------
HR_READINESS_NOT_READY       = "not_ready"
HR_READINESS_DEVELOPING      = "developing"
HR_READINESS_PROGRESSING     = "progressing"
HR_READINESS_INTERVIEW_READY = "interview_ready"
HR_READINESS_STRONG          = "strong"


# ---------------------------------------------------------------------------
# Coercion helpers  (public — imported by interviewer and finish services)
# ---------------------------------------------------------------------------

def coerce_runtime_state(value: Any) -> dict:
    """Safely normalize stored runtime state into a dictionary."""
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def coerce_question_plan_items(question_plan: Any) -> list[dict]:
    """Normalize stored question-plan payloads into a list of dict items.

    Non-dict items are dropped; a warning is emitted so malformed payloads
    surface in logs without breaking callers.
    """
    if isinstance(question_plan, list):
        all_items = question_plan
    elif isinstance(question_plan, str):
        try:
            parsed = json.loads(question_plan)
            all_items = parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    else:
        return []

    valid = [item for item in all_items if isinstance(item, dict)]
    dropped = len(all_items) - len(valid)
    if dropped > 0:
        logger.warning(
            "coerce_question_plan_items: dropped %d non-dict item(s) from question plan",
            dropped,
        )
    return valid


# ---------------------------------------------------------------------------
# Private type-coercion utilities
# ---------------------------------------------------------------------------

def _safe_int(value: Any) -> int:
    """Coerce to a non-negative integer; return 0 on failure."""
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Coerce to a non-negative float; return default on failure."""
    try:
        result = float(value)
        return result if result >= 0 else default
    except (TypeError, ValueError):
        return default


def _safe_duration_list(value: Any) -> list[int]:
    """Normalize a stored list of durations into non-negative ints only."""
    if not isinstance(value, list):
        return []
    result: list[int] = []
    for item in value:
        try:
            numeric = int(item)
        except (TypeError, ValueError):
            continue
        if numeric >= 0:
            result.append(numeric)
    return result


def _safe_str(value: Any, max_len: int = 2000) -> str:
    """Coerce any value to a stripped string, capped at max_len."""
    return str(value or "").strip()[:max_len]


# ---------------------------------------------------------------------------
# Evaluation classification helpers
# ---------------------------------------------------------------------------

def _evaluation_is_answered(evaluation: dict) -> bool:
    """Return True when an evaluation row represents a genuine answered turn.

    A turn is NOT answered when:
    - classification is 'silent'
    - answer_status matches a known non-answer status
    - both text content and score are absent or zero
    """
    if not isinstance(evaluation, dict):
        return False

    classification = _safe_str(evaluation.get("classification")).lower()
    status = _safe_str(evaluation.get("answer_status")).lower()

    if classification == "silent":
        return False
    if status in _NON_ANSWER_STATUSES:
        return False

    has_text = bool(_safe_str(evaluation.get("raw_answer") or evaluation.get("normalized_answer")))
    has_score = _safe_float(evaluation.get("score")) > 0
    return has_text or has_score


def _classify_answer_strength(evaluation: dict) -> str:
    """Map an evaluation row to one of: strong | good | partial | weak | silent.

    Combines the AI classification label with the numeric score so the
    result is consistent even when one of the two fields is missing.

    NOTE ON SCALE: `score` here is on the 0-10 scale (see
    QUESTION_SCORE_SCALE_MAX below) — the 8.0 / 6.5 / 4.0 thresholds are
    fractions of that scale (80% / 65% / 40%), not of 0-100.
    """
    if not isinstance(evaluation, dict):
        return "silent"

    classification = _safe_str(evaluation.get("classification")).lower()
    score = _safe_float(evaluation.get("score"))
    status = _safe_str(evaluation.get("answer_status")).lower()

    if classification == "silent" or status in _NON_ANSWER_STATUSES:
        return "silent"
    if score == 0 and not _safe_str(evaluation.get("raw_answer")):
        return "silent"

    if classification in {"strong", "excellent", "great", "solid"} or score >= 8.0:
        return "strong"
    if score >= 6.5 or classification in {"good", "clear", "correct"}:
        return "good"
    if score >= 4.0 or classification in {"partial", "vague", "incomplete", "relevant"}:
        return "partial"
    return "weak"


# ---------------------------------------------------------------------------
# Answer quality pattern detection  (additive — used by premium report)
# ---------------------------------------------------------------------------

_FILLER_RE = re.compile(
    r"\b(umm?|err?|uh+|hmm+|like|basically|literally|actually|obviously|"
    r"i think|i believe|i guess|sort of|kind of|you know|to be honest|"
    r"honestly|frankly|i mean|right|okay|yeah)\b",
    re.IGNORECASE,
)

_GENERIC_OPENER_RE = re.compile(
    r"^(that'?s? (a )?great question|thank you for (the |this )?question|"
    r"this is (a )?(good|great|interesting|important) question|"
    r"as an ai|in (my )?(professional|personal)? (opinion|experience|view))",
    re.IGNORECASE,
)

_RESULT_SIGNAL_RE = re.compile(
    r"\b(result|outcome|impact|achieved|improved|reduced|increased|measured|"
    r"validated|percent|%|faster|accurate|reliable|saved|delivered|completed|"
    r"shipped|launched|deployed|changed|helped)\b",
    re.IGNORECASE,
)

_EXAMPLE_SIGNAL_RE = re.compile(
    r"\b(for example|for instance|in my project|when i|at my internship|during|"
    r"specifically|one time|in (the|that)? (case|situation|project)|"
    r"i (built|designed|implemented|handled|owned|worked on|created))\b",
    re.IGNORECASE,
)

_STRUCTURE_SIGNAL_RE = re.compile(
    r"\b(first(ly)?|second(ly)?|third(ly)?|finally|lastly|to (start|begin|summarize)|"
    r"in (summary|conclusion)|the (main|key|primary)|there are \d|"
    r"the (first|second|third) (step|thing|reason|point))\b",
    re.IGNORECASE,
)

_REPEAT_SENTENCE_RE = re.compile(r"(.{30,}?)\.\s*\1\.", re.IGNORECASE | re.DOTALL)

_OWNERSHIP_LANGUAGE_RE = re.compile(
    r"\b(i built|i designed|i implemented|i decided|i personally|i owned|i led|"
    r"i created|i handled|i chose|i was responsible|my decision|my approach|"
    r"my contribution|my role was|i drove|i initiated|i proposed)\b",
    re.IGNORECASE,
)

_TEAM_CREDIT_RE = re.compile(
    r"\b(we|our team|team effort|collaborated|together with|worked with|"
    r"the team|my team|peer review|collective|group effort|with my colleagues|"
    r"co-designed|pair programmed|cross-functional)\b",
    re.IGNORECASE,
)

_NEGATIVITY_RE = re.compile(
    r"\b(bad manager|terrible|hated|worst|toxic|incompetent|awful|useless|"
    r"waste of time|didn'?t care|never helped|blamed me|unfair|hostile|"
    r"horrible|lazy coworker|unprofessional|couldn'?t stand)\b",
    re.IGNORECASE,
)

_ROLE_RESEARCH_RE = re.compile(
    r"\b(this role requires|the job description|your company|your team|"
    r"this position|the requirement|role demands|industry standard|"
    r"based on the jd|based on the description|for this specific role|"
    r"the role asks for|aligned with the role)\b",
    re.IGNORECASE,
)

_HONESTY_SIGNAL_RE = re.compile(
    r"\b(i don'?t know|i am not sure|i'?m not sure|i need to learn|i haven'?t tried|"
    r"i am still learning|i'?m still learning|to be honest i|honestly i don'?t|i'?d need to research|"
    r"that'?s a gap for me|i am working on|i'?m working on|not my strongest|i am unfamiliar|i'?m unfamiliar|"
    r"i admit|i acknowledge)\b",
    re.IGNORECASE,
)

_SPECIFICITY_RE = re.compile(
    # ✅ FIXED: the original single-group pattern with one trailing \b could not
    # match tokens like "35%" because % is not a word character — the \b at the
    # END of the group asserts a \w→\W transition, but after "%" (already \W)
    # that transition does not exist. Restructured into separate alternations,
    # each with its own leading \b — numeric-unit tokens need no trailing \b
    # since their unit suffix is unambiguous.
    r"\b\d+\.?\d*\s*(?:%|percent|ms|seconds?|hours?|days?|users?|requests?|rows?|gb|mb|tb)"
    r"|\bversion \d|\bv\d+\.\d+|\bsprint \d|\bq[1-4] \d{4}"
    r"|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b"
    r"|\b(?:postgresql|mongodb|redis|docker|kubernetes|jenkins|github\s+actions|aws|gcp|azure)\b",
    re.IGNORECASE,
)


def _analyze_answer_quality(raw_answer: str) -> dict:
    """Perform lightweight deterministic quality heuristics on a raw answer.

    Returns pattern flags — NOT a score.  The evaluator AI produces the
    authoritative score; these flags enrich the premium report.
    """
    text = _safe_str(raw_answer, max_len=5000)
    if not text:
        return {
            "is_empty": True, "word_count": 0, "has_filler_heavy": False,
            "has_generic_opener": False, "has_result_signal": False,
            "has_example_signal": False, "has_structure_signal": False,
            "has_repeat_sentence": False, "filler_ratio": 0.0,
            "ownership_language_ratio": 0.0, "team_credit_balance": False,
            "has_negativity": False, "has_role_research": False,
            "has_honesty_signal": False, "specificity_score": 0.0,
        }

    words = text.split()
    word_count = len(words)
    filler_matches = _FILLER_RE.findall(text)
    filler_ratio = round(len(filler_matches) / max(word_count, 1), 3)

    return {
        "is_empty":            False,
        "word_count":          word_count,
        "has_filler_heavy":    filler_ratio > 0.12 or (word_count < 20 and filler_ratio > 0.06),
        "has_generic_opener":  bool(_GENERIC_OPENER_RE.match(text)),
        "has_result_signal":   bool(_RESULT_SIGNAL_RE.search(text)),
        "has_example_signal":  bool(_EXAMPLE_SIGNAL_RE.search(text)),
        "has_structure_signal": bool(_STRUCTURE_SIGNAL_RE.search(text)),
        "has_repeat_sentence": bool(_REPEAT_SENTENCE_RE.search(text[:600])),
        "filler_ratio":        filler_ratio,
        # ── New answer-quality flags ──
        "ownership_language_ratio": round(
            len(_OWNERSHIP_LANGUAGE_RE.findall(text)) / max(word_count, 1), 3
        ),
        "team_credit_balance": (
            bool(_OWNERSHIP_LANGUAGE_RE.search(text)) and bool(_TEAM_CREDIT_RE.search(text))
        ),
        "has_negativity":      bool(_NEGATIVITY_RE.search(text)),
        "has_role_research":   bool(_ROLE_RESEARCH_RE.search(text)),
        "has_honesty_signal":  bool(_HONESTY_SIGNAL_RE.search(text)),
        "specificity_score":   round(
            len(_SPECIFICITY_RE.findall(text)) / max(word_count, 1), 3
        ),
    }


def _compute_answer_quality_rows(evaluations: list[dict]) -> list[dict]:
    """Run _analyze_answer_quality once per non-empty answer.  (additive)

    Shared input for _assess_communication_style and
    _assess_integrity_and_ownership_signals — previously
    _assess_communication_style called _analyze_answer_quality itself, which
    meant the ~15-regex analysis ran once per evaluation but only 5 of its 15
    fields were ever read. Computing it once here and passing the list to
    both assessment functions keeps that single pass while making the other
    10 fields available too.
    """
    rows: list[dict] = []
    for ev in evaluations:
        if not isinstance(ev, dict):
            continue
        raw = _safe_str(ev.get("raw_answer") or ev.get("normalized_answer"), max_len=3000)
        if not raw:
            continue
        rows.append(_analyze_answer_quality(raw))
    return rows


# ---------------------------------------------------------------------------
# Category-level feedback library  (additive — premium report)
# ---------------------------------------------------------------------------

_CATEGORY_FEEDBACK: dict[str, dict[str, str]] = {
    "technical_depth": {
        "strong":  "Technical depth was clearly demonstrated — specific tools, design decisions, and validated outcomes were explained.",
        "good":    "Technical understanding came through. Adding measurable results and the reasoning behind tool choices would strengthen future answers.",
        "partial": "Technical answers were partially complete. Focus on explaining the method, the decision behind it, and one quantifiable outcome.",
        "weak":    "Technical answers lacked the depth an interviewer expects. Practice explaining tools, trade-offs, and impact for every major project.",
        "silent":  "No technical answers were recorded in this session.",
    },
    "ownership": {
        "strong":  "Strong personal ownership — responsibilities and decisions were clearly attributed to you, not the team.",
        "good":    "Ownership came through in most answers. A few could more clearly separate what you personally owned from what the team did.",
        "partial": "Ownership signals were present but often blended with team contribution. Lead with 'I personally...' to make ownership explicit.",
        "weak":    "Answers did not clearly establish personal ownership. Interviewers notice this — always say exactly what you built or decided.",
        "silent":  "No ownership-focused answers were recorded.",
    },
    "workflow_process": {
        "strong":  "Process thinking was sharp — answers walked through flows logically with clear reasoning behind each step.",
        "good":    "Process was explained adequately. Adding the 'why' behind each design choice would make answers noticeably stronger.",
        "partial": "Process answers covered the surface. Aim to explain each step in sequence and the constraint that made you choose it.",
        "weak":    "Process answers were vague. Practice explaining work step-by-step: input -> your decision -> output -> reason.",
        "silent":  "No workflow or process answers were recorded.",
    },
    "communication_explain": {
        "strong":  "Communication was excellent — ideas were explained simply with impact made clear for a non-technical audience.",
        "good":    "Communication was generally clear. A few answers used jargon that a broader audience might not follow.",
        "partial": "Communication was partially effective. Practice the 'explain to a non-expert' format: core idea, one analogy, one impact.",
        "weak":    "Communication needed more clarity. Technical ideas must be broken down into plain language with a concrete real-world example.",
        "silent":  "No communication-focused answers were recorded.",
    },
    "role_fit": {
        "strong":  "Role alignment was compelling — answers directly linked your background and strengths to what the role requires.",
        "good":    "Role fit came across. Sharpen the connection between your specific experience and the exact skills the role demands.",
        "partial": "Role fit was partially established. Be explicit: name the role, name your strongest relevant skill, give one proof.",
        "weak":    "Role fit was not clearly communicated. Prepare to answer: 'Why you, specifically, for this role?' with one concrete proof.",
        "silent":  "No role-fit answers were recorded.",
    },
    "teamwork_pressure": {
        "strong":  "Teamwork and pressure handling were well illustrated with real situations, clear actions, and specific outcomes.",
        "good":    "Behavioral answers were solid. Adding the result or lesson learned would complete the STAR format cleanly.",
        "partial": "Behavioral answers described the situation but missed the action and result. Practice: Situation -> Task -> Action -> Result.",
        "weak":    "Behavioral answers were thin. Prepare at least two real examples of handling team or pressure situations with full STAR format.",
        "silent":  "No behavioral or teamwork answers were recorded.",
    },
    "learning_growth": {
        "strong":  "Growth mindset was clearly demonstrated — specific learning areas, active steps, and honest self-awareness were shown.",
        "good":    "Growth orientation came through. Link your learning goals more directly to what the target role requires.",
        "partial": "Growth answers were generic. Name a specific skill, say exactly what you are doing to improve it, and explain why it matters.",
        "weak":    "Growth answers lacked genuineness. Avoid 'I am a fast learner' — name a real gap and a real step you are taking.",
        "silent":  "No learning or growth answers were recorded.",
    },
    "challenge_debugging": {
        "strong":  "Problem-solving was well showcased — situation, your approach, the decision, and the outcome were all clear.",
        "good":    "Challenges were described adequately. Explaining the trade-off that drove your final choice would add depth.",
        "partial": "Challenge answers named the problem but did not fully explain how you resolved it or what changed as a result.",
        "weak":    "Challenge answers were vague. Prepare to explain a real problem you solved: what it was, what you tried, what you chose, what happened.",
        "silent":  "No problem-solving or challenge answers were recorded.",
    },
    "validation_metrics": {
        "strong":  "Strong use of metrics — answers showed exactly how results were measured and what the data actually proved.",
        "good":    "Metrics were mentioned. Being more specific — exact numbers, comparison baselines, or testing method — would strengthen these answers.",
        "partial": "Validation answers lacked quantification. Add before-and-after comparisons or specific benchmarks wherever possible.",
        "weak":    "No real validation or measurement was shown. Always include a number, a comparison, or a check that proves the result was real.",
        "silent":  "No validation or metrics answers were recorded.",
    },
    "tradeoff_decision": {
        "strong":  "Decision-making was well articulated — options, constraints, reasoning, and outcome were all explained clearly.",
        "good":    "Decisions were explained. Adding what you would do differently now would show analytical depth and professional maturity.",
        "partial": "Trade-off answers named the choice but missed the reasoning. Always explain: why one option was better given your constraints.",
        "weak":    "Trade-off answers were underdeveloped. Prepare one real decision story: options you had, your constraint, your choice, the result.",
        "silent":  "No trade-off or decision-making answers were recorded.",
    },
    "introduction": {
        "strong":  "Introduction was confident, focused, and structured — it covered who you are, what you are strongest at, and why the role fits.",
        "good":    "Introduction covered the key points. Add one concrete proof point (a result or project) to make it memorable.",
        "partial": "Introduction was present but unfocused. Structure it as: background, strongest area, one proof of value, your direction.",
        "weak":    "Introduction was too vague. Prepare a 60-second answer: who you are, your strongest area, one concrete proof of it.",
        "silent":  "No introduction was recorded.",
    },
    "studies_background": {
        "strong":  "Academic background was explained clearly with a direct connection to practical work and career direction.",
        "good":    "Studies were covered. Linking academic experience to a real project or practical skill would make this stronger.",
        "partial": "Background answer was surface-level. Add a project or skill that bridges your studies to real working output.",
        "weak":    "Background answer did not show practical relevance. Always connect your studies to something you have built or applied.",
        "silent":  "No studies or background answers were recorded.",
    },
    "tool_method": {
        "strong":  "Tools and methods were explained with strong context — why chosen, how used, what they achieved.",
        "good":    "Tools were mentioned. Explaining why you chose each over the alternatives would show stronger decision-making.",
        "partial": "Tools were named without explanation. Always say what the tool did and why it was the right choice for the situation.",
        "weak":    "Tool answers were list-only. An interviewer wants to know how you used each tool and what decision led to choosing it.",
        "silent":  "No tool or method answers were recorded.",
    },
    "closeout": {
        "strong":  "Closing answer was memorable, clear, and panel-focused — a strong final impression that tied together your value.",
        "good":    "Closing answer was solid. One concrete proof point or first-priority-if-hired statement would elevate it further.",
        "partial": "Closing answer was generic. Prepare a clear hiring pitch: one strength, one proof, one reason to remember you.",
        "weak":    "Closing answer did not leave a strong impression. Prepare: what you would focus on in your first 30 days if hired.",
        "silent":  "No closing answer was recorded.",
    },
    "situational_judgment": {
        "strong":  "Situational judgment was sound — you assessed the scenario realistically, weighed trade-offs, and explained a clear course of action.",
        "good":    "Your judgment was reasonable. Strengthening the reasoning behind your choice and considering second-order effects would add depth.",
        "partial": "The scenario response covered the surface but did not fully explain your reasoning or the trade-offs you considered.",
        "weak":    "Situational answers lacked structure. Practice: define the situation, list your options, explain your choice, and state the expected outcome.",
        "silent":  "No situational judgment answers were recorded.",
    },
    "creative_thinking": {
        "strong":  "Creative thinking was clearly demonstrated — you proposed a non-obvious approach and explained why it would work in context.",
        "good":    "Your answer showed some creative thinking. Adding a comparison to the conventional approach would make the creative angle more convincing.",
        "partial": "The answer mentioned an alternative approach but did not explain why it was better or how it would work in practice.",
        "weak":    "Creative thinking was not visible. Practice exploring unconventional solutions and explaining one concrete advantage they offer.",
        "silent":  "No creative thinking answers were recorded.",
    },
    "ai_tool_fluency": {
        "strong":  "AI tool fluency was sharp — you demonstrated practical understanding of AI capabilities, limitations, and appropriate use cases.",
        "good":    "You showed awareness of AI tools. Being more specific about when NOT to use AI and the verification steps you take would strengthen this area.",
        "partial": "The answer mentioned AI tools but lacked critical evaluation of their limitations, risks, or appropriate use boundaries.",
        "weak":    "AI tool understanding was surface-level. Practice explaining specific AI tools you use, their limitations, and when human judgment is still essential.",
        "silent":  "No AI tool fluency answers were recorded.",
    },
    "programming_language": {
        "strong":  "Language knowledge was solid — you explained a real concept accurately and tied it to code you have actually written.",
        "good":    "Language understanding came through. Adding a trade-off or edge case you have reasoned about would show deeper command.",
        "partial": "Language answers stayed at surface level. Connect each concept to real code and explain WHY, not just WHAT.",
        "weak":    "Language answers were closer to textbook definitions than real usage. Practice explaining features through code you have written.",
        "silent":  "No programming-language answers were recorded.",
    },
    "skill_verification": {
        "strong":  "You backed a listed skill with concrete, fairly advanced evidence and were honest about its boundaries.",
        "good":    "The skill was supported with some evidence. A more advanced example and a clear note on your gaps would strengthen it.",
        "partial": "The skill was claimed but only lightly evidenced. Prove it with a specific, non-trivial example next time.",
        "weak":    "A resume skill was not backed by real depth. Prepare one concrete, advanced example for every skill you list.",
        "silent":  "No skill-verification answers were recorded.",
    },
    "certification": {
        "strong":  "You showed real value from a certification — a genuine takeaway plus where you applied it in practice.",
        "good":    "The certification answer was solid. Make the real-world application more concrete to show lasting value.",
        "partial": "The certification was named but its practical application was thin. Show where you actually used what it taught.",
        "weak":    "The certification answer recited the syllabus with no personal application. Connect it to real work you did.",
        "silent":  "No certification answers were recorded.",
    },
    "self_assessment": {
        "strong":  "Self-assessment was honest and well-calibrated — a realistic rating backed by specific evidence and a genuine growth area.",
        "good":    "Your self-assessment was reasonable. Tie the rating more tightly to concrete proof to make it convincing.",
        "partial": "The self-assessment lacked evidence. Justify your rating with real examples instead of an unsupported number.",
        "weak":    "Self-assessment was a humble-brag or an unjustified score. Practice naming a realistic level with honest, specific proof.",
        "silent":  "No self-assessment answers were recorded.",
    },
}

_CATEGORY_DISPLAY_NAMES: dict[str, str] = {
    "technical_depth":       "Technical Depth",
    "ownership":             "Ownership & Accountability",
    "workflow_process":      "Process & Workflow Thinking",
    "communication_explain": "Communication Clarity",
    "role_fit":              "Role Alignment",
    "teamwork_pressure":     "Teamwork & Pressure Handling",
    "learning_growth":       "Growth & Self-Awareness",
    "challenge_debugging":   "Problem-Solving",
    "validation_metrics":    "Metrics & Validation",
    "tradeoff_decision":     "Decision-Making & Trade-offs",
    "introduction":          "Self-Introduction",
    "studies_background":    "Academic & Background",
    "tool_method":           "Tool & Method Knowledge",
    "closeout":              "Closing Impression",
    "situational_judgment":  "Situational Judgment & Decision-Making",
    "creative_thinking":     "Creative & Lateral Thinking",
    "ai_tool_fluency":       "AI Tool Fluency & Critical Use",
    "programming_language":  "Programming Language Knowledge",
    "skill_verification":    "Skill Verification",
    "certification":         "Certification Depth",
    "self_assessment":       "Self-Assessment & Honesty",
}


# ---------------------------------------------------------------------------
# CROSS-FILE CONTRACTS  (additive)
# Shared rubric-category vocabulary and score-scale constants. analytics.py's
# VALID_RUBRIC_CATEGORIES / RUBRIC_CATEGORY_DISPLAY_ORDER and per-category
# tier-bucketing should derive from these instead of maintaining a parallel,
# independently-drifting list — see the handoff notes for the exact edit.
# ---------------------------------------------------------------------------

# Categories with curated feedback/tips/display names in THIS file (17).
_CURRENT_RUBRIC_CATEGORIES: frozenset[str] = frozenset(_CATEGORY_DISPLAY_NAMES)

# Categories analytics.py's VALID_RUBRIC_CATEGORIES additionally allows, for
# backward-compatibility with older stored question_evaluations rows that
# predate the current 17-category evaluator prompt. "delivery" is synthetic
# (derived from communication_score, never a rubric_category value itself);
# the other four are believed-legacy rubric_category values with no curated
# feedback/tips here — they fall through to _get_category_feedback's generic
# branch and a title-cased display name, which is functional but generic.
_LEGACY_RUBRIC_CATEGORIES: frozenset[str] = frozenset({
    "project_ownership", "problem_solving", "behavioral", "communication", "delivery",
})

_LEGACY_CATEGORY_DISPLAY_NAMES: dict[str, str] = {
    "project_ownership": "Project Ownership",
    "problem_solving":   "Problem Solving",
    "behavioral":        "Behavioral",
    "communication":     "Communication",
    "delivery":          "Delivery & Vocal Communication",
}

# Canonical, shared rubric-category vocabulary (22 = 17 current + 5 legacy).
CANONICAL_RUBRIC_CATEGORIES: frozenset[str] = _CURRENT_RUBRIC_CATEGORIES | _LEGACY_RUBRIC_CATEGORIES

# Canonical display names for all 22 categories.
CANONICAL_CATEGORY_DISPLAY_NAMES: dict[str, str] = {
    **_CATEGORY_DISPLAY_NAMES,
    **_LEGACY_CATEGORY_DISPLAY_NAMES,
}

# question_evaluations.score is on a 0-10 scale — see _classify_answer_strength's
# 8.0 / 6.5 / 4.0 thresholds (strong / good / partial cutoffs, i.e. 80% / 65% / 40%).
QUESTION_SCORE_SCALE_MAX = 10.0

# interview_sessions.final_score is on a 0-100 scale — see
# _compute_hr_readiness_level's 25 / 40 / 58 / 75 thresholds and
# _get_score_band's 30 / 45 / 60 / 75 / 85, both below.
FINAL_SCORE_SCALE_MAX = 100.0

# question_evaluations.communication_score is STORED on a 0-10 scale: the
# evaluator (evaluator_feedback.py) writes `communication_part * 5`, where
# communication_part is clamped to [0, 2]. Verified against three independent
# consumers that all divide the stored value by 5: the frontend report page
# (report/[id]/page.tsx renders ".../ 2"), report_render.py, and the
# COMMUNICATION_PART_DIVISOR normalization in _assess_communication_style.
COMMUNICATION_SCORE_SCALE_MAX = 10.0

# Divisor that maps the STORED communication_score (0-10) back to the 0-2
# "part" the evaluator originally produced. Mirrors the /5 used by
# report_render.py and the frontend report view.
COMMUNICATION_PART_DIVISOR = 5.0


def normalize_score_to_100(value: float | None, scale_max: float) -> float | None:
    """Rescale a value from [0, scale_max] to [0, 100]. None/invalid -> None.

        normalized = round((value / scale_max) * 100, 1)

    Intended use: when persisting per-category averages (skill_scores.
    average_score) so every rubric category — including "delivery" (derived
    from communication_score, scale=COMMUNICATION_SCORE_SCALE_MAX) — lands on
    the same 0-100 scale as final_score and analytics.py's
    READINESS_TIER_* thresholds (75/60/45) and _DEFAULT_TARGET_SCORE (75).
    """
    if value is None or scale_max <= 0:
        return None
    return round((value / scale_max) * 100.0, 1)


def _get_category_feedback(rubric_category: str, strength_level: str) -> str:
    """Return a specific, non-generic HR-style feedback sentence for a category+strength."""
    cat = str(rubric_category or "").strip().lower()
    level = str(strength_level or "partial").strip().lower()
    if level not in {"strong", "good", "partial", "weak", "silent"}:
        level = "partial"

    for key in (cat, cat.replace("_", " "), cat.split("_")[0] if "_" in cat else cat):
        if key in _CATEGORY_FEEDBACK:
            return _CATEGORY_FEEDBACK[key].get(level, _CATEGORY_FEEDBACK[key].get("partial", ""))

    generic = {
        "strong":  "Answers in this area demonstrated strong command and clear structure.",
        "good":    "Answers were solid — adding more specific examples would strengthen them.",
        "partial": "Answers were partially complete. Add concrete examples and measurable outcomes.",
        "weak":    "Answers needed more depth. Prepare specific examples with clear results.",
        "silent":  "No answers were recorded in this area.",
    }
    return generic.get(level, generic["partial"])


# ---------------------------------------------------------------------------
# Improvement roadmap  (additive — premium report)
# ---------------------------------------------------------------------------

_IMPROVEMENT_TIPS: dict[str, list[str]] = {
    "technical_depth": [
        "For each project, prepare one sentence covering: tool/method used, why you chose it, and the measurable outcome.",
        "Replace 'it worked better' with specific numbers: 'accuracy improved from X% to Y%' or 'latency dropped by Z ms'.",
        "Practice your most complex technical decision in 90 seconds: context -> choice -> why -> result.",
    ],
    "ownership": [
        "Begin ownership answers with 'I personally...' and explicitly separate your contribution from the team's.",
        "Prepare one story per project where your individual decision directly changed the outcome.",
        "Avoid 'we' when describing something you built or decided — interviewers want to know what was yours.",
    ],
    "workflow_process": [
        "Practice numbering your steps and explaining the constraint behind each: 'Step 1 was X because Y was the bottleneck.'",
        "For every project, build a 3-step summary: what came in -> what you did -> what came out and why.",
        "Add decision points to your process explanation — what choices did you make and why did you make them?",
    ],
    "communication_explain": [
        "Practice the 'explain to a non-expert' framework: one-sentence core idea, one real-world analogy, one impact statement.",
        "Record yourself answering and listen for jargon, filler words, or unclear transitions.",
        "Use the 'so what' test: after every explanation, ask 'so what does that mean in practice?' and add that answer.",
    ],
    "role_fit": [
        "Prepare a 3-part role-fit answer: your strongest skill + how you used it + why it fits what this team needs.",
        "Research the job description and weave 2-3 of its key phrases naturally into your answers.",
        "Prepare to answer 'Why you over other candidates?' with one specific project proof that is hard to fake.",
    ],
    "teamwork_pressure": [
        "Prepare two STAR stories: one team collaboration example and one deadline/pressure example.",
        "STAR = Situation (one sentence), Task (your role), Action (what you did), Result (what changed) + lesson.",
        "Always end behavioral answers with a lesson or change in behavior — it signals professional maturity.",
    ],
    "learning_growth": [
        "Name one specific skill you are improving, what you do weekly to improve it, and why it matters for your target role.",
        "Avoid 'I am a fast learner.' Say instead: 'I am currently building X because it will help me do Y in this role.'",
        "Research what the role requires and honestly frame your growth goals around those specific gaps.",
    ],
    "challenge_debugging": [
        "Prepare at least two real problem stories: the problem -> what you tried -> what you chose -> why -> what changed.",
        "For debugging questions, explain your diagnostic process step-by-step — not just the fix you landed on.",
        "Always include the outcome: 'After fixing it, the system did X instead of Y, which meant Z for the team.'",
    ],
    "validation_metrics": [
        "After every project, record: what you measured, what the baseline was, what you achieved, and how you tested it.",
        "Practice saying: 'I validated it by running X test and comparing before-and-after on metric Y.'",
        "If you lack exact numbers, estimate honestly: 'approximately 20% faster based on runtime comparison tests.'",
    ],
    "tradeoff_decision": [
        "For each major decision, prepare: Option A vs Option B + your constraint + why A won + what changed because of it.",
        "Practice this sentence structure: 'I chose X over Y because our main constraint was Z, and the result was W.'",
        "Add reflection: 'Looking back, I would change X because...' — this shows mature, non-defensive self-analysis.",
    ],
    "introduction": [
        "Build a 60-second introduction: who you are, your strongest area, one concrete proof of it, and your target direction.",
        "Avoid listing your entire resume. Choose one or two things that make you specifically memorable.",
        "End your introduction with a forward-looking sentence: 'This is why I am targeting X roles specifically.'",
    ],
    "studies_background": [
        "Link every academic topic to a real project: 'My coursework in X helped me build Y which produced Z result.'",
        "Mention specific courses, research, or projects relevant to the role — not just your degree name.",
        "If your studies are not perfectly aligned, acknowledge it and show how you bridge the gap through practical work.",
    ],
    "tool_method": [
        "For every tool you mention, add: why you chose it over alternatives, how you specifically used it, what problem it solved.",
        "Avoid tool lists without context — an interviewer wants to know how you used it, not that you know it exists.",
        "Practice comparing tools: 'I used X instead of Y because our system needed Z performance characteristic.'",
    ],
    "closeout": [
        "Prepare a 3-sentence close: your strongest attribute for this role + one proof point + what you would focus on first if hired.",
        "Make your close role-specific — mention the actual role, team, or company challenge you would address.",
        "Leave the panel with one data point: a number, a result, or a specific decision that best defines your value.",
    ],
    "situational_judgment": [
        "Practice 'What would you do if...' questions using this format: assess the situation -> list your options -> explain your choice -> state the expected result.",
        "Always explain the trade-off behind your decision — why did you choose this path over the alternatives?",
        "Consider second-order effects: 'If I do X, then Y will happen, so I also need to account for Z.'",
    ],
    "creative_thinking": [
        "When asked for a creative approach, start with the conventional method, then explain your alternative and why it is better in this context.",
        "Practice thinking from a different stakeholder's perspective — what would a user, a competitor, or a non-technical leader see differently?",
        "Prepare one real example where you tried an unconventional approach and explain what happened as a result.",
    ],
    "ai_tool_fluency": [
        "For every AI tool you mention, explain: what it does well, what it cannot do reliably, and how you verify its output.",
        "Practice answering: 'When would you NOT use AI for this task?' — interviewers value critical judgment over enthusiasm.",
        "Prepare one example where AI helped your workflow and one where human judgment was essential despite AI availability.",
    ],
    "programming_language": [
        "For each language on your resume, prepare one concept you have used in real code and can explain under the hood.",
        "Know one trade-off, edge case, or common mistake for your strongest language — that is what separates real users from list-fillers.",
        "Avoid textbook definitions: anchor every language answer to something you actually built or debugged.",
    ],
    "skill_verification": [
        "For every skill you list, prepare your most advanced concrete example and be ready to state where your limits are.",
        "Do not just repeat the resume line — prove the skill with a specific problem you solved using it.",
        "Honesty wins: naming a real gap in a skill is stronger than overclaiming and being exposed by a follow-up.",
    ],
    "certification": [
        "For each certification, prepare one genuine takeaway and one place you applied it in real work or study.",
        "Interviewers test authenticity, not the syllabus — be ready to go beyond 'I passed it'.",
        "Connect the certification to your target role: what does it let you do that you could not do before?",
    ],
    "self_assessment": [
        "Practice rating yourself with a number AND the specific evidence behind it — '7/10 because I shipped X but have not done Y'.",
        "Avoid humble-brags like 'I'm a perfectionist'; name a real, specific area you are working to improve.",
        "Calibrate honestly: a realistic self-rating with proof reads far stronger than an unjustified '9 out of 10'.",
    ],
}


def _generate_improvement_roadmap(
    weak_categories: list[str],
    partial_categories: list[str],
    max_tips: int = 5,
) -> list[str]:
    """Return the most impactful, specific improvement tips for the weakest areas."""
    tips: list[str] = []
    seen: set[str] = set()

    for category in weak_categories + partial_categories:
        if len(tips) >= max_tips:
            break
        for tip in _IMPROVEMENT_TIPS.get(category, [])[:2]:
            if tip not in seen:
                seen.add(tip)
                tips.append(tip)
                if len(tips) >= max_tips:
                    break

    if not tips:
        tips = [
            "Prepare STAR-format stories for behavioral questions: Situation, Task, Action, Result.",
            "For every technical claim, add a measurable outcome to make it credible and specific.",
            "Practice explaining your strongest project in 60 seconds with a concrete, quantified result.",
        ]
    return tips[:max_tips]


# ---------------------------------------------------------------------------
# HR readiness level computation  (additive — premium report)
# ---------------------------------------------------------------------------

def _compute_hr_readiness_level(
    final_score: float,
    completion_rate: float,
    answered_questions: int,
    planned_questions: int,
    silent_count: int,
    weak_ratio: float,
    timeout_count: int = 0,
) -> str:
    """Classify the candidate's overall interview readiness as an HR evaluator would.

    Uses score, completion, silence rate, and weak-answer ratio as signals.
    Returns one of the HR_READINESS_* constants.

    `timeout_count` is accepted for caller convenience but intentionally not
    read in the body: _classify_answer_strength already classifies a
    timeout-status evaluation as "silent", so timeouts are folded into
    `silent_count`. It is kept as an optional parameter (the production call
    site omits it) so direct callers/tests can pass the timeout tally without a
    TypeError; `summary["timeout_count"]` is still returned at the top level of
    the premium report unchanged.
    """
    if planned_questions > 0 and answered_questions == 0:
        return HR_READINESS_NOT_READY
    if completion_rate < 30 or silent_count >= 3:
        return HR_READINESS_NOT_READY
    if final_score < 25 or weak_ratio > 0.6:
        return HR_READINESS_NOT_READY
    if final_score < 40 or completion_rate < 50 or weak_ratio > 0.4:
        return HR_READINESS_DEVELOPING
    if final_score < 58 or completion_rate < 70:
        return HR_READINESS_PROGRESSING
    if final_score >= 75 and completion_rate >= 80 and weak_ratio <= 0.2:
        return HR_READINESS_STRONG
    return HR_READINESS_INTERVIEW_READY


_HR_READINESS_LABELS: dict[str, str] = {
    HR_READINESS_NOT_READY:       "Not Yet Interview-Ready",
    HR_READINESS_DEVELOPING:      "Developing — Foundation Building Needed",
    HR_READINESS_PROGRESSING:     "Progressing — On the Right Track",
    HR_READINESS_INTERVIEW_READY: "Interview-Ready — Good Preparation Level",
    HR_READINESS_STRONG:          "Strong — Competitive Interview Performance",
}

_HR_READINESS_DESCRIPTIONS: dict[str, str] = {
    HR_READINESS_NOT_READY: (
        "The candidate's responses did not yet demonstrate the clarity, depth, or completeness "
        "expected for the target role. Significant preparation across most answer categories is needed "
        "before attempting a real interview."
    ),
    HR_READINESS_DEVELOPING: (
        "The candidate shows early-stage interview awareness but answers lack structure, specificity, "
        "and measurable outcomes. Focused preparation with real examples and STAR-format practice "
        "will meaningfully improve performance."
    ),
    HR_READINESS_PROGRESSING: (
        "The candidate demonstrated an acceptable level of preparation with some strong moments. "
        "The main gap is depth — answers need more specific examples, clearer outcomes, and stronger "
        "role alignment to be competitive."
    ),
    HR_READINESS_INTERVIEW_READY: (
        "The candidate performed at a level that would pass an initial screening round for the target role. "
        "Key strengths are evident. Refinement in weaker categories and tightening answer structure "
        "will improve the overall impression further."
    ),
    HR_READINESS_STRONG: (
        "The candidate delivered a strong, structured performance across most categories. Answers showed "
        "clear ownership, measurable results, and confident communication. This candidate would make "
        "a positive impression in a real interview environment."
    ),
}


# ---------------------------------------------------------------------------
# Communication quality assessment  (additive — premium report)
# ---------------------------------------------------------------------------

def _assess_communication_style(evaluations: list[dict], quality_rows: list[dict] | None = None) -> dict:
    """Compute aggregate communication quality signals from evaluation rows.

    `quality_rows` is the pre-computed _analyze_answer_quality output for
    every non-empty answer (see _compute_answer_quality_rows) — shared with
    _assess_integrity_and_ownership_signals so the ~15-regex analysis runs
    once per answer, not twice. It is optional: when omitted (direct callers /
    tests) it is computed here from `evaluations`.
    """
    if not evaluations:
        return {
            "average_communication_score": 0.0,
            "clarity_level": "unknown",
            "communication_summary": "No answers were recorded to assess communication quality.",
        }

    if quality_rows is None:
        quality_rows = _compute_answer_quality_rows(evaluations)

    # ✅ FIXED: communication_score is STORED on a 0-10 scale (the evaluator
    # writes communication_part[0-2] * 5 — see evaluator_feedback.py; the
    # frontend report and report_render.py both divide by 5 to display "/2").
    # The clarity thresholds below (1.5 / 1.0 / 0.7) are calibrated to the 0-2
    # "part", so the raw stored value MUST be divided by COMMUNICATION_PART_DIVISOR
    # first. Without this every real interview averaged ~5-10 → always
    # >= 1.5 → every candidate was misclassified as "clear_and_structured".
    comm_scores = [
        _safe_float(ev.get("communication_score")) / COMMUNICATION_PART_DIVISOR
        for ev in evaluations
        if isinstance(ev, dict) and _safe_float(ev.get("communication_score")) > 0
    ]
    avg_comm = round(sum(comm_scores) / len(comm_scores), 2) if comm_scores else 0.0

    valid_answers = len(quality_rows)
    if valid_answers == 0:
        return {
            "average_communication_score": avg_comm,
            "clarity_level": "unknown",
            "communication_summary": "Communication quality could not be assessed without answer content.",
        }

    flags: dict[str, int] = {
        "filler_heavy": 0, "generic_opener": 0, "has_result": 0,
        "has_example": 0, "has_structure": 0,
    }
    for q in quality_rows:
        if q["has_filler_heavy"]:
            flags["filler_heavy"] += 1
        if q["has_generic_opener"]:
            flags["generic_opener"] += 1
        if q["has_result_signal"]:
            flags["has_result"] += 1
        if q["has_example_signal"]:
            flags["has_example"] += 1
        if q["has_structure_signal"]:
            flags["has_structure"] += 1

    result_ratio  = flags["has_result"]   / valid_answers
    example_ratio = flags["has_example"]  / valid_answers
    filler_ratio  = flags["filler_heavy"] / valid_answers
    struct_ratio  = flags["has_structure"] / valid_answers

    if avg_comm >= 1.5 and result_ratio >= 0.5 and filler_ratio <= 0.2:
        clarity_level = "clear_and_structured"
        summary = (
            "Communication was clear and well-structured across most answers. "
            "The candidate used concrete examples and outcome-focused language effectively."
        )
    elif avg_comm >= 1.0 and (result_ratio >= 0.3 or example_ratio >= 0.4):
        clarity_level = "mostly_clear"
        summary = (
            "Communication was generally clear, though some answers would benefit from "
            "more specific examples or measurable results to increase their impact."
        )
    elif filler_ratio > 0.4 or avg_comm < 0.7:
        clarity_level = "needs_improvement"
        summary = (
            "Communication showed clarity challenges — including filler language or vague statements. "
            "Practice concise, example-driven answers using the STAR format."
        )
    else:
        clarity_level = "developing"
        summary = (
            "Communication was adequate but inconsistent. Some answers were clear while others "
            "lacked structure or concrete evidence. Structured practice will raise the overall impression."
        )

    return {
        "average_communication_score": avg_comm,
        "clarity_level":               clarity_level,
        "communication_summary":       summary,
        "result_coverage_ratio":       round(result_ratio, 2),
        "example_coverage_ratio":      round(example_ratio, 2),
        "structure_ratio":             round(struct_ratio, 2),
        "filler_heavy_ratio":          round(filler_ratio, 2),
    }


# ---------------------------------------------------------------------------
# Integrity & ownership signal assessment  (NEW — premium report)
# ---------------------------------------------------------------------------

# Tunable thresholds for when a signal is worth a sentence in
# integrity_summary — same "named constant" pattern as analytics.py's
# _STUCK_SLOPE_THRESHOLD etc.
_NEGATIVITY_NOTE_THRESHOLD = 0.15
_OWNERSHIP_LOW_THRESHOLD = 0.01
_SPECIFICITY_LOW_THRESHOLD = 0.01


def _assess_integrity_and_ownership_signals(quality_rows: list[dict]) -> dict:
    """Aggregate the _analyze_answer_quality fields NOT used by
    _assess_communication_style into HR-relevant ownership/integrity/
    specificity signals. [Q3, Q6]

    These 9 underlying fields are computed for every non-empty answer but
    were previously discarded after _assess_communication_style extracted
    only has_filler_heavy / has_generic_opener / has_result_signal /
    has_example_signal / has_structure_signal. word_count/is_empty are
    additionally summarized here as avg_word_count.
    """
    if not quality_rows:
        return {
            "avg_word_count": 0,
            "repeat_sentence_ratio": 0.0,
            "avg_filler_ratio": 0.0,
            "avg_ownership_language_ratio": 0.0,
            "team_credit_balance_ratio": 0.0,
            "negativity_ratio": 0.0,
            "role_research_ratio": 0.0,
            "honesty_signal_ratio": 0.0,
            "avg_specificity_score": 0.0,
            "integrity_summary": "No answer content was available to assess ownership, honesty, or specificity signals.",
        }

    n = len(quality_rows)
    avg_word_count      = round(sum(q["word_count"] for q in quality_rows) / n, 1)
    repeat_ratio        = round(sum(1 for q in quality_rows if q["has_repeat_sentence"]) / n, 2)
    avg_filler          = round(sum(q["filler_ratio"] for q in quality_rows) / n, 3)
    avg_ownership       = round(sum(q["ownership_language_ratio"] for q in quality_rows) / n, 3)
    team_credit_ratio   = round(sum(1 for q in quality_rows if q["team_credit_balance"]) / n, 2)
    negativity_ratio    = round(sum(1 for q in quality_rows if q["has_negativity"]) / n, 2)
    role_research_ratio = round(sum(1 for q in quality_rows if q["has_role_research"]) / n, 2)
    honesty_ratio       = round(sum(1 for q in quality_rows if q["has_honesty_signal"]) / n, 2)
    avg_specificity     = round(sum(q["specificity_score"] for q in quality_rows) / n, 3)

    notes: list[str] = []
    if negativity_ratio > _NEGATIVITY_NOTE_THRESHOLD:
        notes.append(
            "Some answers used negative language about past employers or teams — "
            "this would need softening before a real interview."
        )
    if avg_ownership < _OWNERSHIP_LOW_THRESHOLD:
        notes.append(
            "Personal ownership language (\"I built\", \"I decided\") was rare, "
            "so answers may read as team-only contributions."
        )
    if honesty_ratio > 0:
        notes.append(
            "The candidate showed honest self-awareness about gaps, which "
            "interviewers generally view positively."
        )
    if role_research_ratio > 0:
        notes.append(
            "Answers referenced the target role or job description directly, "
            "showing preparation."
        )
    if avg_specificity < _SPECIFICITY_LOW_THRESHOLD:
        notes.append(
            "Answers lacked concrete numbers, tools, or timeframes — adding "
            "specifics would strengthen credibility."
        )

    integrity_summary = (
        " ".join(notes)
        if notes
        else "No notable ownership, honesty, or specificity patterns stood out in either direction."
    )

    return {
        "avg_word_count": avg_word_count,
        "repeat_sentence_ratio": repeat_ratio,
        "avg_filler_ratio": avg_filler,
        "avg_ownership_language_ratio": avg_ownership,
        "team_credit_balance_ratio": team_credit_ratio,
        "negativity_ratio": negativity_ratio,
        "role_research_ratio": role_research_ratio,
        "honesty_signal_ratio": honesty_ratio,
        "avg_specificity_score": avg_specificity,
        "integrity_summary": integrity_summary,
    }


# ---------------------------------------------------------------------------
# Per-question insight generator  (additive — premium report)
# ---------------------------------------------------------------------------

def _generate_per_question_insights(evaluations: list[dict]) -> list[dict]:
    """Generate a concise, non-generic per-question insight for display in reports."""
    insights: list[dict] = []
    for ev in evaluations:
        if not isinstance(ev, dict):
            continue

        turn        = _safe_int(ev.get("turn_number"))
        question    = _safe_str(ev.get("question_text"), max_len=300)
        score       = _safe_float(ev.get("score"))
        strength    = _classify_answer_strength(ev)
        # ✅ FIXED: added the same `or ev.get("category")` fallback that
        # compute_premium_interview_report already uses for category grouping.
        # Previously this function read only "rubric_category" — any
        # evaluation row using "category" instead would silently fall back to
        # "communication" here while being classified correctly elsewhere,
        # so a question's per-question insight and its category-feedback
        # entry could disagree on which category it belonged to.
        category    = _safe_str(ev.get("rubric_category") or ev.get("category"), max_len=60).lower()
        what_worked = _safe_str(ev.get("what_worked"), max_len=400)
        missing     = _safe_str(ev.get("what_was_missing"), max_len=400)
        improve     = _safe_str(ev.get("how_to_improve"), max_len=400)

        if strength == "strong":
            insight = what_worked or "Strong answer — clear, specific, and result-oriented."
        elif strength == "good":
            insight = (f"{what_worked} {missing}".strip()
                       or "Good answer — adding a specific result or example would make it stronger.")
        elif strength == "partial":
            insight = (missing or improve
                       or "Partially complete — add depth and a concrete measurable outcome.")
        elif strength == "weak":
            insight = (improve or missing
                       or "Lacked depth and specificity — prepare a structured example for this topic.")
        else:
            insight = "No answer was recorded for this question."

        insights.append({
            "turn_number":      turn,
            "question_preview": question[:120] + ("…" if len(question) > 120 else ""),
            "score":            round(score, 1),
            "strength_level":   strength,
            "category":         category,
            "display_category": _CATEGORY_DISPLAY_NAMES.get(category, category.replace("_", " ").title()),
            "insight":          insight.strip(),
        })
    return insights


# ---------------------------------------------------------------------------
# Hiring assessment narrative  (additive — premium report)
# ---------------------------------------------------------------------------

def _generate_hiring_assessment(
    readiness_level: str,
    final_score: float,
    plan: str,
    strong_categories: list[str],
    weak_categories: list[str],
    answered_questions: int,
    planned_questions: int,
) -> str:
    """Generate a professional, role-specific, non-generic hiring assessment paragraph."""
    strong_display = [_CATEGORY_DISPLAY_NAMES.get(c, c.replace("_", " ").title()) for c in strong_categories[:3]]
    weak_display   = [_CATEGORY_DISPLAY_NAMES.get(c, c.replace("_", " ").title()) for c in weak_categories[:3]]
    answered_frac  = (f"{answered_questions} of {planned_questions}"
                      if planned_questions else str(answered_questions))

    s = (
        f"The candidate demonstrated consistent strength in: {', '.join(strong_display)}."
        if strong_display else
        "The candidate did not establish clear standout strengths in this session."
    )
    g = (
        f"The primary gaps that an interviewer would notice are in: {', '.join(weak_display)}."
        if weak_display else
        "No critical gaps were identified in this session."
    )

    if readiness_level == HR_READINESS_STRONG:
        return (
            f"Based on this session ({answered_frac} questions answered, score: {final_score:.0f}/100), "
            f"this candidate presents as a strong interview performer. {s} {g} "
            f"This profile would likely progress past an initial screening and into a deeper technical or panel round."
        )
    if readiness_level == HR_READINESS_INTERVIEW_READY:
        return (
            f"Based on this session ({answered_frac} questions answered, score: {final_score:.0f}/100), "
            f"this candidate is in a competitive interview-ready state. {s} {g} "
            f"With targeted preparation in the weaker areas, this candidate would perform well in a real screening round."
        )
    if readiness_level == HR_READINESS_PROGRESSING:
        return (
            f"Based on this session ({answered_frac} questions answered, score: {final_score:.0f}/100), "
            f"this candidate is progressing toward interview readiness. {s} {g} "
            f"Answers need more specific examples, clearer ownership, and measurable outcomes to be competitive."
        )
    if readiness_level == HR_READINESS_DEVELOPING:
        return (
            f"Based on this session ({answered_frac} questions answered, score: {final_score:.0f}/100), "
            f"this candidate requires further preparation before a real interview. {g} "
            f"The priority should be building structured answer templates and practicing with real examples from their own experience."
        )
    return (
        f"Based on this session ({answered_frac} questions answered, score: {final_score:.0f}/100), "
        f"this candidate is not yet ready for a live interview in the target role. "
        f"Significant preparation is needed across multiple categories. "
        f"Start with structured answer frameworks, build two to three real project stories, "
        f"and complete at least three more full practice sessions before attempting a real interview."
    )


# ---------------------------------------------------------------------------
# Score band labeling  (additive)
# ---------------------------------------------------------------------------

def _get_score_band(score: float) -> str:
    """Map a numeric score to a clear human-readable performance band."""
    s = _safe_float(score)
    if s >= 85:
        return "Exceptional"
    if s >= 75:
        return "Strong"
    if s >= 60:
        return "Competent"
    if s >= 45:
        return "Developing"
    if s >= 30:
        return "Foundational"
    return "Needs Significant Work"


# ---------------------------------------------------------------------------
# Canonical summary computation  (PRESERVED — exact existing public signature)
# ---------------------------------------------------------------------------

def compute_interview_summary(
    plan: str,
    question_plan: Any,
    total_turns: int,
    evaluations: list[dict],
    duration_seconds: int | None = None,
    runtime_state: Any = None,
) -> dict:
    """Compute one canonical summary object for reports, PDFs, analytics, and finish results.

    Signature and all existing return keys are fully backward-compatible.
    The answer_strength_distribution key is the only addition — it is safe
    for all existing callers to ignore.
    """
    runtime        = coerce_runtime_state(runtime_state)
    planned_items  = coerce_question_plan_items(question_plan)

    if planned_items:
        planned_questions = len(planned_items)
    else:
        plan_key  = str(plan or "free").lower().strip()
        plan_cfg  = PLAN_CONFIG.get(plan_key, PLAN_CONFIG.get("free", {}))
        planned_questions = _safe_int(
            plan_cfg.get("max_turns") if isinstance(plan_cfg, dict) else 0
        )

    question_state  = _safe_str(runtime.get("question_state")).lower()
    raw_total_turns = _safe_int(total_turns)

    closed_questions = raw_total_turns
    if question_state in _OPEN_QUESTION_STATES:
        closed_questions = max(0, raw_total_turns - 1)
    if planned_questions > 0:
        closed_questions = min(planned_questions, closed_questions)

    answered_questions = sum(
        1 for ev in evaluations
        if isinstance(ev, dict) and _evaluation_is_answered(ev)
    )

    clarification_count = _safe_int(runtime.get("clarification_count"))
    timeout_count       = _safe_int(runtime.get("timeout_count"))
    skipped_count       = _safe_int(runtime.get("skipped_count"))
    system_cutoff_count = _safe_int(runtime.get("system_cutoff_count"))
    exited_early        = bool(runtime.get("exited_early"))

    durations = _safe_duration_list(runtime.get("question_response_times"))
    if not durations:
        durations = [
            _safe_int(ev.get("answer_duration_seconds"))
            for ev in evaluations
            if isinstance(ev, dict) and _safe_int(ev.get("answer_duration_seconds")) > 0
        ]

    average_response_seconds = (
        round(sum(durations) / len(durations), 1) if durations else None
    )
    completion_rate = (
        round((closed_questions / planned_questions) * 100, 1) if planned_questions else 0.0
    )

    strength_counts: dict[str, int] = {
        "strong": 0, "good": 0, "partial": 0, "weak": 0, "silent": 0
    }
    for ev in evaluations:
        if isinstance(ev, dict):
            level = _classify_answer_strength(ev)
            strength_counts[level] = strength_counts.get(level, 0) + 1

    return {
        # ---- Original keys (preserved exactly) ----
        "planned_questions":           planned_questions,
        "closed_questions":            closed_questions,
        "answered_questions":          answered_questions,
        "clarification_count":         clarification_count,
        "timeout_count":               timeout_count,
        "skipped_count":               skipped_count,
        "system_cutoff_count":         system_cutoff_count,
        "exited_early":                exited_early,
        "total_duration_seconds":      _safe_int(duration_seconds),
        "average_response_seconds":    average_response_seconds,
        "per_question_response_times": durations,
        "completion_rate":             completion_rate,
        "question_state":              question_state or TURN_STATE_QUESTION_CLOSED,
        # ---- New key (additive — safe for all existing callers to ignore) ----
        "answer_strength_distribution": strength_counts,
    }


# ---------------------------------------------------------------------------
# Premium full-report generator  (additive — called from finish_session)
# ---------------------------------------------------------------------------

def compute_premium_interview_report(
    plan: str,
    question_plan: Any,
    total_turns: int,
    evaluations: list[dict],
    final_score: float,
    category_scores: dict,
    strengths: list[str],
    weaknesses: list[str],
    duration_seconds: int | None = None,
    runtime_state: Any = None,
) -> dict:
    """Generate a full, premium HR-grade interview report.

    Purely additive — does not replace compute_interview_summary.
    Call from finish_session after the canonical summary to enrich the
    report payload with HR-realistic evaluation content.

    All sections are answer-specific and non-generic.
    """
    summary = compute_interview_summary(
        plan=plan, question_plan=question_plan, total_turns=total_turns,
        evaluations=evaluations, duration_seconds=duration_seconds,
        runtime_state=runtime_state,
    )

    answered_questions = summary["answered_questions"]
    planned_questions  = summary["planned_questions"]
    completion_rate    = summary["completion_rate"]
    strength_dist      = summary.get("answer_strength_distribution", {})

    silent_count = strength_dist.get("silent", 0)
    weak_count   = strength_dist.get("weak", 0)
    total_eval   = max(len(evaluations), 1)
    weak_ratio   = round((weak_count + silent_count) / total_eval, 3)

    # ✅ CHANGED: timeout_count no longer passed — _compute_hr_readiness_level's
    # unused parameter was removed (see its docstring). summary["timeout_count"]
    # is unaffected and still returned at the top level below.
    readiness_level = _compute_hr_readiness_level(
        final_score=_safe_float(final_score),
        completion_rate=completion_rate,
        answered_questions=answered_questions,
        planned_questions=planned_questions,
        silent_count=silent_count,
        weak_ratio=weak_ratio,
    )

    # --- Category-level analysis ---
    category_feedback: list[dict] = []
    strong_categories: list[str]  = []
    partial_categories: list[str] = []
    weak_categories: list[str]    = []

    by_category: dict[str, list[dict]] = {}
    for ev in evaluations:
        if not isinstance(ev, dict):
            continue
        cat = _safe_str(ev.get("rubric_category") or ev.get("category"), max_len=60).lower()
        if cat:
            by_category.setdefault(cat, []).append(ev)

    tier_priority = ["strong", "good", "partial", "weak", "silent"]
    for cat, cat_evals in by_category.items():
        scores = [_safe_float(ev.get("score")) for ev in cat_evals if _safe_float(ev.get("score")) > 0]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        levels = [_classify_answer_strength(ev) for ev in cat_evals]
        dominant = next((l for l in tier_priority if l in levels), "silent")

        if dominant in {"strong", "good"}:
            strong_categories.append(cat)
        elif dominant == "partial":
            partial_categories.append(cat)
        else:
            weak_categories.append(cat)

        category_feedback.append({
            "category":      cat,
            "display_name":  _CATEGORY_DISPLAY_NAMES.get(cat, cat.replace("_", " ").title()),
            "average_score": avg_score,
            "strength_level": dominant,
            "feedback":      _get_category_feedback(cat, dominant),
            "question_count": len(cat_evals),
        })

    tier_order = {l: i for i, l in enumerate(tier_priority)}
    category_feedback.sort(key=lambda x: (tier_order.get(x["strength_level"], 5), x["category"]))

    # ✅ NEW: single 0-100 Placement Readiness Score + per-company hiring
    # probabilities, derived from this session's per-category averages. Pure,
    # additive top-level key ("placement_readiness") — existing callers ignore
    # it safely; the PDF/report and dashboard surface it. See
    # app/services/placement_readiness.py for the pillar weighting + calibration.
    from app.services.placement_readiness import (
        build_placement_readiness,
        category_averages_from_feedback,
    )
    placement_readiness = build_placement_readiness(
        category_averages_from_feedback(category_feedback),
        session_count=1,
    )

    # ✅ CHANGED: _analyze_answer_quality now runs once per non-empty answer
    # via _compute_answer_quality_rows, shared by both assessment functions
    # below. Previously _assess_communication_style ran it itself and only
    # used 5 of its 15 fields; the other 10 were discarded. They are now
    # surfaced via _assess_integrity_and_ownership_signals.
    quality_rows      = _compute_answer_quality_rows(evaluations)
    communication     = _assess_communication_style(evaluations, quality_rows)
    integrity_signals = _assess_integrity_and_ownership_signals(quality_rows)
    per_question      = _generate_per_question_insights(evaluations)
    improvement_tips  = _generate_improvement_roadmap(weak_categories, partial_categories, max_tips=5)
    hiring_assessment = _generate_hiring_assessment(
        readiness_level=readiness_level,
        final_score=_safe_float(final_score),
        plan=plan,
        strong_categories=strong_categories,
        weak_categories=weak_categories,
        answered_questions=answered_questions,
        planned_questions=planned_questions,
    )

    return {
        "plan":             plan,
        "final_score":      round(_safe_float(final_score), 1),
        "score_band":       _get_score_band(final_score),
        "completion_rate":  completion_rate,

        "hr_readiness_level":       readiness_level,
        "hr_readiness_label":       _HR_READINESS_LABELS.get(readiness_level, readiness_level),
        "hr_readiness_description": _HR_READINESS_DESCRIPTIONS.get(readiness_level, ""),

        "planned_questions":      planned_questions,
        "answered_questions":     answered_questions,
        "closed_questions":       summary["closed_questions"],
        "timeout_count":          summary["timeout_count"],
        "clarification_count":    summary["clarification_count"],
        "exited_early":           summary["exited_early"],
        "total_duration_seconds": summary["total_duration_seconds"],
        "average_response_seconds": summary["average_response_seconds"],

        "answer_strength_distribution": strength_dist,
        "weak_ratio": weak_ratio,

        "category_feedback":  category_feedback,
        "category_scores":    category_scores if isinstance(category_scores, dict) else {},
        "strong_categories":  strong_categories,
        "weak_categories":    weak_categories,
        "partial_categories": partial_categories,

        "communication_assessment": communication,
        # ✅ NEW: surfaces the answer-quality fields _assess_communication_style
        # does not use — avg_word_count, repeat_sentence_ratio, avg_filler_ratio,
        # avg_ownership_language_ratio, team_credit_balance_ratio,
        # negativity_ratio, role_research_ratio, honesty_signal_ratio,
        # avg_specificity_score, integrity_summary. [Q3, Q6]
        "integrity_and_ownership_signals": integrity_signals,
        "strengths":  strengths if isinstance(strengths, list) else [],
        "weaknesses": weaknesses if isinstance(weaknesses, list) else [],

        "per_question_insights": per_question,
        "improvement_roadmap":   improvement_tips,
        "hiring_assessment":     hiring_assessment,
        "placement_readiness":   placement_readiness,
    }


# ---------------------------------------------------------------------------
# Cohort persistence bridge  (NEW — for analytics.py's cohort layer)
# ---------------------------------------------------------------------------

def extract_cohort_session_metrics(premium_report: dict) -> dict:
    """Flatten the subset of compute_premium_interview_report's output worth
    persisting per-session for cohort-level analytics. [Q1, Q3, Q5, Q6]

    Pure reshape — no new computation. Intended caller: the same
    orchestrator (finish_session) that calls
    analytics.sync_session_skill_scores, writing this dict's keys as columns
    on a per-session row (e.g. a new `session_summaries` table — see the
    handoff's assumption ledger) that analytics.py's cohort functions can
    later read. This is what lets a TPO cohort view show
    hr_readiness_level distribution, weak_ratio, and integrity signals
    across a 500-student cohort without recomputing a premium report for
    each student on every dashboard load.
    """
    strength_dist = premium_report.get("answer_strength_distribution", {}) or {}
    integrity     = premium_report.get("integrity_and_ownership_signals", {}) or {}
    communication = premium_report.get("communication_assessment", {}) or {}
    readiness     = premium_report.get("placement_readiness", {}) or {}

    return {
        "hr_readiness_level":    premium_report.get("hr_readiness_level"),
        # ✅ NEW: the single 0-100 Placement Readiness Score + top company match
        # for this session, so cohort views can chart it without recomputing a
        # premium report per student.
        "placement_readiness_score": readiness.get("score"),
        "placement_readiness_tier":  readiness.get("tier"),
        "top_hiring_match":          readiness.get("top_company"),
        "score_band":            premium_report.get("score_band"),
        "final_score":           premium_report.get("final_score"),
        "completion_rate":       premium_report.get("completion_rate"),
        "weak_ratio":            premium_report.get("weak_ratio"),
        "answered_questions":    premium_report.get("answered_questions"),
        "planned_questions":     premium_report.get("planned_questions"),
        "silent_count":          strength_dist.get("silent", 0),
        "weak_count":            strength_dist.get("weak", 0),
        "strong_count":          strength_dist.get("strong", 0),
        "top_weak_categories":   premium_report.get("weak_categories", [])[:3],
        "top_strong_categories": premium_report.get("strong_categories", [])[:3],
        "clarity_level":         communication.get("clarity_level"),
        "negativity_ratio":      integrity.get("negativity_ratio"),
        "honesty_signal_ratio":  integrity.get("honesty_signal_ratio"),
    }


# ---------------------------------------------------------------------------
# Headline export summary  (NEW — short, flat export for NAAC/NIRF/parents)
# ---------------------------------------------------------------------------

def generate_report_export_summary(premium_report: dict, student_name: str | None = None) -> dict:
    """Short, flat 'headline' extract of a premium report for NAAC/NIRF/parent-
    style exports — one row per session, sized for a CSV column set, email
    body, or PDF cover page without the full 28-key report. [Q6]

    top_strength / top_growth_area pull display_names from category_feedback,
    which compute_premium_interview_report already sorts strong -> silent:
      - top_strength: first entry with strength_level in {strong, good}.
      - top_growth_area: scanning from the END (silent, weak, partial, ...),
        the first entry with strength_level in {weak, partial} — i.e. the
        most severe ACTUAL gap, deliberately excluding "silent" categories
        that have no data rather than a poor score.
    """
    category_feedback = premium_report.get("category_feedback", []) or []

    strongest = next(
        (c for c in category_feedback if c.get("strength_level") in {"strong", "good"}),
        None,
    )
    weakest = next(
        (c for c in reversed(category_feedback) if c.get("strength_level") in {"weak", "partial"}),
        None,
    )

    final_score        = _safe_float(premium_report.get("final_score"))
    completion_rate     = _safe_float(premium_report.get("completion_rate"))
    hr_readiness_label = premium_report.get("hr_readiness_label") or "Assessment pending"

    return {
        "student_name":       student_name,
        "final_score":        premium_report.get("final_score"),
        "score_band":         premium_report.get("score_band"),
        "hr_readiness_label": hr_readiness_label,
        "completion_rate":    premium_report.get("completion_rate"),
        "top_strength":       strongest.get("display_name") if strongest else None,
        "top_growth_area":    weakest.get("display_name") if weakest else None,
        "headline": (
            f"{hr_readiness_label} ({final_score:.0f}/100, {completion_rate:.0f}% complete)"
        ),
        "hiring_assessment": premium_report.get("hiring_assessment"),
    }