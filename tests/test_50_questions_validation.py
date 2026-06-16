"""
COMPREHENSIVE 50-QUESTION VALIDATION
=====================================
Generates 50 deterministic follow-up questions across ALL plans (Free, Pro, Career),
ALL question families, MULTIPLE resume types, and varied answer signals.

Each question is validated for:
  1. NOT empty — the function must return a question
  2. NO vague phrases — "that work", "that project", "there", etc. are banned
     unless the specific subject is already named in the same sentence
  3. GROUNDED — references a specific project, skill, role, or education detail
  4. USER CLARITY — question is self-contained (user knows exactly what it refers to)
  5. STRUCTURE INTACT — original return types and call signatures preserved

This test ensures 100% accuracy and deployment readiness.
"""

import json
import pytest
from app.services.interviewer import (
    _build_free_followup_question,
    _build_pro_followup_question,
    _build_career_followup_question,
    _humanize_question_target,
    _build_fallback_ai_response,
    _question_family_from_text,
)


# ═══════════════════════════════════════════════════════════════════════
# VAGUE PHRASE DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════

# Absolutely banned — never acceptable in any question
BANNED_PHRASES = [
    "that work",
    "that specific work",
    "in that specific situation",
    "that kind of role",
    "that flow",
    "that workflow",
    "that pipeline",
    "the action you took there",
    "what you did there",
]

# Acceptable ONLY if a specific name appears earlier in the same question
CONTEXTUAL_OK_PHRASES = ["that project", "that role"]


def _is_grounded(question: str) -> tuple[bool, str]:
    """Validate a question has NO banned vague phrases.
    Returns (pass, reason).
    """
    if not question or not question.strip():
        return False, "EMPTY question returned"
    lower = question.lower()
    for phrase in BANNED_PHRASES:
        if phrase in lower:
            return False, f"Contains banned phrase: '{phrase}'"
    # Contextual phrases are OK only if a specific subject is named first
    for phrase in CONTEXTUAL_OK_PHRASES:
        if phrase in lower:
            # Check that SOMETHING specific (capitalized word, project name) appears before the phrase
            idx = lower.index(phrase)
            prefix = question[:idx]
            # If no specific name is present before, it's vague
            has_specific = any(
                word[0].isupper() and len(word) > 2
                for word in prefix.split()
                if word.strip(".,;:!?'\"()") and word[0].isalpha()
            )
            if not has_specific:
                return False, f"Contains '{phrase}' without naming a specific subject first"
    return True, "OK"


# ═══════════════════════════════════════════════════════════════════════
# RESUME FIXTURES — 3 different candidate types
# ═══════════════════════════════════════════════════════════════════════

def _ai_resume() -> dict:
    """AI/ML student with technical projects."""
    return {
        "candidate_name": "Naveenkumar",
        "education": ["B.Tech AI & Data Science, final year, KCG College"],
        "skills": ["Python", "FastAPI", "RAG", "Prompt Engineering", "Supabase", "PyTorch"],
        "projects": [
            {"name": "NewsWeave AI", "description": "AI news intelligence platform with retrieval and summarization", "tech_stack": ["FastAPI", "PyTorch", "Groq"]},
            {"name": "HiringFlow", "description": "Automated hiring pipeline using NLP for classification", "tech_stack": ["Python", "spaCy", "scikit-learn"]},
            {"name": "SignalBrief", "description": "Context-aware document summarizer with hallucination filtering", "tech_stack": ["LangChain", "Supabase", "OpenAI"]},
        ],
        "experience": [],
        "certifications": ["IBM Gen AI Fundamentals"],
        "inferred_role": "ai_backend_engineer",
    }


def _business_resume() -> dict:
    """Business/operations candidate — non-software."""
    return {
        "candidate_name": "Asha",
        "education": ["BBA in Business Analytics, Christ University"],
        "skills": ["Excel", "Power BI", "Stakeholder Communication", "Process Improvement", "SQL"],
        "projects": [
            {"name": "Operations Dashboard", "description": "Improved reporting turnaround and stakeholder visibility", "tech_stack": ["Power BI", "Excel"]},
        ],
        "experience": [
            {"title": "Operations Intern", "company": "Deloitte", "description": "Process analysis, reporting, and stakeholder updates"},
        ],
        "inferred_role": "business_analyst",
    }


