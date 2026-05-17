"""
PrepVista AI - Transcript Normalization Service
Corrects common speech-to-text artifacts before evaluation.
"""

from __future__ import annotations

import json
import re


NORMALIZATION_RULES = {
    # AI/ML terms
    "llmp3": "LLaMA 3",
    "llama three": "LLaMA 3",
    "llama 3": "LLaMA 3",
    "group": "Groq",
    "grow q": "Groq",
    "grow queue": "Groq",
    "pie torch": "PyTorch",
    "pie touch": "PyTorch",
    "tensor flow": "TensorFlow",
    "tensor float": "TensorFlow",
    "open ai": "OpenAI",
    "open a i": "OpenAI",
    "chat gpt": "ChatGPT",
    "chatgpt": "ChatGPT",
    "gpt for": "GPT-4",
    "gpt for oh": "GPT-4o",
    "hugging face": "HuggingFace",
    "lang chain": "LangChain",
    "large language model": "LLM",

    # Databases
    "my sequel": "MySQL",
    "my sql": "MySQL",
    "post gress": "PostgreSQL",
    "post gres": "PostgreSQL",
    "post gray sql": "PostgreSQL",
    "mongo db": "MongoDB",
    "redis": "Redis",
    "red is": "Redis",
    "sequel lite": "SQLite",

    # DevOps / Infrastructure
    "cube brunettes": "Kubernetes",
    "kubernetes": "Kubernetes",
    "docker eyes": "Dockerize",
    "docker ice": "Dockerize",
    "see eye see dee": "CI/CD",
    "cicd": "CI/CD",
    "ci cd": "CI/CD",
    "aws": "AWS",
    "eight of us": "AWS",
    "a double u s": "AWS",
    "azure": "Azure",
    "as your": "Azure",
    "gcp": "GCP",

    # Languages & Frameworks
    "java script": "JavaScript",
    "type script": "TypeScript",
    "react js": "React.js",
    "react j s": "React.js",
    "next js": "Next.js",
    "next j s": "Next.js",
    "node js": "Node.js",
    "node j s": "Node.js",
    "fast api": "FastAPI",
    "fast a p i": "FastAPI",
    "fast apa": "FastAPI",
    "fast ape": "FastAPI",
    "fast 88": "FastAPI",
    "fast fb": "FastAPI",
    "post api": "FastAPI",
    "post ap": "FastAPI",
    "post a p": "FastAPI",
    "cost api": "FastAPI",
    "first month": "first month",
    "past 8": "FastAPI",
    "super base": "Supabase",
    "supa base": "Supabase",
    "supa bass": "Supabase",
    "prep vista": "PrepVista",
    "news weave ai": "NewsWeave AI",
    "news babe": "NewsWeave",
    "news weave": "NewsWeave",
    "signal brief": "SignalBrief",
    "single brief": "SignalBrief",
    "signal breathe": "SignalBrief",
    "single briefly": "SignalBrief",
    "handsome experience": "hands-on experience",
    "hands an experience": "hands-on experience",
    "trust search": "TrustSearch",
    "hiring flow": "HiringFlow",
    "hiring pro flow": "HiringFlow",
    "hiring or pro tool": "HiringFlow",
    "hiring or flow tool": "HiringFlow",
    "hiring proton": "HiringFlow",
    "hiring plutool": "HiringFlow",
    "data signs": "data science",
    "artificial intelligence and data signs": "artificial intelligence and data science",
    "flask": "Flask",
    "jango": "Django",
    "dee jango": "Django",
    "python": "Python",
    "pie thon": "Python",
    "llm based": "LLM-based",
    "elm based": "LLM-based",
    "real juice": "real use",
    "real users": "real users",

    # General tech
    "api": "API",
    "a p i": "API",
    "rest api": "REST API",
    "http": "HTTP",
    "html": "HTML",
    "css": "CSS",
    "json": "JSON",
    "jay son": "JSON",
    "sql": "SQL",
    "sequel": "SQL",
    "github": "GitHub",
    "git hub": "GitHub",
    "git": "Git",
}

