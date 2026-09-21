"""
PrepVista AI — Prompt Helpers & Constants
Extracted from prompts.py — tone variants, session progression,
greeting structures, resume highlight text, and difficulty blocks.

Re-exported by prompts.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import json

from app.config import get_difficulty_mode_config, normalize_difficulty_mode, get_plan_config
# ✅ ADDED: Branch taxonomy for build_question_plan_prompt branch-aware guidance
from app.services.technical_taxonomy import (
    DEPARTMENT_DISPLAY_NAMES,
    get_technical_categories,
)


# ═══════════════════════════════════════════════════════════════
# ANTI-REPETITION ENGINE — Tone & Personality Variation
# ═══════════════════════════════════════════════════════════════
# Six micro-personalities that rotate based on session_variant.
# Each produces a subtly different interviewer "voice" so that
# session #1 never sounds like session #5 or session #30.

_TONE_VARIANTS = [
    {
        "label": "warm",
        "instruction": "Use a warm, supportive, and approachable tone. You genuinely want the candidate to succeed and it shows in your phrasing.",
        "greeting_style": "Start with a genuinely warm welcome that makes the candidate feel at ease before diving in.",
    },
    {
        "label": "direct",
        "instruction": "Use a direct, no-nonsense, and efficient tone. You value concise answers and move briskly through topics.",
        "greeting_style": "Open with a brief professional greeting and move quickly to the first question.",
    },
    {
        "label": "curious",
        "instruction": "Use a curious and intellectually engaged tone. You ask questions because you genuinely want to understand their thinking.",
        "greeting_style": "Open by expressing genuine curiosity about something specific from their resume.",
    },
    {
        "label": "analytical",
        "instruction": "Use an analytical, precise, and structured tone. You appreciate clear reasoning and structured answers.",
        "greeting_style": "Open by noting a specific technical or analytical element from their resume that caught your attention.",
    },
    {
        "label": "encouraging",
        "instruction": "Use an encouraging, growth-oriented tone. You focus on potential and treat gaps as learning opportunities rather than failures.",
        "greeting_style": "Open by highlighting a strength or growth signal from their resume before starting.",
    },
    {
        "label": "professional",
        "instruction": "Use a professional, calm, corporate-interview tone. You sound like a senior hiring manager who has done this 500 times.",
        "greeting_style": "Open with a composed, corporate-panel style introduction.",
    },
]


def _select_tone_variant(session_variant: int = 0) -> dict:
    """Select a tone variant based on session_variant for personality diversity."""
    return _TONE_VARIANTS[abs(session_variant) % len(_TONE_VARIANTS)]


# ═══════════════════════════════════════════════════════════════
# SESSION PROGRESSION ENGINE
# ═══════════════════════════════════════════════════════════════
# Adjusts prompt behavior based on how many sessions the student
# has completed. Early sessions are gentler. Later sessions push
# depth, hiring readiness, and question novelty harder.

def _session_progression_block(session_number: int = 1) -> str:
    """Return a progression-aware instruction block."""
    n = max(1, session_number)
    if n <= 3:
        return """
SESSION PROGRESSION: EARLY PRACTICE (sessions 1-3)
- This is an early practice session. Be encouraging and help build confidence.
- Focus on fundamentals: clear introductions, project explanations, and basic technical understanding.
- Provide slightly more context before questions to help the candidate understand what you're looking for.
- Do not over-challenge. Save the hardest questions for later sessions.
"""
    if n <= 10:
        return f"""
SESSION PROGRESSION: BUILDING CONFIDENCE (session {n})
- The candidate has completed several practice sessions. They are building familiarity.
- Expect clearer answers and push for slightly more depth than you would in a first session.
- Introduce more ownership, decision-making, and "why" questions alongside technical ones.
- Start testing real interview readiness: can they explain trade-offs, defend decisions, and articulate impact?
"""
    if n <= 25:
        return f"""
SESSION PROGRESSION: INTERMEDIATE PRACTICE (session {n})
- This is a returning user who has practiced extensively. Do NOT treat them like a beginner.
- Skip overly basic warm-up angles unless the resume is genuinely thin.
- Push for sharper ownership, stronger reasoning, and more specific examples.
- Test hiring readiness: "why should we hire you", "what makes you stand out", and "what would you change about your approach?"
- Vary your questioning angles more aggressively — this user has heard many standard questions already.
"""
    return f"""