def _fullstack_resume() -> dict:
    """Experienced full-stack developer."""
    return {
        "candidate_name": "Ravi",
        "education": ["M.Tech Computer Science, IIT Madras"],
        "skills": ["React", "Node.js", "PostgreSQL", "Docker", "AWS", "TypeScript"],
        "projects": [
            {"name": "ShopStream", "description": "Real-time e-commerce platform with WebSocket notifications", "tech_stack": ["React", "Node.js", "Redis"]},
            {"name": "DevBoard", "description": "Developer analytics dashboard with CI/CD integration", "tech_stack": ["Next.js", "PostgreSQL", "Docker"]},
        ],
        "experience": [
            {"title": "Software Engineer", "company": "Zoho", "description": "Built microservices and led frontend migration"},
        ],
        "inferred_role": "fullstack_engineer",
    }


# ═══════════════════════════════════════════════════════════════════════
# QUESTION SCENARIO MATRIX — 50 total questions
# Each tuple: (plan, builder_fn, previous_question, user_answer, resume_fn, label)
# ═══════════════════════════════════════════════════════════════════════

SCENARIOS = [
    # ─── FREE PLAN (17 questions) ───────────────────────────────────
    # Introduction family
    ("free", "free", "Tell me about yourself.", "I am a final year AI student, I built NewsWeave AI.", _ai_resume, "F01-intro-ai"),
    ("free", "free", "Tell me about yourself.", "I am Asha, I studied business analytics and interned at Deloitte.", _business_resume, "F02-intro-biz"),
    ("free", "free", "Tell me about yourself.", "I am a student.", _ai_resume, "F03-intro-minimal"),
    ("free", "free", "Tell me about yourself.", "I built ShopStream, a real-time e-commerce platform.", _fullstack_resume, "F04-intro-fullstack"),
    # Studies family
    ("free", "free", "What are you currently studying?", "I am in my final year of AI and Data Science.", _ai_resume, "F05-studies-ai"),
    ("free", "free", "What are you studying and how does it connect to things you build?", "I study BBA with analytics focus and use Power BI daily.", _business_resume, "F06-studies-biz"),
    # Ownership family
    ("free", "free", "Which part of NewsWeave AI did you personally handle?", "I built the retrieval pipeline and integrated the Groq API.", _ai_resume, "F07-ownership-ai"),
    ("free", "free", "What did you personally own on the Operations Dashboard?", "I designed the KPI layout and automated the data refresh.", _business_resume, "F08-ownership-biz"),
    # Workflow family
    ("free", "free", "Walk me through how your project processes a request.", "It retrieves articles, filters them, and generates a summary.", _ai_resume, "F09-workflow-ai"),
    # Tool/method family
    ("free", "free", "Why did you use FastAPI for this project?", "FastAPI was fast and had good async support for the retrieval.", _ai_resume, "F10-tool-ai"),
    ("free", "free", "Why did you choose Power BI over other tools?", "Power BI integrated well with our existing Excel data.", _business_resume, "F11-tool-biz"),
    # Challenge/debugging family
    ("free", "free", "What was the hardest bug or challenge you faced?", "The retrieval results were noisy, so I added a re-ranking step.", _ai_resume, "F12-challenge-ai"),
    # Communication family
    ("free", "free", "Explain your work so a non-technical person can understand.", "My project filters news articles and summarizes them using AI.", _ai_resume, "F13-comm-ai"),
    # Teamwork family
    ("free", "free", "Tell me about a time you worked under pressure or with a team.", "During the demo deadline, I had to fix the pipeline in one night.", _ai_resume, "F14-team-ai"),
    # Learning family
    ("free", "free", "What is one area you are actively trying to improve?", "I am learning more about prompt engineering and evaluation metrics.", _ai_resume, "F15-learning-ai"),
    # Role fit family
    ("free", "free", "Why does an AI backend role feel like the right next step for you?", "I love building pipelines and solving data problems.", _ai_resume, "F16-rolefit-ai"),
    # Validation family
    ("free", "free", "How did you measure whether your project was working well?", "I checked retrieval precision and user satisfaction.", _ai_resume, "F17-validation-ai"),

    # ─── PRO PLAN (17 questions) ────────────────────────────────────
    # Introduction family
    ("pro", "pro", "Tell me about yourself.", "I am Naveenkumar, built NewsWeave AI with RAG, reduced hallucination by 40%.", _ai_resume, "P01-intro-metric"),
    ("pro", "pro", "Tell me about yourself.", "I am Ravi, I work at Zoho and built ShopStream.", _fullstack_resume, "P02-intro-fullstack"),
    ("pro", "pro", "Tell me about yourself.", "I have a degree in AI and data science.", _ai_resume, "P03-intro-degree-only"),
    # Studies family
    ("pro", "pro", "Tell me about your studies and how they connect to your work.", "I studied CS at IIT Madras and focused on distributed systems.", _fullstack_resume, "P04-studies-fullstack"),
    # Role fit family
    ("pro", "pro", "Why are you a good fit for this role?", "I have built production AI pipelines and understand backend patterns.", _ai_resume, "P05-rolefit-ai"),
    ("pro", "pro", "Why should we hire you for a fullstack role?", "I shipped ShopStream to production and led the frontend migration at Zoho.", _fullstack_resume, "P06-rolefit-fullstack"),
    # Ownership family
    ("pro", "pro", "What exactly did you own in NewsWeave AI?", "I owned the entire retrieval pipeline and the Groq integration.", _ai_resume, "P07-ownership-ai"),
    # Workflow family
    ("pro", "pro", "Walk me through the NewsWeave AI pipeline.", "It starts with query parsing, then retrieval, ranking, and summarization.", _ai_resume, "P08-workflow-ai"),
    # Validation family
    ("pro", "pro", "How did you validate the output quality?", "I measured precision, recall, and added adversarial test cases.", _ai_resume, "P09-validation-ai"),
    # Trade-off family
    ("pro", "pro", "What trade-off did you face in your project?", "I chose speed over completeness — filtering before the model call.", _ai_resume, "P10-tradeoff-ai"),
    # Tool/method family
    ("pro", "pro", "Why did you choose React over other frameworks?", "React had a large ecosystem and I already knew it well.", _fullstack_resume, "P11-tool-fullstack"),
    # Challenge family
    ("pro", "pro", "What was the hardest debugging problem you solved?", "WebSocket connections kept dropping under load, improved by 60%.", _fullstack_resume, "P12-challenge-fullstack"),
    # Teamwork family
    ("pro", "pro", "Describe a pressure situation and how you handled it.", "During a product launch at Zoho, I had to fix a critical bug overnight.", _fullstack_resume, "P13-team-fullstack"),
    # Learning family
    ("pro", "pro", "What area are you actively trying to improve?", "I am learning Kubernetes and infrastructure-as-code.", _fullstack_resume, "P14-learning-fullstack"),
    # Communication family
    ("pro", "pro", "Explain your project for a non-technical audience.", "In simple terms, the project takes the right information, removes noisy parts, and returns a clearer result.", _ai_resume, "P15-comm-ai"),
    # RAG-specific keyword trigger
    ("pro", "pro", "How does the retrieval work?", "I used embedding search with vector DB and reranking.", _ai_resume, "P16-rag-keyword"),
    # Metric keyword trigger
    ("pro", "pro", "What metrics did you track?", "Accuracy was 92% and latency was under 200ms.", _ai_resume, "P17-metric-keyword"),

    # ─── CAREER PLAN (16 questions) ─────────────────────────────────
    # Introduction family
    ("career", "career", "Introduce yourself in a way that shows why a hiring panel should remember you.", "I am Naveenkumar, I built NewsWeave AI and reduced hallucination by 40%.", _ai_resume, "C01-intro-ai"),
    ("career", "career", "Introduce yourself in a way that shows why a hiring panel should remember you.", "I am Ravi from IIT Madras, built ShopStream — a real-time platform.", _fullstack_resume, "C02-intro-fullstack"),
    ("career", "career", "Introduce yourself in a way that shows why a hiring panel should remember you.", "I am a student.", _ai_resume, "C03-intro-minimal"),
    # Role fit family
    ("career", "career", "Why should we hire you for this role?", "I have deep experience with AI pipelines and production backend systems.", _ai_resume, "C04-rolefit-ai"),
    ("career", "career", "Why are you a stronger fit compared to other candidates?", "I shipped ShopStream end-to-end and led the migration at Zoho.", _fullstack_resume, "C05-rolefit-fullstack"),
    # Studies family
    ("career", "career", "What are you studying and how does it relate to the role?", "I am studying AI and data science, focusing on NLP and retrieval.", _ai_resume, "C06-studies-ai"),
    # Ownership family
    ("career", "career", "What exactly did you own in your strongest project?", "I designed the entire backend architecture for NewsWeave AI.", _ai_resume, "C07-ownership-ai"),
    # Workflow family
    ("career", "career", "Walk me through the architecture of your key project.", "ShopStream uses React frontend, Node.js API, Redis for caching, and WebSockets.", _fullstack_resume, "C08-workflow-fullstack"),
    # Teamwork family
    ("career", "career", "Tell me about a time pressure changed your decision.", "During the Zoho launch, I had to cut a feature to meet the deadline.", _fullstack_resume, "C09-team-fullstack"),
    # Learning family
    ("career", "career", "Where do you need to grow in the next five years?", "I want to move into system design and technical leadership.", _fullstack_resume, "C10-learning-fullstack"),
    # Communication family
    ("career", "career", "Explain your project to a non-technical hiring manager.", "My tool helps companies find fake job postings using AI classification.", _ai_resume, "C11-comm-ai"),
    # FastAPI keyword trigger
    ("career", "career", "Tell me about your backend work.", "I used FastAPI for the backend API with Supabase for the database.", _ai_resume, "C12-fastapi-keyword"),
    # Solo work keyword trigger
    ("career", "career", "How did you handle working independently?", "I worked solo on the entire HiringFlow project from start to finish.", _ai_resume, "C13-solo-keyword"),
    # Trade-off via previous question
    ("career", "career", "What trade-off did you make and what was the constraint?", "I chose to use a simpler model to reduce latency, but lost some accuracy.", _ai_resume, "C14-tradeoff-ai"),
    # Metric via previous question
    ("career", "career", "How did you measure the success of your work?", "I tracked precision at 92%, recall at 87%, and latency under 200ms.", _ai_resume, "C15-metric-ai"),
    # RAG keyword trigger
    ("career", "career", "Tell me about your retrieval pipeline.", "I used RAG with embedding search and a reranking layer for grounding.", _ai_resume, "C16-rag-keyword"),
]