AGGRESSIVE_INTENT_RULES = {
    "final hear": "final year",
    "first hear": "first year",
    "second hear": "second year",
    "third hear": "third year",
    "first api": "FastAPI",
    "fast apa": "FastAPI",
    "fast ape": "FastAPI",
    "post ap": "FastAPI",
    "post api": "FastAPI",
    "past 8": "FastAPI",
    "fast 88": "FastAPI",
    "cost api": "FastAPI",
    "backend roll": "backend role",
    "backend row": "backend role",
    "front end": "frontend",
    "back end": "backend",
    "a i": "AI",
    "m l": "ML",
    "news where a": "NewsWeave",
    "newspaper": "NewsWeave",
    "problem posting": "suspicious posting",
    "problem postings": "suspicious postings",
    "contexts filtering": "context filtering",
    "contacts filtering": "context filtering",
    "contact filtering": "context filtering",
    "prompting engineering": "prompt engineering",
    "evolution checks": "evaluation checks",
    "evolution matrix": "evaluation metrics",
    "validity": "validation",
    "validity by": "validated by",
    "marketing themble": "making them stable",
    "real well product": "real-world products",
    "alarm systems": "AI systems",
    "cost and easy to use": "clear and easy to use",
    "first ap": "FastAPI",
    "post ape": "FastAPI",
    "past ape": "FastAPI",
    "real will": "real-world",
}

PRO_TECH_INTENT_RULES = {
    "rack": "RAG",
    "ragg": "RAG",
    "rack workflow": "RAG workflow",
    "rack workline": "RAG workflow",
    "rag workline": "RAG workflow",
    "rack pipeline": "RAG pipeline",
    "vector db": "vector database",
    "vector d b": "vector database",
    "embedding model": "embedding model",
    "hallucination": "hallucination",
    "allucination": "hallucination",
    "advice serial testing": "adversarial testing",
    "adverse serial testing": "adversarial testing",
    "adversial testing": "adversarial testing",
    "stress cases": "stress cases",
    "prompt engineer": "prompt engineering",
    "prompt engineering": "prompt engineering",
    "source aware": "source-aware",
    "llama": "LLaMA",
    "lama": "LLaMA",
    "evaluation matrix": "evaluation metrics",
    "evolution checks": "evaluation checks",
    "evolution matrix": "evaluation metrics",
    "metric": "metrics",
    "bench mark": "benchmark",
    "context filtering": "context filtering",
    "contacts filtering": "context filtering",
    "contexts filtering": "context filtering",
    "retrieval context": "retrieval context",
    "a processing": "AI processing",
    "cost api": "FastAPI",
    "past 8": "FastAPI",
    "first a p h": "FastAPI",
    "positive its": "FastAPI",
    "structured a outputs": "structured outputs",
    "output quality": "output quality",
    "retrieval and evaluation": "retrieval and evaluation",
}

PRO_CONTEXT_TERMS = (
    "RAG",
    "RAG workflow",
    "RAG pipeline",
    "FastAPI",
    "Supabase",
    "Groq",
    "LLaMA",
    "hallucination",
    "adversarial testing",
    "prompt engineering",
    "vector database",
    "embeddings",
    "benchmark",
    "evaluation metrics",
    "latency",
    "NewsWeave",
)

CAREER_INTENT_RULES = {
    "news where a": "NewsWeave",
    "news ware": "NewsWeave",
    "newspaper": "NewsWeave",
    "news project": "news project",
    "first api": "FastAPI",
    "fast api": "FastAPI",
    "fast apa": "FastAPI",
    "backhand": "backend",
    "back end": "backend",
    "anal pic techniques": "NLP techniques",
    "n l p": "NLP",
    "uses": "users",
    "stay label": "stable",
    "false positive": "false positive",
    "false negative": "false negative",
    "trade off": "trade-off",
    "grounding": "grounding",
    "ranking quality": "ranking quality",
    "retrieve quality": "retrieval quality",
    "async io": "async I/O",
    "deployment flow": "deployment flow",
    "source aware": "source-aware",
    "recruiter friendly": "recruiter-friendly",
    "role fit": "role fit",
    "hiring panel": "hiring panel",
    "business impact": "business impact",
    "user impact": "user impact",
    "ownership signals": "ownership signals",
    "cost api": "FastAPI",
    "past 8": "FastAPI",
    "first a p h": "FastAPI",
    "why your best compare to others": "why you are a stronger fit than other candidates",
    "first decision if hired": "first priority if hired",
    "where you see yourself": "where you see yourself",
}

