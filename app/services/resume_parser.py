"""
PrepVista AI — Resume Parser Service
PDF extraction, sanitization, and structured parsing via LLM.
"""

import io
import re
import structlog
from pypdf import PdfReader
from fastapi import HTTPException

from app.config import get_settings
from app.services.llm import call_llm_json
from app.services.prompts import build_resume_extraction_prompt

logger = structlog.get_logger("prepvista.resume")

FIELD_BUCKETS = (
    "software_backend_frontend",
    "ai_ml_data",
    "electronics_embedded",
    "electrical_core",
    "mechanical_core",
    "civil_core",
    "business_analyst_operations",
    "design_creative",
    "general_fresher_mixed",
    "non_technical_general",
)

FIELD_KEYWORDS = {
    "ai_ml_data": {
        "ai", "artificial intelligence", "machine learning", "ml", "nlp", "rag", "llm",
        "prompt", "embedding", "retrieval", "ranking", "evaluation", "grounding",
        "hallucination", "classification", "data science", "computer vision",
    },
    "software_backend_frontend": {
        "python", "java", "c++", "javascript", "typescript", "react", "next.js",
        "nextjs", "node", "fastapi", "django", "flask", "spring", "backend",
        "frontend", "api", "database", "sql", "postgresql", "mysql", "mongodb",
        "full stack", "fullstack", "web", "software engineer", "developer",
    },
    "electronics_embedded": {
        "embedded", "microcontroller", "arduino", "raspberry pi", "raspberry",
        "pcb", "firmware", "sensor", "uart", "spi", "i2c", "signal processing",
        "communication systems", "vlsi", "fpga", "verilog", "electronics",
    },
    "electrical_core": {
        "electrical", "power systems", "power electronics", "machines",
        "renewable energy", "control systems", "circuits", "distribution",
        "generation", "transformer", "motor", "grid",
    },
    "mechanical_core": {
        "mechanical", "cad", "solidworks", "autocad", "manufacturing",
        "thermodynamics", "production", "machine design", "automotive",
        "ansys", "cnc", "robotics", "maintenance",
    },
    "civil_core": {
        "civil", "construction", "structural", "site", "autocad civil",
        "surveying", "estimation", "quantity", "bim", "revit", "concrete",
        "transportation engineering",
    },
    "business_analyst_operations": {
        "business analyst", "operations", "process improvement", "excel", "power bi",
        "tableau", "dashboard", "stakeholder", "reporting", "analysis", "analytics",
        "operations analyst", "consulting", "kpi", "process", "finance", "sales ops",
    },
    "design_creative": {
        "design", "ui", "ux", "figma", "prototype", "wireframe", "branding",
        "illustration", "graphic design", "visual design", "product design",
        "user research", "interaction design", "creative",
    },
    "non_technical_general": {
        "marketing", "content", "hr", "human resources", "recruitment", "customer support",
        "teaching", "education", "administration", "operations executive", "communication",
        "public speaking", "sales", "management", "coordination",
    },
}

ROLE_LABELS = {
    "ai_ml_data": "AI or ML roles",
    "software_backend_frontend": "software engineering roles",
    "electronics_embedded": "embedded or electronics roles",
    "electrical_core": "electrical engineering roles",
    "mechanical_core": "mechanical engineering roles",
    "civil_core": "civil engineering roles",
    "business_analyst_operations": "business analyst or operations roles",
    "design_creative": "design roles",
    "general_fresher_mixed": "entry-level roles aligned with your strongest projects",
    "non_technical_general": "entry-level non-technical or business-facing roles",
}