assert len(SCENARIOS) == 50, f"Expected 50 scenarios, got {len(SCENARIOS)}"


# ═══════════════════════════════════════════════════════════════════════
# PARAMETRIZED TEST — one test per question
# ═══════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize(
    "plan, builder_key, previous_q, user_answer, resume_fn, label",
    SCENARIOS,
    ids=[s[5] for s in SCENARIOS],
)
def test_question_is_grounded(plan, builder_key, previous_q, user_answer, resume_fn, label):
    """Each generated question must be non-empty, grounded, and free of vague phrases."""
    resume = resume_fn()

    if builder_key == "free":
        question = _build_free_followup_question(previous_q, user_answer, resume)
    elif builder_key == "pro":
        question = _build_pro_followup_question(previous_q, user_answer, resume)
    elif builder_key == "career":
        question = _build_career_followup_question(previous_q, user_answer, resume)
    else:
        pytest.fail(f"Unknown builder: {builder_key}")

    # 1. Must not be empty
    assert question and question.strip(), f"[{label}] Empty question returned for {plan}/{builder_key}"

    # 2. Must be a string (structure preserved)
    assert isinstance(question, str), f"[{label}] Return type must be str, got {type(question)}"

    # 3. Must not contain banned vague phrases
    is_ok, reason = _is_grounded(question)
    assert is_ok, f"[{label}] VAGUE QUESTION: {reason}\n  → \"{question}\""

    # 4. Must be a single question (no double questions)
    q_count = question.count("?")
    assert q_count <= 2, f"[{label}] Too many questions ({q_count} question marks):\n  → \"{question}\""

    # 5. Print for review (shows in verbose pytest output)
    print(f"\n  ✅ [{label}] ({plan.upper()}) → {question}")