FIELD_SPECIFIC_RULES = {
    "electronics_embedded": {
        "micro controller": "microcontroller",
        "signal flower": "signal flow",
        "printed circuit board": "PCB",
        "firm wear": "firmware",
    },
    "electrical_core": {
        "power factor": "power factor",
        "control sister": "control systems",
        "distribution line": "distribution line",
    },
    "mechanical_core": {
        "solid works": "SolidWorks",
        "auto cad": "AutoCAD",
        "machineing": "machining",
        "thermo dynamics": "thermodynamics",
    },
    "civil_core": {
        "auto cad civil": "AutoCAD Civil",
        "estimate and billing": "estimation and billing",
        "site execution": "site execution",
    },
    "business_analyst_operations": {
        "power be i": "Power BI",
        "stake holder": "stakeholder",
        "process flow": "process flow",
        "root cause": "root cause",
    },
    "design_creative": {
        "you ex": "UX",
        "you eye": "UI",
        "wire frame": "wireframe",
        "user flow": "user flow",
    },
}

CAREER_CONTEXT_TERMS = (
    *PRO_CONTEXT_TERMS,
    "NLP",
    "NLP techniques",
    "retrieval quality",
    "ranking quality",
    "grounding",
    "false positive",
    "false negative",
    "trade-off",
    "ownership",
    "stakeholder",
    "placement",
    "backend",
    "users",
    "stable",
)

FILLER_PATTERN = re.compile(r"\b(uh+|um+|umm+|er+|ah+)\b", re.IGNORECASE)
SPACE_PATTERN = re.compile(r"\s+")
PUNCTUATION_SPACING_PATTERN = re.compile(r"\s+([,.!?])")
MISSING_SPACE_PATTERN = re.compile(r"([,.!?])(?=[^\s])")
COMMON_HESITATION_PATTERN = re.compile(r"\b(i mean|you know|like)\b", re.IGNORECASE)
REPEATED_WORD_PATTERN = re.compile(r"\b(\w+)(\s+\1\b)+", re.IGNORECASE)
STRETCHED_WORD_PATTERN = re.compile(r"\b([a-zA-Z])\1{2,}\b")
TRAILING_FRAGMENT_PATTERN = re.compile(r"\b(and|so|because|then)\s*$", re.IGNORECASE)
MULTISPACE_PATTERN = re.compile(r"\s+")


def _coerce_resume_summary_dict(resume_summary: str | dict | None) -> dict:
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


def _resume_field(resume_summary: str | dict | None) -> str:
    summary = _coerce_resume_summary_dict(resume_summary)
    return str(summary.get("broad_field") or "general_fresher_mixed").strip() or "general_fresher_mixed"


def _collect_resume_context_terms(resume_summary: str | dict | None) -> tuple[str, ...]:
    summary = _coerce_resume_summary_dict(resume_summary)
    context_terms: list[str] = []

    for skill in summary.get("skills", []) or []:
        if isinstance(skill, str) and skill.strip():
            context_terms.append(skill.strip())

    for education in summary.get("education", []) or []:
        if isinstance(education, str) and education.strip():
            context_terms.append(education.strip())

    for key in ("projects", "experience"):
        for item in summary.get(key, []) or []:
            if not isinstance(item, dict):
                continue
            for field in ("name", "title", "role"):
                value = str(item.get(field) or "").strip()
                if value:
                    context_terms.append(value)
            for field in ("description",):
                value = str(item.get(field) or "").strip()
                if value:
                    words = [word for word in value.split() if len(word) >= 4]
                    context_terms.extend(words[:8])
            tech_stack = item.get("tech_stack") or []
            if isinstance(tech_stack, list):
                for tech in tech_stack:
                    value = str(tech or "").strip()
                    if value:
                        context_terms.append(value)

    deduped: list[str] = []
    seen: set[str] = set()
    for term in context_terms:
        cleaned = MULTISPACE_PATTERN.sub(" ", term).strip()
        if len(cleaned) < 3:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(cleaned)
    return tuple(deduped[:28])