SESSION PROGRESSION: ADVANCED PRACTICE (session {n})
- This is a highly experienced user who has completed {n} practice sessions. They expect maximum value.
- Skip ALL basic warm-ups. Assume they can introduce themselves.
- Open with a challenging, resume-specific question that demonstrates you understand their exact profile.
- Test advanced hiring signals: decision-making under ambiguity, cross-functional communication, impact quantification, and professional maturity.
- Use unusual question angles they have NOT heard before: hypothetical scenarios, constraint problems, teaching challenges, stakeholder conflicts.
- Every question must feel genuinely novel and challenging.
"""


# ═══════════════════════════════════════════════════════════════
# GREETING STRUCTURE VARIATION
# ═══════════════════════════════════════════════════════════════
# Five different structural patterns for the greeting message.
# Prevents the "greet → resume detail → question" pattern from
# becoming predictable after 3 sessions.

_GREETING_STRUCTURES = [
    # Structure 0: Classic (greet → resume detail → question)
    """GREETING STRUCTURE: Classic
- Greet the candidate naturally by name.
- Mention one short positive detail from their resume.
- Then ask the opening question.""",
    # Structure 1: Question-first (hook → question → brief context)
    """GREETING STRUCTURE: Question-First
- Start with the opening interview question directly after a one-line greeting.
- Then briefly mention what caught your eye in their resume as context for why you asked.
- This structure feels more like a real rapid-fire interview.""",
    # Structure 2: Curiosity hook (express genuine interest → question)
    """GREETING STRUCTURE: Curiosity Hook
- Open with a brief statement of genuine curiosity about something specific from their resume (a project, skill, or achievement).
- Bridge naturally into the opening question.
- Make it feel like you picked up their resume and something genuinely stood out.""",
    # Structure 3: Challenge opener (set expectations → question)
    """GREETING STRUCTURE: Challenge Opener
- Greet briefly, then set the tone: explain what this interview will test (e.g., "I'll be looking at how you explain your work and defend your choices").
- Then ask the opening question.
- This makes the candidate feel the session has professional stakes.""",
    # Structure 4: Strength-first (compliment a signal → question)
    """GREETING STRUCTURE: Strength-First
- Open by specifically naming the strongest signal in their resume (a particular project, an interesting skill combination, or a clear career direction).
- Transition naturally into the opening question by connecting it to that strength.
- Make the candidate feel seen and valued before the first question.""",
]


def _select_greeting_structure(session_variant: int = 0) -> str:
    """Select a greeting structure variation."""
    return _GREETING_STRUCTURES[abs(session_variant) % len(_GREETING_STRUCTURES)]


# ═══════════════════════════════════════════════════════════════
# CORE HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def _coerce_resume_summary(resume_summary) -> dict:
    """Normalize the stored resume summary into a dict."""
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


def _normalize_candidate_name(name: str) -> str:
    """Clean noisy extracted names so greeting prompts stay natural."""
    cleaned = " ".join(str(name or "").replace("\n", " ").split()).strip()
    cleaned = "".join(character if character.isalpha() or character in {" ", "-", "'", "."} else " " for character in cleaned)
    cleaned = " ".join(cleaned.split()).strip()
    if not cleaned:
        return "Candidate"
    if len(cleaned.split()) >= 2 and all(len(part) == 1 and part.isalpha() for part in cleaned.split()):
        cleaned = "".join(cleaned.split())
    parts = []
    for part in cleaned.split():
        parts.append(part.capitalize() if part.isupper() else part)
    return " ".join(parts)[:40] or "Candidate"


def _build_resume_highlight_text(resume_summary, resume_text: str) -> str:
    """Create a concise factual highlight string for the greeting prompt."""
    summary = _coerce_resume_summary(resume_summary)
    candidate_name = _normalize_candidate_name(summary.get("candidate_name") or "Candidate")
    skills = [skill for skill in summary.get("skills", []) if isinstance(skill, str) and skill.strip()]
    projects = [project for project in summary.get("projects", []) if isinstance(project, dict)]
    experience = [item for item in summary.get("experience", []) if isinstance(item, dict)]
    education = [item for item in summary.get("education", []) if isinstance(item, str) and item.strip()]

    project_name = str(projects[0].get("name") or "").strip() if projects else ""
    job_title = str(experience[0].get("title") or "").strip() if experience else ""

    highlights: list[str] = []
    if skills:
        highlights.append(f"skills like {', '.join(skills[:3])}")
    if project_name:
        highlights.append(f"a project called {project_name}")
    if job_title:
        highlights.append(f"experience as {job_title}")
    if education:
        highlights.append(f"education in {education[0]}")

    if highlights:
        detail_text = "; ".join(highlights[:2])
    else:
        first_line = next((line.strip() for line in (resume_text or "").splitlines() if line.strip()), "")
        detail_text = first_line[:160] if first_line else "resume-based strengths and potential"

    return f"Candidate name: {candidate_name}\nResume highlights: {detail_text}"


def _difficulty_prompt_block(mode: str) -> str:
    """Return a short prompt block for the selected interview difficulty mode."""
    normalized_mode = normalize_difficulty_mode(mode)
    difficulty_cfg = get_difficulty_mode_config(normalized_mode)

    rules = {
        "auto": """