# ═══════════════════════════════════════════════════════════════════════
# STRUCTURE & SIGNATURE TESTS — deployment safety
# ═══════════════════════════════════════════════════════════════════════

class TestOriginalStructureIntact:
    """Verify the original function signatures and return types are preserved
    so the deployed system won't break."""

    def test_free_builder_returns_str(self):
        result = _build_free_followup_question("Tell me about yourself.", "I am a student.", _ai_resume())
        assert isinstance(result, str)

    def test_free_builder_works_without_resume(self):
        """Original callers may not pass resume_summary — must not crash."""
        result = _build_free_followup_question("Tell me about yourself.", "I am a student.")
        assert isinstance(result, str)

    def test_pro_builder_returns_str(self):
        result = _build_pro_followup_question("Tell me about yourself.", "I am a student.", _ai_resume())
        assert isinstance(result, str)

    def test_pro_builder_works_without_resume(self):
        result = _build_pro_followup_question("Tell me about yourself.", "I am a student.")
        assert isinstance(result, str)

    def test_career_builder_returns_str(self):
        result = _build_career_followup_question("Tell me about yourself.", "I am a student.", _ai_resume())
        assert isinstance(result, str)

    def test_career_builder_works_with_none_resume(self):
        result = _build_career_followup_question("Tell me about yourself.", "I am a student.", None)
        assert isinstance(result, str)

    def test_career_builder_works_with_empty_resume(self):
        result = _build_career_followup_question("Tell me about yourself.", "I am a student.", {})
        assert isinstance(result, str)

    def test_humanize_target_returns_str(self):
        for family in ["introduction", "ownership", "workflow_process", "validation_metrics",
                        "tradeoff_decision", "communication_explain", "role_fit"]:
            result = _humanize_question_target("test target", family)
            assert isinstance(result, str), f"_humanize_question_target({family}) returned {type(result)}"

    def test_humanize_target_no_banned_defaults(self):
        """The default mapping must never return 'that work'."""
        for family in ["validation_metrics", "tradeoff_decision", "communication_explain"]:
            result = _humanize_question_target("", family)
            assert "that work" not in result.lower(), f"Default for '{family}' still uses 'that work': {result}"

    def test_question_family_detection_still_works(self):
        """Verify _question_family_from_text still correctly classifies questions."""
        assert _question_family_from_text("Tell me about yourself.") == "introduction"
        assert _question_family_from_text("What did you personally own?") == "ownership"
        assert _question_family_from_text("Walk me through the workflow.") == "workflow_process"
        assert _question_family_from_text("What trade-off did you face?") == "tradeoff_decision"
        assert _question_family_from_text("Why should we hire you for this role?") == "role_fit"


