"""
PrepVista AI - Interview Summary Contracts & Premium HR Evaluation Engine
=========================================================================
Shared turn-outcome constants, canonical summary computation, and a full
HR-grade report generator used by finish scoring, PDF, analytics, and
user-facing reports.

Backward-compatible: all existing public names, constants, and return shapes
are preserved exactly.  All new capabilities are purely additive.
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
    }


# ---------------------------------------------------------------------------
# Category-level feedback tables  (additive — premium report)
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
        "weak":    "Process answers were vague. Practice explaining work step-by-step: input → your decision → output → reason.",
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
        "partial": "Behavioral answers described the situation but missed the action and result. Practice: Situation → Task → Action → Result.",
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
}


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
        "Practice your most complex technical decision in 90 seconds: context → choice → why → result.",
    ],
    "ownership": [
        "Begin ownership answers with 'I personally...' and explicitly separate your contribution from the team's.",
        "Prepare one story per project where your individual decision directly changed the outcome.",
        "Avoid 'we' when describing something you built or decided — interviewers want to know what was yours.",
    ],
    "workflow_process": [
        "Practice numbering your steps and explaining the constraint behind each: 'Step 1 was X because Y was the bottleneck.'",
        "For every project, build a 3-step summary: what came in → what you did → what came out and why.",
        "Add decision points to your process explanation — what choices did you make and why did you make them?",
    ],
    "communication_explain": [
        "Practice the 'explain to a non-expert' framework: one-sentence core idea, one real-world analogy, one impact statement.",
        "Record yourself answering and listen for jargon, filler words, or unclear transitions.",
        "Use the 'so what' test: after every explanation, ask 'so what does that mean in practice?' and add that answer.",
    ],
    "role_fit": [
        "Prepare a 3-part role-fit answer: your strongest skill + how you used it + why it fits what this team needs.",
        "Research the job description and weave 2–3 of its key phrases naturally into your answers.",
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
        "Prepare at least two real problem stories: the problem → what you tried → what you chose → why → what changed.",
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
    timeout_count: int,
    weak_ratio: float,
) -> str:
    """Classify the candidate's overall interview readiness as an HR evaluator would.

    Uses score, completion, silence rate, and weak-answer ratio as signals.
    Returns one of the HR_READINESS_* constants.
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

def _assess_communication_style(evaluations: list[dict]) -> dict:
    """Compute aggregate communication quality signals from evaluation rows."""
    if not evaluations:
        return {
            "average_communication_score": 0.0,
            "clarity_level": "unknown",
            "communication_summary": "No answers were recorded to assess communication quality.",
        }

    comm_scores = [
        _safe_float(ev.get("communication_score"))
        for ev in evaluations
        if isinstance(ev, dict) and _safe_float(ev.get("communication_score")) > 0
    ]
    avg_comm = round(sum(comm_scores) / len(comm_scores), 2) if comm_scores else 0.0

    flags: dict[str, int] = {
        "filler_heavy": 0, "generic_opener": 0, "has_result": 0,
        "has_example": 0, "has_structure": 0,
    }
    valid_answers = 0
    for ev in evaluations:
        if not isinstance(ev, dict):
            continue
        raw = _safe_str(ev.get("raw_answer") or ev.get("normalized_answer"), max_len=3000)
        if not raw:
            continue
        valid_answers += 1
        q = _analyze_answer_quality(raw)
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

    if valid_answers == 0:
        return {
            "average_communication_score": avg_comm,
            "clarity_level": "unknown",
            "communication_summary": "Communication quality could not be assessed without answer content.",
        }

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
        category    = _safe_str(ev.get("rubric_category"), max_len=60).lower()
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
    readiness_label = _HR_READINESS_LABELS.get(readiness_level, "Progressing")
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

    readiness_level = _compute_hr_readiness_level(
        final_score=_safe_float(final_score),
        completion_rate=completion_rate,
        answered_questions=answered_questions,
        planned_questions=planned_questions,
        silent_count=silent_count,
        timeout_count=summary["timeout_count"],
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

    communication      = _assess_communication_style(evaluations)
    per_question       = _generate_per_question_insights(evaluations)
    improvement_tips   = _generate_improvement_roadmap(weak_categories, partial_categories, max_tips=5)
    hiring_assessment  = _generate_hiring_assessment(
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
        "strengths":  strengths if isinstance(strengths, list) else [],
        "weaknesses": weaknesses if isinstance(weaknesses, list) else [],

        "per_question_insights": per_question,
        "improvement_roadmap":   improvement_tips,
        "hiring_assessment":     hiring_assessment,
    }