- AUTO mode is enabled.
- Let the resume, plan tier, and recent answer quality decide whether the next question stays simple or becomes sharper.
- Do not force the whole round to stay easy or hard.
""",
        "basic": """
- BASIC mode is enabled.
- Keep questions direct, supportive, and easier to answer.
- Remove tiny trick questions, heavy depth jumps, and over-narrow probing.
- Once you capture the main signal, move on instead of drilling deeper.
""",
        "medium": """
- MEDIUM mode is enabled.
- Keep the round balanced and practical.
- Do not waste time on overly basic warm-up questions if the resume already shows stronger work.
- Ask moderately challenging questions that test real understanding without becoming overly aggressive.
""",
        "difficult": """
- DIFFICULT mode is enabled.
- Assume the candidate wants stronger practice.
- Avoid tiny or overly obvious questions once you already have the basic signal.
- Prefer deeper ownership, reasoning, trade-offs, validation, impact, and role-fit pressure when the resume supports it.
""",
    }

    return (
        f"Difficulty mode: {difficulty_cfg['label']}\n"
        f"Difficulty intent: {difficulty_cfg['description']}\n"
        f"{rules[normalized_mode].strip()}"
    )


# ═══════════════════════════════════════════════════════════════
# EXPANDED SPEECH RECOVERY BANK
# ═══════════════════════════════════════════════════════════════
# Multi-domain speech-to-text recovery examples. Added mechanical,
# civil, electronics, business, and general academic terms.

_SPEECH_RECOVERY_BLOCK = """
==================================================
SPEECH RECOVERY RULE (MULTI-DOMAIN)
==================================================

- If spoken answers contain speech-to-text errors, recover likely intended meaning before judging.
- Software / CS examples:
  "first api" may mean FastAPI
  "rack workflow" or "rag workflow" may mean RAG workflow
  "advice serial testing" may mean adversarial testing
  "pie torch" may mean PyTorch
  "my sequel" or "my SQL" may mean MySQL
  "reacted" or "react id" may mean React.js
  "jango" or "jingle" may mean Django
  "docker eyes" may mean Dockerize
  "cube nettis" may mean Kubernetes
  "get hub" or "git up" may mean GitHub
  "see eye" may mean CI/CD
  "ell em" or "LM" may mean LLM
  "trans former" may mean Transformer

- AI / ML / Data examples:
  "convolution" or "see and an" may mean CNN
  "hyper parameter" may mean hyperparameter
  "epics" or "epic" may mean epoch
  "over fitting" may mean overfitting
  "back propagation" may mean backpropagation
  "gradient decent" may mean gradient descent
  "natural language" may mean NLP
  "random forest" stays random forest
  "tensor flow" may mean TensorFlow

- Electronics / Embedded / VLSI examples:
  "veer log" or "very log" may mean Verilog
  "vee hd l" or "vhdl" may mean VHDL
  "fpga" stays FPGA
  "micro controller" may mean microcontroller
  "eye oh tea" or "IOT" may mean IoT
  "peel sea" may mean PLC
  "arm cortex" stays ARM Cortex
  "pea sea bee" may mean PCB

- Mechanical / Manufacturing examples:
  "see add" or "see aid" may mean CAD
  "solid works" may mean SolidWorks
  "auto cad" may mean AutoCAD
  "thermo dynamics" or "thermal die namics" may mean thermodynamics
  "finite element" stays FEA / finite element analysis
  "see and see" may mean CNC
  "three d printing" may mean 3D printing
  "injection molding" stays injection molding
  "cat ya" or "catia" may mean CATIA

- Civil / Structural / Design examples:
  "revit" stays Revit
  "staad" or "stud pro" may mean STAAD Pro
  "etabs" stays ETABS
  "rcc" or "our CC" may mean RCC (reinforced concrete)
  "geo technical" may mean geotechnical
  "primavera" stays Primavera

- Business / Analyst / Operations examples:
  "see are em" or "serum" may mean CRM
  "tableau" stays Tableau
  "power bi" or "power buy" may mean Power BI
  "sequel server" may mean SQL Server
  "sap" stays SAP
  "erp" or "ee are pee" may mean ERP

- General academic:
  "thesis" stays thesis
  "research paper" stays research paper
  "coursework" stays coursework

- Judge intended meaning and delivery separately.
- Do not punish meaning and delivery equally when the meaning is recoverable.
"""


# ═══════════════════════════════════════════════════════════════
# MAIN PROMPT BUILDERS
# ═══════════════════════════════════════════════════════════════