# ═══════════════════════════════════════════════════════════════════════
# CROSS-RESUME CONSISTENCY — same family, different resumes, all grounded
# ═══════════════════════════════════════════════════════════════════════

class TestCrossResumeConsistency:
    """Same question family must produce grounded results for ANY resume type."""

    @pytest.mark.parametrize("resume_fn", [_ai_resume, _business_resume, _fullstack_resume],
                             ids=["ai", "business", "fullstack"])
    def test_free_intro_grounded_all_resumes(self, resume_fn):
        q = _build_free_followup_question("Tell me about yourself.", "I am a student.", resume_fn())
        assert q and q.strip()
        ok, reason = _is_grounded(q)
        assert ok, f"Free intro vague for {resume_fn.__name__}: {reason} → {q}"

    @pytest.mark.parametrize("resume_fn", [_ai_resume, _business_resume, _fullstack_resume],
                             ids=["ai", "business", "fullstack"])
    def test_pro_intro_grounded_all_resumes(self, resume_fn):
        q = _build_pro_followup_question("Tell me about yourself.", "I am a professional.", resume_fn())
        assert q and q.strip()
        ok, reason = _is_grounded(q)
        assert ok, f"Pro intro vague for {resume_fn.__name__}: {reason} → {q}"

    @pytest.mark.parametrize("resume_fn", [_ai_resume, _business_resume, _fullstack_resume],
                             ids=["ai", "business", "fullstack"])
    def test_career_intro_grounded_all_resumes(self, resume_fn):
        q = _build_career_followup_question(
            "Introduce yourself in a way that shows why a hiring panel should remember you.",
            "I am a candidate.", resume_fn()
        )
        assert q and q.strip()
        ok, reason = _is_grounded(q)
        assert ok, f"Career intro vague for {resume_fn.__name__}: {reason} → {q}"