def _apply_replacements(text: str, replacements: dict[str, str]) -> str:
    normalized = text
    for pattern, replacement in sorted(replacements.items(), key=lambda item: len(item[0]), reverse=True):
        regex = re.compile(r"\b" + re.escape(pattern) + r"\b", re.IGNORECASE)
        normalized = regex.sub(replacement, normalized)
    return normalized


def _collapse_stretched_words(match: re.Match[str]) -> str:
    return match.group(1)


def normalize_transcript(raw_text: str, aggressive: bool = False) -> str:
    """
    Apply STT correction rules to raw transcript text.
    Preserves original casing where possible, only corrects known artifacts.
    """
    if not raw_text:
        return raw_text

    normalized = raw_text.replace("\n", " ").replace("\r", " ").strip()
    normalized = FILLER_PATTERN.sub(" ", normalized)
    normalized = COMMON_HESITATION_PATTERN.sub(" ", normalized)
    normalized = _apply_replacements(normalized, NORMALIZATION_RULES)

    if aggressive:
        normalized = _apply_replacements(normalized, AGGRESSIVE_INTENT_RULES)
        normalized = STRETCHED_WORD_PATTERN.sub(_collapse_stretched_words, normalized)

    normalized = re.sub(r"\bi\b", "I", normalized)
    normalized = REPEATED_WORD_PATTERN.sub(r"\1", normalized)
    normalized = PUNCTUATION_SPACING_PATTERN.sub(r"\1", normalized)
    normalized = MISSING_SPACE_PATTERN.sub(r"\1 ", normalized)
    normalized = SPACE_PATTERN.sub(" ", normalized)

    return normalized.strip(" ,")


def recover_spoken_meaning(raw_text: str) -> str:
    """
    Apply stronger transcript cleanup for beginner voice answers before free-plan scoring.
    This is intentionally more forgiving than normal transcript display cleanup.
    """
    if not raw_text:
        return raw_text

    recovered = normalize_transcript(raw_text, aggressive=True)
    recovered = TRAILING_FRAGMENT_PATTERN.sub("", recovered)
    recovered = SPACE_PATTERN.sub(" ", recovered).strip(" ,")
    return recovered


def _recover_contextual_intent(
    raw_text: str,
    question_text: str = "",
    resume_summary: str | dict | None = None,
    extra_rules: dict[str, str] | None = None,
    context_terms: tuple[str, ...] = (),
) -> str:
    if not raw_text:
        return raw_text

    recovered = normalize_transcript(raw_text, aggressive=True)
    if extra_rules:
        recovered = _apply_replacements(recovered, extra_rules)

    field_rules = FIELD_SPECIFIC_RULES.get(_resume_field(resume_summary), {})
    if field_rules:
        recovered = _apply_replacements(recovered, field_rules)

    contextual_terms = list(context_terms)
    contextual_terms.extend(_collect_resume_context_terms(resume_summary))
    if question_text:
        for term in context_terms:
            if term.lower() in question_text.lower():
                contextual_terms.append(term)

    if isinstance(resume_summary, str):
        resume_blob = resume_summary
    elif isinstance(resume_summary, dict):
        resume_blob = " ".join(str(value) for value in resume_summary.values())
    else:
        resume_blob = ""

    for term in contextual_terms:
        normalized_term = term.lower()
        if normalized_term in resume_blob.lower() or normalized_term in question_text.lower():
            fragments = normalized_term.replace("-", " ").split()
            if len(fragments) == 1:
                continue
            fuzzy_pattern = r"\b" + r"\s+".join(re.escape(fragment[:4]) + r"\w*" for fragment in fragments) + r"\b"
            recovered = re.sub(fuzzy_pattern, term, recovered, flags=re.IGNORECASE)

    recovered = TRAILING_FRAGMENT_PATTERN.sub("", recovered)
    recovered = SPACE_PATTERN.sub(" ", recovered).strip(" ,")
    return recovered


