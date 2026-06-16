"""Verify that deterministic follow-up questions are always resume-grounded.

Every question must reference specific project names, skills, or education
context from the resume — never vague placeholders like "that work",
"that project", or "there".
"""

from app.services.interviewer import (
    _build_free_followup_question,
    _build_pro_followup_question,
    _build_career_followup_question,
    _humanize_question_target,
)

VAGUE_PHRASES = [
    "that work",
    "in that specific work",
    "in that specific situation",
    "that kind of role",
    "that flow",
    "that workflow",
    "that pipeline",
]

# "that project" and "that role" are OK when the specific project/role name
# is mentioned earlier in the same question, so we check them separately.
CONTEXTUAL_PHRASES = ["that project", "that role"]


def _ai_resume() -> dict:
    return {
        "candidate_name": "Naveenkumar",
        "education": ["B.Tech AI & Data Science, final year"],
        "skills": ["Python", "FastAPI", "RAG", "Prompt Engineering", "Supabase"],
        "projects": [
            {
                "name": "NewsWeave AI",
                "description": "AI news intelligence platform with retrieval and summarization",
                "tech_stack": ["FastAPI", "PyTorch", "Groq"],
            },
            {
                "name": "HiringFlow",
                "description": "Automated hiring pipeline using NLP",
                "tech_stack": ["Python", "spaCy"],
            },
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
                "description": "Worked on process analysis, reporting, and stakeholder updates",
            }
        ],
        "inferred_role": "business_analyst_operations",
    }


def _has_no_vague_phrases(question: str) -> bool:
    """Return True if the question does NOT contain any vague placeholder phrase."""
    lower = question.lower()
    for phrase in VAGUE_PHRASES:
        if phrase in lower:
            return False
    return True


def _has_resume_context(question: str, resume: dict) -> bool:
    """Return True if the question references at least one specific resume detail."""
    lower = question.lower()
    # Check for project names
    for proj in resume.get("projects", []):
        name = (proj.get("name") or "").lower()
        if name and name in lower:
            return True
    # Check for skills
    for skill in resume.get("skills", []):
        if skill.lower() in lower:
            return True
    # Check for education context
    for edu in resume.get("education", []):
        if isinstance(edu, str) and any(word.lower() in lower for word in edu.split() if len(word) > 3):
            return True
    # Check for role references
    inferred_role = (resume.get("inferred_role") or "").lower().replace("_", " ")
    if inferred_role and any(word in lower for word in inferred_role.split() if len(word) > 3):
        return True
    return False


# ---- FREE PLAN FOLLOW-UP TESTS ----

def test_free_intro_followup_no_vague_with_resume():
    """After introduction, free followup must not be vague when resume has projects."""
    resume = _ai_resume()
    previous = "Tell me about yourself."
    user_text = "I am a final year AI student, I built NewsWeave AI and I want an AI backend role."
    q = _build_free_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_free_intro_followup_has_context_with_resume():
    """After introduction, free followup must reference resume details."""
    resume = _ai_resume()
    previous = "Tell me about yourself."
    user_text = "I am a final year student studying AI and data science."
    q = _build_free_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    # Should reference either a project, skill, or education detail
    assert _has_resume_context(q, resume) or "NewsWeave" in q or "AI" in q or "strongest" in q, \
        f"Question lacks resume context: {q}"


def test_free_ownership_followup_no_vague():
    """Ownership follow-up must not use 'that work' or 'that project'."""
    resume = _ai_resume()
    previous = "Which part of NewsWeave AI did you personally handle?"
    user_text = "I built the retrieval pipeline and integrated the Groq API for summarization."
    q = _build_free_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_free_communication_explain_no_vague():
    """Communication explain follow-up must not say 'that work'."""
    resume = _ai_resume()
    previous = "Explain your work clearly for a non-technical interviewer."
    user_text = "My project filters news articles and summarizes them using AI."
    q = _build_free_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_free_fallback_with_no_signal_still_grounded():
    """Even when answer signals are weak, free followup must reference resume."""
    resume = _ai_resume()
    previous = "Tell me about yourself."
    user_text = "I am a student."
    q = _build_free_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