# ── Prompt injection patterns to strip ───────────────
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"you\s+are\s+now",
    r"system\s*:",
    r"pretend\s+you",
    r"disregard\s+(all\s+)?prior",
    r"new\s+instructions",
    r"forget\s+(everything|all)",
    r"override\s+(your|all)",
]


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract raw text from PDF bytes with pypdf primary, pdfplumber fallback."""
    settings = get_settings()

    # Primary: pypdf (fast, handles most PDFs)
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text.strip())
        raw_text = "\n".join(p for p in pages if p).strip()
        if raw_text and len(raw_text) > 50:
            return raw_text[:settings.MAX_RESUME_TEXT_LENGTH]
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("pypdf_extraction_failed_trying_pdfplumber", error=str(e))

    # Fallback: pdfplumber (handles multi-column, tables, complex layouts)
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = []
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages.append(text.strip())
            raw_text = "\n".join(p for p in pages if p).strip()
            if raw_text:
                return raw_text[:settings.MAX_RESUME_TEXT_LENGTH]
    except Exception as e:
        logger.error("pdfplumber_extraction_also_failed", error=str(e))

    raise HTTPException(
        status_code=400,
        detail="Could not extract text from the resume PDF. Please ensure it's not an image-only scan.",
    )


def sanitize_resume_text(text: str) -> str:
    """Strip potential prompt injection patterns from resume text."""
    sanitized = text
    for pattern in INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[filtered]", sanitized, flags=re.IGNORECASE)
    return sanitized


def validate_pdf_upload(file_bytes: bytes, filename: str):
    """Validate the uploaded PDF file."""
    settings = get_settings()

    if len(file_bytes) > settings.MAX_RESUME_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {settings.MAX_RESUME_SIZE_BYTES // (1024*1024)}MB.")

    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid file type. Must be a valid PDF.")

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid file extension. Must be a .pdf file.")


async def parse_resume_structured(resume_text: str) -> dict:
    """Extract structured resume data using LLM."""
    try:
        prompt = build_resume_extraction_prompt(resume_text)
        result = await call_llm_json(
            [{"role": "system", "content": prompt}],
            temperature=0.1,
        )
        # Validate minimum structure
        if not isinstance(result, dict):
            return _default_resume_summary(resume_text)
        return enrich_resume_summary(result, resume_text=resume_text)
    except Exception as e:
        logger.warning("resume_extraction_failed", error=str(e))
        return _default_resume_summary(resume_text)


def _collect_resume_signal_parts(summary: dict) -> tuple[str, list[str]]:
    """Flatten structured resume sections for deterministic field inference."""
    pieces: list[str] = []
    signal_sources: list[str] = []

    inferred_role = str(summary.get("inferred_role") or "").strip()
    if inferred_role:
        pieces.append(inferred_role)
        signal_sources.append("inferred_role")

    for key in ("skills", "education"):
        values = summary.get(key) or []
        if isinstance(values, list):
            cleaned_values = [str(value).strip() for value in values if str(value).strip()]
            if cleaned_values:
                pieces.extend(cleaned_values)
                signal_sources.append(key)

    for key in ("projects", "experience"):
        values = summary.get(key) or []
        if not isinstance(values, list):
            continue
        for item in values:
            if not isinstance(item, dict):
                continue
            for field in ("name", "title", "role", "description"):
                value = str(item.get(field) or "").strip()
                if value:
                    pieces.append(value)
                    signal_sources.append(key)
            tech_stack = item.get("tech_stack") or []
            if isinstance(tech_stack, list):
                cleaned_stack = [str(value).strip() for value in tech_stack if str(value).strip()]
                if cleaned_stack:
                    pieces.extend(cleaned_stack)
                    signal_sources.append(key)

    return " ".join(pieces).lower(), list(dict.fromkeys(signal_sources))


def infer_resume_field_profile(summary: dict | None) -> dict:
    """Infer a broad resume field and lightweight confidence using deterministic signals."""
    summary = summary if isinstance(summary, dict) else {}
    resume_blob, signal_sources = _collect_resume_signal_parts(summary)
    if not resume_blob:
        return {
            "broad_field": "general_fresher_mixed",
            "field_confidence": 0.2,
            "target_role_label": ROLE_LABELS["general_fresher_mixed"],
            "strong_signal_sources": signal_sources,
        }

    scores = {bucket: 0 for bucket in FIELD_BUCKETS}
    for bucket, keywords in FIELD_KEYWORDS.items():
        for keyword in keywords:
            if keyword in resume_blob:
                scores[bucket] += 1

    education_text = " ".join(str(item).lower() for item in (summary.get("education") or []) if isinstance(item, str))
    if "computer science" in education_text or "information technology" in education_text:
        scores["software_backend_frontend"] += 1
    if "artificial intelligence" in education_text or "data science" in education_text:
        scores["ai_ml_data"] += 1
    if "electronics" in education_text or "embedded" in education_text:
        scores["electronics_embedded"] += 1
    if "electrical" in education_text:
        scores["electrical_core"] += 1
    if "mechanical" in education_text:
        scores["mechanical_core"] += 1
    if "civil" in education_text:
        scores["civil_core"] += 1
    if any(term in education_text for term in ["business", "commerce", "management", "operations"]):
        scores["business_analyst_operations"] += 1
    if any(term in education_text for term in ["design", "visual communication", "fine arts"]):
        scores["design_creative"] += 1

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_bucket, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0

    if top_score <= 1:
        top_bucket = "general_fresher_mixed"
    elif top_score <= 2 and second_score > 0 and (top_score - second_score) <= 1:
        top_bucket = "general_fresher_mixed"

    confidence = round(min(1.0, max(0.2, top_score / max(top_score + second_score, 2))), 2)
    return {
        "broad_field": top_bucket,
        "field_confidence": confidence,
        "target_role_label": ROLE_LABELS.get(top_bucket, ROLE_LABELS["general_fresher_mixed"]),
        "strong_signal_sources": signal_sources[:4],
    }


def enrich_resume_summary(summary: dict | None, resume_text: str = "") -> dict:
    """Preserve current structure while adding deterministic field signals."""
    base = dict(summary or {})
    candidate_name = str(base.get("candidate_name") or "").strip()
    if not candidate_name:
        first_line = resume_text.splitlines()[0].strip() if resume_text.splitlines() else "Unknown"
        base["candidate_name"] = first_line[:80]

    base.setdefault("education", [])
    base.setdefault("skills", [])
    base.setdefault("projects", [])
    base.setdefault("experience", [])
    base.setdefault("inferred_role", "other")

    field_profile = infer_resume_field_profile(base)
    for key, value in field_profile.items():
        base[key] = value

    return base


def _default_resume_summary(resume_text: str) -> dict:
    """Fallback resume summary when LLM extraction fails."""
    first_line = resume_text.splitlines()[0].strip() if resume_text.splitlines() else "Unknown"
    return enrich_resume_summary({
        "candidate_name": first_line[:80],
        "education": [],
        "skills": [],
        "projects": [],
        "experience": [],
        "inferred_role": "other",
    }, resume_text=resume_text)