def summarize_recovered_intent(
    recovered_text: str,
    question_text: str = "",
    resume_summary: str | dict | None = None,
) -> str:
    """Return one conservative, cleaned sentence for report corrected-intent fields."""
    cleaned = normalize_transcript(recovered_text or "", aggressive=True)
    question_lower = (question_text or "").lower()
    combined_rules: dict[str, str] = {}
    if any(term in question_lower for term in ["tool", "method", "workflow", "architecture", "measure", "metric", "validate", "trade-off", "decision", "project", "ownership"]):
        combined_rules.update(PRO_TECH_INTENT_RULES)
    if any(term in question_lower for term in ["recruiter", "role", "hire", "impact", "remember you", "fit"]):
        combined_rules.update(CAREER_INTENT_RULES)
    combined_rules.update(FIELD_SPECIFIC_RULES.get(_resume_field(resume_summary), {}))
    cleaned = _recover_contextual_intent(
        cleaned,
        question_text=question_text,
        resume_summary=resume_summary,
        extra_rules=combined_rules,
        context_terms=_collect_resume_context_terms(resume_summary),
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,")
    if not cleaned:
        return ""

    summary = _coerce_resume_summary_dict(resume_summary)
    question_lower = (question_text or "").lower()
    cleaned_lower = cleaned.lower()
    candidate_name = str(summary.get("candidate_name") or summary.get("name") or "").strip()
    projects = [item for item in summary.get("projects", []) if isinstance(item, dict)]
    project_name = str((projects[0].get("name") if projects else "") or "").strip()

    if any(term in question_lower for term in ["tell me about yourself", "introduce yourself", "background and focus", "background, strongest", "briefly introduce"]):
        parts: list[str] = []
        if candidate_name:
            parts.append(candidate_name)
        else:
            parts.append("The candidate")
        if "final year" in cleaned_lower and "computer science" in cleaned_lower:
            parts.append("is a final-year Computer Science student")
        elif "computer science" in cleaned_lower:
            parts.append("has a Computer Science background")
        elif "engineering" in cleaned_lower:
            parts.append("has an engineering background")
        if "python" in cleaned_lower and "fastapi" in cleaned_lower:
            parts.append("works with Python and FastAPI")
        elif "python" in cleaned_lower:
            parts.append("works with Python")
        if "llm" in cleaned_lower or "ai systems" in cleaned_lower:
            parts.append("on LLM-based or AI systems")
        if "reliable" in cleaned_lower or "accurate" in cleaned_lower or "consistent" in cleaned_lower:
            parts.append("with a focus on reliable output")
        sentence = " ".join(parts).strip()
        if sentence:
            cleaned = sentence
    elif any(term in question_lower for term in ["what are you currently studying", "what are you studying now", "currently studying", "currently learning"]):
        parts = []
        if "final year" in cleaned_lower and "computer science" in cleaned_lower:
            parts.append("The candidate is in the final year of Computer Science")
        elif "computer science" in cleaned_lower:
            parts.append("The candidate is studying Computer Science")
        if "retrieval" in cleaned_lower and "evaluation" in cleaned_lower:
            parts.append("and is focusing on retrieval and evaluation")
        elif "retrieval" in cleaned_lower:
            parts.append("and is focusing on retrieval")
        elif "reliable answers" in cleaned_lower or "reliable output" in cleaned_lower or "accuracy" in cleaned_lower:
            parts.append("and is focusing on improving reliable answers")
        sentence = " ".join(parts).strip()
        if sentence:
            cleaned = sentence
    elif any(term in question_lower for term in ["why should we hire", "fit the role", "best proves you fit", "stronger fit", "stand out", "remember you", "why this role", "right next step", "first 30 days", "first month", "if we hired you"]):
        parts = []
        if "reliability" in cleaned_lower or "reliable systems" in cleaned_lower:
            parts.append("The candidate presents building reliable systems as a core strength")
        elif "practical" in cleaned_lower:
            parts.append("The candidate positions practical execution as a key strength")
        if any(term in question_lower for term in ["why this role", "right next step"]) and any(term in cleaned_lower for term in ["backend", "engineer", "role", "work on", "target"]):
            parts.append("and connects that to the role they want next")
        if any(term in question_lower for term in ["first 30 days", "first month", "if we hired you"]) and any(term in cleaned_lower for term in ["first", "priority", "focus", "understand", "improve", "learn"]):
            parts.append("and outlines what they would focus on early in the role")
        if project_name and project_name.lower() in cleaned_lower:
            parts.append(f"backed by work in {project_name}")
        elif "context filtering" in cleaned_lower:
            parts.append("backed by a context-filtering decision in project work")
        if parts:
            cleaned = " ".join(parts)
    elif any(term in question_lower for term in ["what did you personally own", "what exactly did you own", "what part was mainly yours"]):
        if "context filtering" in cleaned_lower and any(term in cleaned_lower for term in ["faster", "accurate", "consistent", "reliable"]):
            cleaned = "The candidate says they owned the workflow and decided to add context filtering, which improved speed, accuracy, and consistency."
    elif any(term in question_lower for term in ["measure", "metric", "validate", "what evidence", "what did you compare", "how did you know"]):
        if any(term in cleaned_lower for term in ["before and after", "compared", "compare"]) and any(term in cleaned_lower for term in ["relevance", "consistency", "noise", "accuracy"]):
            cleaned = "The candidate says they compared outputs before and after the change and checked relevance, consistency, noise, or accuracy to validate improvement."
    elif any(term in question_lower for term in ["trade-off", "tradeoff", "what choice", "final choice", "decision"]):
        if "context" in cleaned_lower and any(term in cleaned_lower for term in ["speed", "faster", "clarity", "cleaner", "accuracy"]):
            cleaned = "The candidate says the trade-off was between more context and faster, cleaner output, and they chose context filtering."
    elif any(term in question_lower for term in ["deadline", "pressure", "team", "feedback"]):
        if any(term in cleaned_lower for term in ["deadline", "demo", "feedback", "team"]) and any(term in cleaned_lower for term in ["reliability", "stability", "features"]):
            cleaned = "The candidate describes a deadline or feedback situation where they prioritized reliability over adding more features."
    elif any(term in question_lower for term in ["weakness", "growth area", "improving", "where do you see yourself"]):
        if any(term in cleaned_lower for term in ["measure", "evaluation", "metric", "testing"]) and any(term in cleaned_lower for term in ["improving", "working on", "learning"]):
            cleaned = "The candidate says they are improving how they measure and test output quality so results become more reliable."

    words = cleaned.split()
    if len(words) > 34:
        cleaned = " ".join(words[:34]).rstrip(" ,") + "..."
    if cleaned and cleaned[-1:] not in ".!?":
        cleaned += "."
    return cleaned


def recover_technical_intent(raw_text: str, question_text: str = "", resume_summary: str | dict | None = None) -> str:
    """
    Recover likely technical meaning from imperfect spoken answers for the Pro plan.
    This is stricter than free-plan recovery but still tolerant of STT noise.
    """
    return _recover_contextual_intent(
        raw_text,
        question_text=question_text,
        resume_summary=resume_summary,
        extra_rules=PRO_TECH_INTENT_RULES,
        context_terms=PRO_CONTEXT_TERMS,
    )


def recover_career_intent(raw_text: str, question_text: str = "", resume_summary: str | dict | None = None) -> str:
    """
    Recover likely intent from longer, noisier spoken answers for the Career plan.
    This is the most forgiving transcript recovery path.
    """
    combined_rules = {**PRO_TECH_INTENT_RULES, **CAREER_INTENT_RULES}
    return _recover_contextual_intent(
        raw_text,
        question_text=question_text,
        resume_summary=resume_summary,
        extra_rules=combined_rules,
        context_terms=CAREER_CONTEXT_TERMS,
    )


def clean_for_display(text: str) -> str:
    """Clean text for display in transcript/report (remove system markers)."""
    markers = [
        "[NO_ANSWER_TIMEOUT]",
        "[SYSTEM_DURATION_EXPIRED]",
        "[USER_REQUESTED_END]",
    ]
    result = text
    for marker in markers:
        result = result.replace(marker, "")
    return result.strip()
