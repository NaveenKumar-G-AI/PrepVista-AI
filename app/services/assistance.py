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
from app.services.assistance_families import classify_question_family, get_fallback_hint

logger = structlog.get_logger('prepvista.assistance')

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
        instruction = "Explain what the interviewer is really testing or looking for with this question in 1-2 short sentences."
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
        content = result.get("content", "")
        if not content:
            raise ValueError("Empty LLM response")
            
        return {
            "content": content,
            "question_family": family,
            "level": level,
            "model_provider": provider,
            "model_version": model,
            "safety_passed": True
        }
    except Exception as exc:
        logger.warning("generate_hint_llm_failed", error=str(exc), question=question_text[:50])
        fallback = get_fallback_hint(family, level)
        return {
            "content": fallback,
            "question_family": family,
            "level": level,
            "model_provider": "fallback",
            "model_version": "static",
            "safety_passed": True
        }

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
        "1. Use ONLY the provided candidate_known_facts and resume_context.\n"
        "2. NEVER invent candidate facts (metrics, achievements, company names, project names).\n"
        "3. Use placeholders like [Insert Metric] or [Specific Tool] when facts are missing.\n"
        "4. Output should be concise: 30-90 seconds spoken length (around 3-6 sentences).\n"
        "5. Include a list of 'why_it_works' giving reasons why this structure is effective.\n\n"
        f"Question: {question_text}\n"
        f"Role Context: {role_context}\n"
        f"Resume Context: {resume_context}\n"
        f"Known Facts: {json.dumps(candidate_known_facts)}\n\n"
        "Determine confidence: 'full' if enough facts were available, 'partial' if some placeholders were used, "
        "'insufficient' if mostly placeholders were used.\n\n"
        "Respond in JSON format: {{\n"
        "  \"content\": \"the drafted answer\",\n"
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
            timeout=6.0,
            use_live_key=True,
        )
        
        return {
            "content": result.get("content", "I am unable to generate a grounded answer at this time."),
            "question_family": family,
            "grounding_used": result.get("grounding_used", []),
            "missing_facts": result.get("missing_facts", []),
            "placeholders_used": result.get("placeholders_used", []),
            "confidence": result.get("confidence", "insufficient"),
            "model_provider": provider,
            "model_version": model,
            "safety_passed": True,
            "why_it_works": result.get("why_it_works", [])
        }
    except Exception as exc:
        logger.warning("generate_answer_guidance_failed", error=str(exc), question=question_text[:50])
        return {
            "content": "Focus on your actual experience. Start with the situation, describe your actions clearly, and end with the concrete result. Since I couldn't access enough of your specific details, use your own real examples.",
            "question_family": family,
            "grounding_used": [],
            "missing_facts": ["LLM generation failed"],
            "placeholders_used": [],
            "confidence": "insufficient",
            "model_provider": "fallback",
            "model_version": "static",
            "safety_passed": True,
            "why_it_works": ["Provides a generic but safe structural template."]
        }
