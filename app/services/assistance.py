"""
PrepVista AI — Guided Interview Assistance Engine
=================================================
Generates contextual hints and grounded professional answer guidance
for the current interview question. All content is bound to the exact
active turn and uses only verified candidate facts.

Design principles:
- NEVER invent candidate facts (metrics, achievements, company names)
- Use placeholders when facts are missing
- Separate answer quality from independence
- Concise output: 30-90 seconds spoken length
"""

from typing import TypedDict, Any
import structlog
import json

from app.config import get_settings
from app.services.llm import call_llm_json
from app.services.assistance_families import classify_question_family

logger = structlog.get_logger('prepvista.assistance')


def valid_content(result):
    if not isinstance(result, dict) or not isinstance(result.get("content"), str) or not result["content"].strip() or len(result["content"]) > 8000:
        raise ValueError("Assistance generation unavailable")
    return result["content"].strip()

class HintResult(TypedDict):
    content: str
    question_family: str
    level: int
    model_provider: str
    model_version: str
    safety_passed: bool

class AnswerGuidanceResult(TypedDict):
    content: str
    question_family: str
    grounding_used: list[str]
    missing_facts: list[str]
    placeholders_used: list[str]
    confidence: str  # 'full', 'partial', 'insufficient'
    model_provider: str
    model_version: str
    safety_passed: bool
    why_it_works: list[str]

async def generate_hint(
    question_text: str, 
    question_family: str | None, 
    level: int, 
    resume_context: str, 
    role_context: str, 
    prior_answer: str | None = None
) -> HintResult:
    """Generates a level 1 or level 2 hint for the user."""
    
    family = question_family or classify_question_family(question_text)
    
    if level == 1:
        instruction = (
            "Provide a high-impact structural formula (using arrows '→') specific to this exact question format, followed by 1 short sentence explaining what the interviewer is testing.\n"
            "Example for Introductions: 'Who I am → What I know → What I built → What I can do → What I want to become'\n"
            "Example for Behavioral: 'Situation → My Specific Action → The Technical Challenge → The Result'\n"
            "Example for Technical: 'Core Concept → How it works → Trade-offs → Real-world Use Case'"
        )
    else:
        instruction = "Provide a bulleted list of 3-4 building blocks or key elements the candidate should include in their answer."
        
    prompt = (
        f"You are an expert interview coach. Provide a helpful hint for the candidate.\n\n"
        f"Question: {question_text}\n"
        f"Role: {role_context}\n"
        f"Instruction: {instruction}\n\n"
        f"Respond in JSON format: {{\"content\": \"your hint text\"}}"
    )
    
    settings = get_settings()
    provider = "groq" if settings.GROQ_API_KEY else "openai"
    model = settings.GROQ_MODEL if provider == "groq" else settings.OPENAI_MODEL
    
    try:
        result = await call_llm_json(
            [{"role": "system", "content": prompt}],
            temperature=0.3,
            max_tokens=150,
            retries=1,
            timeout=5.0,
            use_live_key=True,
        )
        content = valid_content(result)
            
        return {
            "content": content,
            "question_family": family,
            "level": level,
            "model_provider": provider,
            "model_version": model,
            "safety_passed": True
        }
    except Exception as exc:
        logger.warning("generate_hint_llm_failed", exception_type=type(exc).__name__)
        raise ValueError("Assistance generation unavailable") from None

async def generate_answer_guidance(
    question_text: str, 
    question_family: str | None, 
    resume_context: str, 
    role_context: str, 
    candidate_known_facts: dict[str, Any], 
    prior_answer: str | None = None
) -> AnswerGuidanceResult:
    """Generates professional answer guidance based strictly on provided facts."""
    
    family = question_family or classify_question_family(question_text)
    
    prompt = (
        "You are an expert interview coach. Draft an answer guidance for the candidate. "
        "CRITICAL RULES:\n"
        "1. Use ONLY the provided candidate_known_facts and resume_context. If facts are missing, DO NOT output a generic 'Since I couldn't access...' message. Instead, output a strong, direct fill-in-the-blank template for the student to use.\n"
        "2. NEVER invent candidate facts. Use bracketed placeholders like [Your Name] or [Specific Tool] when facts are missing.\n"
        "3. Output should be a direct, professional example tailored to the student (3-6 sentences).\n"
        "4. EVERY answer guidance MUST be formatted as a highly-structured, direct fill-in-the-blank script for the specific question type. Do not just give generic advice.\n"
        "   Example for Intro: 'Hello, I am [Name], a [Year] student in [Major]. My strongest area is building [Field] applications using [Skills]...'\n"
        "   Example for Behavioral: 'In my academic project [Project Name], we needed to solve [Problem]. I took the lead on [Action] by utilizing [Tool/Tech]. As a result, we achieved [Metric/Outcome].'\n"
        "   (Fill in as many details as possible from the resume context, keep the rest as [Placeholders]).\n"
        "5. Include a list of 'why_it_works' giving reasons why this structure is effective.\n\n"
        f"Question: {question_text}\n"
        f"Role Context: {role_context}\n"
        f"Resume Context: {resume_context}\n"
        f"Known Facts: {json.dumps(candidate_known_facts)}\n\n"
        "Determine confidence: 'full' if enough facts were available, 'partial' if some placeholders were used, "
        "'insufficient' if mostly placeholders were used.\n\n"
        "Respond in JSON format: {{\n"
        "  \"content\": \"the drafted answer or template\",\n"
        "  \"grounding_used\": [\"fact1\", \"fact2\"],\n"
        "  \"missing_facts\": [\"missing info needed\"],\n"
        "  \"placeholders_used\": [\"[Metric]\"],\n"
        "  \"confidence\": \"full/partial/insufficient\",\n"
        "  \"why_it_works\": [\"reason 1\"]\n"
        "}}"
    )
    
    settings = get_settings()
    provider = "groq" if settings.GROQ_API_KEY else "openai"
    model = settings.GROQ_MODEL if provider == "groq" else settings.OPENAI_MODEL
    
    try:
        result = await call_llm_json(
            [{"role": "system", "content": prompt}],
            temperature=0.2,
            max_tokens=400,
            retries=1,
            timeout=8.0,
            use_live_key=True,
        )
        
        content = valid_content(result)
        for key in ("grounding_used", "missing_facts", "placeholders_used", "why_it_works"):
            if not isinstance(result.get(key), list) or any(not isinstance(value, str) or not value.strip() for value in result[key]):
                raise ValueError("Incomplete assistance response")
        if not result["why_it_works"] or result.get("confidence") not in {"full", "partial", "insufficient"}:
            raise ValueError("Incomplete assistance response")
        return {
            **result, "content": content, "question_family": family,
            "model_provider": provider, "model_version": model, "safety_passed": True,
        }
    except Exception as exc:
        logger.warning("generate_answer_guidance_failed", exception_type=type(exc).__name__)
        raise ValueError("Assistance generation unavailable") from None