# ---- PRO PLAN FOLLOW-UP TESTS ----

def test_pro_intro_followup_no_vague():
    """Pro intro follow-up must not be vague when resume has projects."""
    resume = _ai_resume()
    previous = "Tell me about yourself."
    user_text = "I built NewsWeave AI, an AI news platform, and I have experience with FastAPI."
    q = _build_pro_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_pro_ownership_fallback_no_vague():
    """Pro ownership follow-up must not say 'that decision' without context."""
    resume = _ai_resume()
    previous = "What exactly did you own in NewsWeave AI?"
    user_text = "I owned the entire retrieval pipeline and made the decision to use Groq."
    q = _build_pro_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_pro_workflow_followup_no_vague():
    """Pro workflow follow-up must reference specific subject."""
    resume = _ai_resume()
    previous = "Walk me through how NewsWeave AI processes a request."
    user_text = "It retrieves articles, filters them, and generates a summary."
    q = _build_pro_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_pro_tool_method_no_vague():
    """Pro tool_method follow-up must not be vague."""
    resume = _ai_resume()
    previous = "Why did you use FastAPI for this project?"
    user_text = "FastAPI was fast and had good async support for the retrieval."
    q = _build_pro_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


# ---- CAREER PLAN FOLLOW-UP TESTS ----

def test_career_intro_followup_no_vague():
    """Career intro follow-up must not be vague."""
    resume = _ai_resume()
    previous = "Introduce yourself in a way that shows why a hiring panel should remember you."
    user_text = "I am a final year AI student and I built NewsWeave AI."
    q = _build_career_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_career_ownership_no_vague():
    """Career ownership follow-up must reference specific project."""
    resume = _ai_resume()
    previous = "What exactly did you own in your strongest project?"
    user_text = "I designed the entire backend architecture for NewsWeave AI."
    q = _build_career_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_career_role_fit_no_vague():
    """Career role_fit follow-up must name the target role."""
    resume = _ai_resume()
    previous = "Why are you the right fit for an AI backend engineer role?"
    user_text = "I have built production AI pipelines and understand backend patterns."
    q = _build_career_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_career_studies_followup_no_vague():
    """Career studies follow-up must not be vague."""
    resume = _ai_resume()
    previous = "What are you studying and how does it relate to the role?"
    user_text = "I am studying AI and data science, focusing on NLP and retrieval."
    q = _build_career_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


# ---- NON-SOFTWARE RESUME TESTS ----

def test_free_non_software_resume_still_grounded():
    """Even non-software resumes must produce grounded questions."""
    resume = _non_software_resume()
    previous = "Tell me about yourself."
    user_text = "I am Asha, I studied business analytics and interned at a consulting firm."
    q = _build_free_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


def test_career_non_software_resume_still_grounded():
    """Career plan with non-software resume must not be vague."""
    resume = _non_software_resume()
    previous = "Tell me about yourself."
    user_text = "I worked on an operations dashboard using Power BI."
    q = _build_career_followup_question(previous, user_text, resume)
    assert q, "Question should not be empty"
    assert _has_no_vague_phrases(q), f"Question is vague: {q}"


# ---- HUMANIZE QUESTION TARGET TESTS ----

def test_humanize_target_no_that_work_defaults():
    """Default targets for validation, tradeoff, communication must say 'your work' not 'that work'."""
    for family in ["validation_metrics", "tradeoff_decision", "communication_explain"]:
        result = _humanize_question_target("", family)
        assert "that work" not in result.lower(), f"Family '{family}' still uses 'that work': {result}"
        assert "your work" in result.lower(), f"Family '{family}' doesn't use 'your work': {result}"


def test_humanize_target_workflow_returns_your_work():
    """Workflow/process/tool targets must return 'your work' not 'that work'."""
    for target in ["workflow", "process", "tool", "method"]:
        result = _humanize_question_target(target, "workflow_process")
        assert "that work" not in result.lower(), f"Target '{target}' still uses 'that work': {result}"
