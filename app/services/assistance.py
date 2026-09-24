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
        
        # Provide a question-specific, first-person template as a fallback
        target_role = "this role"
        if isinstance(role_context, str) and role_context != "Interview Candidate":
            target_role = role_context
            
        structures = {
            "intro": "I am [Name] and my strongest area is [Field]. I recently worked on [Project], where I delivered [Concrete Result]. I am targeting roles like this where I can bring practical experience.",
            "studies_background": "My current focus is [Field of Study], which I applied directly in [Project]. In that work, I handled [Specific Task] and achieved [Concrete Result].",
            "ownership": "In [Project], I personally owned the [Specific Component] part of the work. I made the decision to [Action Taken] because [Reason], which ultimately resulted in [Concrete Result].",
            "workflow": "First, I evaluated [Initial Step] to understand the requirements. Then, I implemented [Core Method] to handle the main logic, which allowed me to achieve [Concrete Result].",
            "tool_method": "I used [Tool or Method] because it was the best fit for handling [Specific Challenge]. By applying it, I was able to deliver [Concrete Result].",
            "validation": "To validate my work, I checked [Specific Metric] before and after the change. The results showed [Concrete Improvement], confirming the decision was right.",
            "tradeoff": "I had to choose between [Option A] and [Option B] under a real constraint. I chose [Option] because [Reason], which led to a successful [Result].",
            "behavioral": "In [Project], I faced a situation where [Challenge]. I took action by [Specific Action], which resulted in [Positive Outcome]. This taught me the value of [Lesson Learned].",
            "communication": "I explained the concept to the team by breaking it down simply. This mattered because it helped us align on the decision and move forward to [Result].",
            "role_fit": f"My background makes me a strong fit for {target_role}. For example, in [Project], I proved I can handle this by [Specific Proof Point].",
            "learning_growth": "One area I am actively improving is [Growth Area]. I am currently working to strengthen it because I know it is critical for success in this field.",
            "closeout": "You should hire me because I can deliver [Core Strength]. In [Project], I proved this by achieving [Concrete Result], and I want to bring that same impact here.",
        }
        fallback_content = structures.get(family, "In [Project], I handled [Specific Task] and decided to [Action Taken]. This directly resulted in [Concrete Result].")
        
        return {
            "content": fallback_content,
            "question_family": family,
            "grounding_used": [],
            "missing_facts": ["LLM generation failed"],
            "placeholders_used": [],
            "confidence": "insufficient",
            "model_provider": "fallback",
            "model_version": "static",
            "safety_passed": True,
            "why_it_works": ["Provides a structured, professional fill-in-the-blank template for this specific question type."]
        }
