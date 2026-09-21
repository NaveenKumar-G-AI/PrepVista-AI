"""
PrepVista AI - Evaluation & Resume Prompt Builders
Extracted from prompts.py - build_per_question_eval_prompt,
_category_eval_criteria, _red_flag_json_fields, build_resume_extraction_prompt.

Re-exported by prompts.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import json

from app.config import get_plan_config

from app.services.prompts_helpers import (
    _coerce_resume_summary,
    _normalize_candidate_name,
    _SPEECH_RECOVERY_BLOCK,
)

def _category_eval_criteria(rubric_category: str) -> str:
    """Return category-specific scoring criteria and red-flag instructions for the eval prompt."""
    cat = (rubric_category or "").strip().lower()

    if cat == "situational_judgment":
        return """
CATEGORY-SPECIFIC CRITERIA: Situational Judgment
Evaluate the answer on these 5 dimensions (0-2 each, sum = total):
- Stakeholder identification: did they name the right people affected?
- Tradeoff reasoning: did they acknowledge competing priorities, not just pick one side?
- Concrete first step: did they give a clear, realistic action, not just a principle?
- Communication: how clearly did they walk through their reasoning?
- Integrity/judgment: was the reasoning ethical and professional?
A STRONG answer: names who is affected, acknowledges competing priorities, gives a clear first action, explains briefly.
A WEAK answer: gives a vague principle ("I would communicate") with no concrete action or stakeholder awareness.
RED FLAGS: blame_shifting if they assign fault to others; no_concrete_action if they only state a principle."""

    if cat in {"creative_thinking", "creative_lateral"}:
        return """
CATEGORY-SPECIFIC CRITERIA: Creative & Lateral Thinking
Evaluate on these 5 dimensions (0-2 each):
- Process narration: did they think out loud step by step?
- Assumption-checking: did they state what they were assuming before calculating?
- Structured approach: did they break the problem into components?
- Feasibility/realism: was the answer grounded, not fantastical?
- Communication: did they explain their thinking clearly?
IMPORTANT: Do NOT penalize for an incorrect final number. A Fermi estimate 3x off with clear reasoning
scores higher than an exact answer with no reasoning shown.
RED FLAGS: no_process if they give an immediate answer with zero reasoning; frozen_response if they stop at "I don't know"."""

    if cat == "ai_tool_fluency":
        return """
CATEGORY-SPECIFIC CRITERIA: AI Tool Fluency
Evaluate on these 5 dimensions (0-2 each):
- Specificity: did they name a specific tool AND a specific use case?
- Verification behavior: did they describe how they check or validate AI output?
- Judgment: did they show awareness of when NOT to trust AI?
- Honesty/integrity: did they reflect genuine practice, not what sounds impressive?
- Communication: was the answer clear and grounded?
RED FLAGS: vague_usage ("I use ChatGPT to help me" with no specific example); no_verification
(no awareness that AI output needs checking); overclaiming (always trusts AI); defensive (claims never to use AI)."""

    if cat == "programming_language":
        return """
CATEGORY-SPECIFIC CRITERIA: Programming Language Knowledge
Evaluate on these 5 dimensions (0-2 each):
- Conceptual accuracy: was what they said about the language correct?
- Applied grounding: did they tie it to real code they have written, not a textbook definition?
- Depth: did they show understanding of WHY, trade-offs, or edge cases — not just surface syntax?
- Specificity: did they name a concrete feature, construct, or example?
- Communication: was the explanation clear and well-structured?
A STRONG answer is accurate, tied to real usage, and shows reasoning about trade-offs.
A WEAK answer recites a generic definition or cannot give a concrete example.
RED FLAGS: generic_templated_answer (textbook definition with no real usage); resume_inconsistency (claims a language they clearly cannot discuss); overclaiming (states a level the answer does not support)."""

    if cat == "skill_verification":
        return """
CATEGORY-SPECIFIC CRITERIA: Skill Verification
Evaluate whether the candidate can back a resume skill with real depth (0-2 each):
- Evidence: did they give concrete proof of using the skill, not just restate the resume line?
- Depth: did they reach an advanced or non-obvious use, or stay shallow?
- Honesty: did they acknowledge their actual gaps and boundaries?
- Specificity: named tools, problems, or outcomes rather than vague claims?
- Communication: clear, structured account of their ability.
A STRONG answer proves the skill with a specific, fairly advanced example and is honest about limits.
A WEAK answer repeats the resume keyword with no real substance.
RED FLAGS: generic_templated_answer (no concrete evidence); resume_inconsistency (cannot support a claimed skill); overclaiming (claims expertise the answer contradicts)."""

    if cat == "certification":
        return """
CATEGORY-SPECIFIC CRITERIA: Certification (Authenticity & Application)
Evaluate what the candidate genuinely took from a certification (0-2 each):
- Authentic learning: did they describe a real concept or skill gained, beyond "I passed it"?
- Application: did they show where they applied it in real work or study?
- Motivation: was there a credible reason they pursued it?
- Specificity: concrete detail rather than the certificate's marketing blurb?
- Communication: clear and grounded.
A STRONG answer names a real takeaway AND a concrete application.
A WEAK answer can only state the certificate's name or its syllabus.
RED FLAGS: generic_templated_answer (recites the syllabus, no personal application); overclaiming (implies expertise a single certificate would not grant); resume_inconsistency (cannot discuss a certificate they listed)."""

    if cat == "self_assessment":
        return """
CATEGORY-SPECIFIC CRITERIA: Self-Assessment (Self-Awareness)
Evaluate the candidate's metacognition and honesty (0-2 each):
- Calibration: is their self-rating realistic given the evidence in their other answers?
- Evidence: did they justify the rating or self-critique with specific proof, not a vague claim?
- Honesty: did they acknowledge genuine gaps instead of a humble-brag ("I'm a perfectionist")?
- Self-awareness: do they understand where they over- or under-estimate themselves?
- Communication: clear, candid, and non-defensive.
A STRONG answer gives a realistic rating backed by real evidence and names a genuine area to grow.
A WEAK answer gives an unjustified number, a humble-brag, or a defensive non-answer.
RED FLAGS: arrogance_overclaiming (an unrealistically high self-rating with no proof); generic_templated_answer (cliché weakness with no substance); no_accountability (cannot name a real gap)."""

    if cat in {
        "teamwork_pressure", "teamwork", "ownership", "accountability",
        "leadership", "conflict_resolution", "adaptability", "ethics_integrity",
        "failure_resilience", "receiving_feedback", "communication_persuasion",
    }:
        return """
CATEGORY-SPECIFIC CRITERIA: Behavioral / STAR
Evaluate on STAR completeness (0-2 each):
- Situation clarity: did they set the scene concisely?
- Task/role: did they clarify their specific responsibility?
- Action: did they describe what THEY personally did, not the team?
- Result: did they give a concrete outcome, not just "it worked out"?
- Ownership language: ratio of "I" vs "we" — personal ownership matters here.
RED FLAGS: blame_shifting ("my team didn't..."); no_personal_action (describes situation but not their action);
no_result (stops at action without an outcome); arrogance (claims all credit for obvious team work)."""

    return """
CATEGORY-SPECIFIC CRITERIA: Technical / Domain Knowledge
Evaluate on relevance, accuracy, specificity, structure, and communication (0-2 each).
RED FLAGS: generic_templated_answer (no personal details, names, numbers, or context);
resume_inconsistency (claims that don't match the resume); overclaiming (takes sole credit for team/open-source work)."""


def _red_flag_json_fields() -> str:
    """JSON fields to append to every eval response for red-flag tracking (Report §6.4)."""
    return (
        '  "red_flags": {'
        '\n    "blame_shifting": <true|false>,'
        '\n    "no_accountability": <true|false>,'
        '\n    "arrogance_overclaiming": <true|false>,'
        '\n    "generic_templated_answer": <true|false>,'
        '\n    "negativity_about_past": <true|false>,'
        '\n    "no_concrete_action": <true|false>,'
        '\n    "intellectual_honesty_signal": "<bluffed|admitted_gap|redirected_well|none>"'
        '\n  },'
        '\n  "specificity_score": <0-2>,'
    )




def build_per_question_eval_prompt(
    question: str,
    normalized_answer: str,
    resume_summary: str,
    rubric_category: str,
    plan: str,
) -> str:
    """Build the per-question evaluation prompt for rubric-based scoring."""
    if plan == "free":
        return f"""You are evaluating ONE FREE plan interview answer for PrepVista AI.

This is a beginner-friendly coaching plan. Be fair to imperfect spoken English and voice-to-text mistakes.

Question asked: "{question}"
Candidate's answer after speech cleanup: "{normalized_answer}"
Resume context: {resume_summary}
Rubric category: {rubric_category}
{_category_eval_criteria(rubric_category)}
FREE PLAN GOAL:
- Act like a fair beginner interview coach.
- Understand intended meaning even if the English is weak.
- Do not confuse weak English with weak knowledge.
- Give one practical improvement step.
- Keep the better answer short, realistic, student-level, and grounded only in the candidate answer or resume context.
- Never invent experience, seniority, metrics, or achievements.
- If the meaning is understandable, keep idea quality fair even when speaking clarity is weak.
- Use coaching language that feels student-friendly and non-robotic.

SCORING RUBRIC:
- Question match: 0 to 2 (return this in relevance_score)
- Basic accuracy: 0 to 2 (return this in clarity_score)
- Specificity: 0 to 2
- Structure: 0 to 2
- Communication: 0 to 2 (return this in communication_score)
- Total score = sum of the 5 parts, from 0 to 10

ANSWER STATUS MUST BE ONE OF:
- No answer
- Answered briefly
- Answered partly
- Answered clearly

CONTENT UNDERSTANDING MUST BE ONE OF:
- None
- Basic
- Fair
- Good
- Strong

COMMUNICATION CLARITY MUST BE ONE OF:
- None
- Weak
- Basic
- Clear
- Strong

FEEDBACK STYLE:
- What worked: one short sentence
- What was missing: one short sentence that explains the main missing part or why the score is not higher
- How to improve: one short practical coaching sentence beginning like a next step
- Better answer: exactly 2 or 3 short grounded sentences, student-level, realistic, and never inflated

FEEDBACK VARIATION RULE:
- Do NOT always start feedback with the same phrase pattern.
- Rotate between different coaching angles: practical tip, mindset shift, interview strategy, or confidence builder.
- Vary sentence structure: sometimes start with the action, sometimes with the reason, sometimes with an analogy.
- The feedback must feel freshly written for THIS specific answer, not templated.

{_SPEECH_RECOVERY_BLOCK}

Return EXACTLY this JSON:
{{
  "relevance_score": <0-2>,
  "clarity_score": <0-2>,
  "specificity_score": <0-2>,
  "structure_score": <0-2>,
  "communication_score": <0-2>,
  "answer_status": "No answer|Answered briefly|Answered partly|Answered clearly",
  "content_understanding": "None|Basic|Fair|Good|Strong",
  "communication_clarity": "None|Weak|Basic|Clear|Strong",
  "corrected_intent": "<the candidate's intended meaning in 1 clear sentence, recovered from speech-to-text noise>",
  "why_score": "<1 sentence: why this score>",
  "what_worked": "<1 sentence>",
  "what_was_missing": "<1 sentence>",
  "how_to_improve": "<1 sentence practical coaching>",
  "better_answer": "<2-3 short grounded sentences>",
  "missing_elements": ["<specific missing item 1>", "<specific missing item 2>"],
  {_red_flag_json_fields()}
}}
"""

    if plan == "pro":
        return f"""You are evaluating ONE PRO plan interview answer for PrepVista AI.

This is a technical interview coaching plan. Be strict but fair. Recover intended meaning from speech-to-text mistakes before judging technical knowledge.

Question asked: "{question}"
Candidate's answer after transcript cleanup: "{normalized_answer}"
Resume context: {resume_summary}
Rubric category: {rubric_category}
{_category_eval_criteria(rubric_category)}
PRO PLAN GOAL:
- Act like a serious technical interviewer who understands broken spoken answers.
- Separate technical knowledge from communication quality.
- If the answer is short but relevant, do NOT treat it as fully wrong.
- Correct likely technical intent internally before scoring.
- Never invent seniority, fake metrics, fake benchmarks, fake tuning claims, or fake ownership.
- Better answers must stay grounded in what the candidate already implied or in the resume context.
- Preserve the same project, tool, method, and field when writing the better answer.
- Do not switch FastAPI to Python, or ownership to generic project summary, unless the candidate actually said that.
- Never return placeholder coaching like "A stronger answer would...". Always write the better answer itself.

FIRST, internally recover the likely intended technical meaning.
Examples:
- "rack workline" -> "RAG workflow"
- "advice serial testing" -> "adversarial testing"
- "news babe" -> "NewsWeave"

SCORING RUBRIC:
- Question match: 0 to 2
- Technical accuracy: 0 to 2
- Specificity: 0 to 2
- Structure: 0 to 2
- Communication: 0 to 2
- Total score = sum of the 5 parts, from 0 to 10

ANSWER STATUS MUST BE ONE OF:
- Clarification requested
- Relevant but too short
- Relevant but unclear
- Correct but shallow
- Strong
- No answer

TECHNICAL UNDERSTANDING MUST BE ONE OF:
- None
- Basic
- Fair
- Good
- Strong

ANSWER DELIVERY MUST BE ONE OF:
- Weak
- Basic
- Clear
- Strong

FEEDBACK STYLE:
- What you got right: one short sentence
- Main technical gap: one short sentence
- How to answer this better: one short coaching sentence
- Better answer: 2 to 4 grounded technical sentences only, never placeholder text

FEEDBACK VARIATION RULE:
- Vary your coaching language across evaluations. Avoid reusing the same sentence structure or phrasing patterns.
- Rotate between angles: technical precision, interview strategy, communication improvement, or depth enhancement.
- The "better_answer" must feel like a unique, custom-written response for THIS specific question, not a recycled template.
- For "how_to_improve", alternate between: concrete action steps, framing advice, depth strategies, and structural tips.

{_SPEECH_RECOVERY_BLOCK}

Return EXACTLY this JSON:
{{
  "question_match_score": <0-2>,
  "technical_accuracy_score": <0-2>,
  "specificity_score": <0-2>,
  "structure_score": <0-2>,
  "communication_score": <0-2>,
  "answer_status": "Clarification requested|Relevant but too short|Relevant but unclear|Correct but shallow|Strong|No answer",
  "corrected_intent": "<likely intended meaning in 1 short sentence>",
  "technical_understanding": "None|Basic|Fair|Good|Strong",
  "communication_clarity": "Weak|Basic|Clear|Strong",
  "why_score": "<1 sentence: why this score>",
  "what_worked": "<1 sentence>",
  "what_was_missing": "<1 sentence>",
  "how_to_improve": "<1 sentence practical coaching>",
  "better_answer": "<2-4 short grounded technical sentences>",
  "missing_elements": ["<specific missing item 1>", "<specific missing item 2>"],
  {_red_flag_json_fields()}
}}
"""

    if plan == "career":
        return f"""You are evaluating ONE CAREER plan interview answer for PrepVista AI.

This is a premium placement-style interview coaching plan. Understand long spoken answers, recover likely intended meaning, and evaluate with high trust.

Question asked: "{question}"
Candidate's answer after transcript cleanup: "{normalized_answer}"
Resume context: {resume_summary}
Rubric category: {rubric_category}
{_category_eval_criteria(rubric_category)}
CAREER PLAN GOAL:
- Evaluate like a premium interviewer who checks ownership, decisions, trade-offs, impact, and communication.
- Evaluate like a hiring panel, not just a technical evaluator.
- Recover likely intended meaning before judging content.
- Do not punish the candidate only for speech-to-text noise if the meaning is still clear.
- Never expose internal fallback wording.
- Never invent seniority, fake metrics, fake outcomes, fake model work, or fake responsibilities.
- Better answers must feel interview-ready, grounded, and realistic.
- Preserve the same field, project, tool, and decision type when writing the better answer.
- Do not reuse the same generic better-answer template across different questions.
- If the question is about communication or role fit, the better answer must answer that exact question, not a technical question instead.

Examples of likely speech recovery:
- "first api" -> "FastAPI"
- "news where a" or "newspaper" -> "NewsWeave" or the candidate's news project context
- "anal pic techniques" -> "NLP techniques"

SCORING RUBRIC:
- Relevance: 0 to 2
- Depth: 0 to 2
- Specificity: 0 to 2
- Structure: 0 to 2
- Communication: 0 to 2
- Total score = sum of the 5 parts, from 0 to 10

ANSWER STATUS MUST BE ONE OF:
- Clarification requested
- No answer
- Relevant but unclear
- Timed out
- System cut off
- Partial answer
- Relevant but shallow
- Strong

CONTENT QUALITY MUST BE ONE OF:
- None
- Basic
- Fair
- Good
- Strong

DEPTH QUALITY MUST BE ONE OF:
- None
- Basic
- Fair
- Good
- Strong

COMMUNICATION QUALITY MUST BE ONE OF:
- None
- Weak
- Basic
- Clear
- Strong

FEEDBACK STYLE:
- What you did well: one short sentence
- Main gap: one short sentence
- Why this matters in a real interview: one short sentence
- Best answer structure: one practical blueprint sentence
- Better answer: 3 to 4 grounded, interview-ready sentences
- Keep coaching premium, direct, and recruiter-aware.
- Never end the better answer mid-sentence.

FEEDBACK VARIATION RULE:
- Your coaching must feel premium and individually crafted for THIS answer.
- Vary the "why_this_matters" angle: sometimes hiring impact, sometimes career growth, sometimes competitive differentiation, sometimes interview psychology.
- The "answer_blueprint" should offer a unique structural suggestion each time, not always "Start with X, then Y, then Z."
- The "better_answer" must be written as if you are coaching this specific candidate for this specific role — never generic.
- Rotate "how_to_improve" between: concrete technique, mindset reframe, preparation strategy, and communication tactic.

{_SPEECH_RECOVERY_BLOCK}

Return EXACTLY this JSON:
{{
  "relevance_score": <0-2>,
  "depth_score": <0-2>,
  "specificity_score": <0-2>,
  "structure_score": <0-2>,
  "communication_score": <0-2>,
  "answer_status": "Clarification requested|No answer|Relevant but unclear|Timed out|System cut off|Partial answer|Relevant but shallow|Strong",
  "corrected_intent": "<likely intended meaning in 1 short sentence>",
  "content_quality": "None|Basic|Fair|Good|Strong",
  "depth_quality": "None|Basic|Fair|Good|Strong",
  "communication_quality": "None|Weak|Basic|Clear|Strong",
  "why_score": "<1 sentence: why this score>",
  "what_worked": "<1 sentence>",
  "what_was_missing": "<1 sentence>",
  "why_this_matters": "<1 sentence: why this matters in a real interview>",
  "how_to_improve": "<1 sentence practical coaching>",
  "answer_blueprint": "<1 sentence answer structure>",
  "better_answer": "<3-4 grounded premium sentences>",
  "missing_elements": ["<specific missing item 1>", "<specific missing item 2>"],
  {_red_flag_json_fields()}
}}
"""

    return f"""You are evaluating ONE interview answer for PrepVista AI ({plan.upper()} plan). Be strict, fair, and specific.

Question asked: "{question}"
Candidate's answer: "{normalized_answer}"
Resume context: {resume_summary}
Rubric category: {rubric_category}

Score this answer from 0 to 10:
- 0-2: No relevant content, completely wrong, or silent
- 3-4: Vague or generic, missing most key elements
- 5-6: Partially correct, has substance but significant gaps
- 7-8: Good answer with minor gaps
- 9-10: Excellent, covers key elements with specificity and clarity

EVALUATION RULES:
- Score based on SEMANTIC MEANING, not grammar or speech artifacts
- If the answer shows real understanding but poor articulation, score the understanding
- Identify exactly what is missing, with specific elements
- Write the ideal answer as if coaching the candidate
- "I don't know" + honest = score 1, not 0. Separate from "wrong."
- An answer that is vague about ML pipeline should score 3-4, not 7

Also rate communication (0-10): clarity, structure, conciseness.

Return EXACTLY this JSON:
{{
  "classification": "strong|partial|vague|wrong|silent",
  "score": <0-10>,
  "scoring_rationale": "<1-2 sentence explanation>",
  "missing_elements": ["<specific element 1>", "<specific element 2>"],
  "ideal_answer": "<2-4 sentences: what a great answer would include>",
  "communication_score": <0-10>,
  "communication_notes": "<1 sentence about how they communicated>"
}}
"""


def build_resume_extraction_prompt(resume_text: str) -> str:
    """Extract structured data from resume text."""
    return f"""Extract structured data from this resume. Return JSON only.

Resume text:
{resume_text}

FIELD DETECTION RULE:
- Before extracting data, first determine the candidate's broad field from their resume content.
- Possible broad fields (pick the best match):
  "ai_ml_data" — AI, machine learning, data science, NLP, deep learning
  "software_backend_frontend" — software engineering, web development, backend, frontend, full-stack
  "electronics_embedded" — electronics, embedded systems, VLSI, communication engineering
  "electrical_core" — electrical engineering, power systems, control systems
  "mechanical_manufacturing" — mechanical engineering, manufacturing, automotive, robotics
  "civil_structural" — civil engineering, structural engineering, construction, architecture
  "business_analyst_operations" — business analysis, operations, management, finance, marketing
  "design_creative" — UI/UX design, graphic design, product design
  "general_fresher" — mixed or unclear profile, general fresher with no dominant field
- Set field_confidence between 0.0 (pure guess) and 1.0 (very obvious from resume content).

Return exactly this JSON structure:
{{
  "candidate_name": "<name or 'Unknown'>",
  "education": ["<degree and institution>"],
  "skills": ["<skill1>", "<skill2>"],
  "programming_languages": ["<only actual programming/query/markup languages the candidate knows, e.g. Python, Java, SQL, C++. Empty list if none or non-technical profile.>"],
  "certifications": ["<certification name with issuer if visible, e.g. 'AWS Certified Solutions Architect', 'Google Data Analytics'. Empty list if none.>"],
  "projects": [
    {{"name": "<project name>", "description": "<1-2 sentence summary>", "tech_stack": ["<tech1>"]}}
  ],
  "experience": [
    {{"title": "<job title>", "company": "<company>", "description": "<1 sentence>"}}
  ],
  "inferred_role": "<junior_swe|mid_swe|senior_swe|data_scientist|product_manager|designer|other>",
  "broad_field": "<ai_ml_data|data_science_analytics|software_backend_frontend|electronics_embedded|electrical_core|mechanical_core|civil_core|cybersecurity|business_analyst_operations|design_creative|general_fresher_mixed>",
  "field_confidence": <0.0-1.0>,
  "target_role_label": "<human-readable role label, e.g. 'Backend Developer roles' or 'Mechanical Design Engineer roles'>",
  "department": "<raw department string exactly as written in the resume header or education section, e.g. 'Computer Science and Engineering' or 'B.Tech - AI & Data Science'. Use null if not found.>"
}}
"""


# ─── Question preamble templates ────────────────────────────────────────────────
# Short context sentence prepended to the first question on each new topic.
# Helps the candidate understand what the question is about before they hear it.
# Organized by plan level and question family.
#
# UPGRADE: Expanded from 2 to 6 templates per category per plan (78 → 234 total).
# Selection by session_variant ensures students hear different preambles across
# sessions, eliminating the "same intro every time" complaint.

QUESTION_PREAMBLE_TEMPLATES: dict[str, dict[str, list[str]]] = {
    "free": {
        "introduction": [
            "Let's start with a quick look at who you are.",
            "I'd like to begin by understanding your background.",
            "Tell me a bit about yourself and what brings you here.",
            "Before we dive in, I'd love to hear your story.",
            "Let's kick things off — who are you and what drives you?",
            "I want to understand you as a person first.",
        ],
        "studies_background": [
            "Let's talk about what you're studying or focusing on.",
            "I'd like to hear about your current learning.",
            "Your education is a big part of your story right now.",
            "What are you working on academically these days?",
            "Let's explore your academic foundation.",
            "I'm curious about the learning path you've chosen.",
        ],
        "ownership": [
            "Now I want to understand the work you personally handled.",
            "Let's look at what you owned in your project work.",
            "Show me something that was clearly your responsibility.",
            "I want to hear about work where you made the key decisions.",
            "Let's talk about something you built or led yourself.",
            "What's a piece of work you're genuinely proud of owning?",
        ],
        "workflow_process": [
            "Let's walk through how your work actually happened.",
            "I'd like to understand the process behind your project.",
            "Tell me about the steps you followed to get things done.",
            "How did you actually approach building this?",
            "Walk me through the process from start to finish.",
            "I want to understand how you work, not just what you built.",
        ],
        "tool_method": [
            "Let's look at the tools or methods you used.",
            "I'd like to understand the technology choices you made.",
            "What tools did you rely on and why?",
            "Let's talk about your technical toolkit.",
            "I'm curious about the methods you chose for this work.",
            "Tell me about a tool or technique that was important in your project.",
        ],
        "challenge_debugging": [
            "Every project has tough moments — let's talk about yours.",
            "I want to hear about a challenge you worked through.",
            "What was the hardest part of this work for you?",
            "Tell me about something that didn't go as planned.",
            "Let's talk about a problem that really tested you.",
            "What obstacle surprised you during this project?",
        ],
        "communication_explain": [
            "Being able to explain your work clearly matters a lot.",
            "Let's see how you communicate your ideas.",
            "Can you explain this in a way anyone could follow?",
            "I want to see how clearly you can break this down.",
            "Let's test your ability to make complex things simple.",
            "Imagine explaining this to someone outside your field.",
        ],
        "teamwork_pressure": [
            "Real work means handling pressure and people.",
            "Let's talk about a situation that tested how you work with others.",
            "Tell me about a time teamwork made a real difference.",
            "How do you handle it when things get stressful?",
            "Let's talk about working with others under real constraints.",
            "I'd like to hear about a team experience that shaped you.",
        ],
        "learning_growth": [
            "Growth matters more than perfection at this stage.",
            "Let's discuss what you're actively working to improve.",
            "What have you learned recently that changed how you work?",
            "Tell me about a skill gap you're closing right now.",
            "I'm interested in how you grow and adapt.",
            "What's something you know now that you wish you knew earlier?",
        ],
        "role_fit": [
            "Let's talk about the kind of role you're aiming for.",
            "I'd like to understand what you're preparing for next.",
            "Why does this type of role appeal to you?",
            "What makes you a good fit for the work you want to do?",
            "Let's discuss where you see yourself heading.",
            "Tell me why this career direction feels right for you.",
        ],
        "closeout": [
            "We're wrapping up — let's leave a strong impression.",
            "One last thing before we close.",
            "Final question — make it count.",
            "Let's end with something memorable.",
            "Here's your chance to leave one lasting thought.",
            "Last question — what should I remember about you?",
        ],
        # ✅ ADDED: three new families (Report §3.3, §3.4, §3.8)
        "situational_judgment": [
            "Let's see how you think on your feet in a tricky situation.",
            "Here's a scenario — I'm curious how you'd handle it.",
            "Real work throws surprises. Let's talk through one.",
            "I'd like to understand how you make decisions under pressure.",
            "Tell me how you'd approach a difficult moment at work or study.",
            "Let's explore your judgment in a challenging situation.",
        ],
        "creative_thinking": [
            "Let's try something a bit different — a thinking challenge.",
            "No right answer here — I just want to see how you reason.",
            "Here's a quick creative problem. Walk me through it.",
            "Let's see how you approach something open-ended.",
            "I'd like to test your reasoning on a non-standard question.",
            "This one's about how you think, not what you know.",
        ],
        "ai_tool_fluency": [
            "Let's talk about how you actually use AI tools in your work.",
            "AI tools are part of every field now. Tell me how you use them.",
            "I'm curious about your real experience with AI tools.",
            "Let's discuss how you use and think about AI in your work.",
            "AI fluency is a real skill now — let's hear about yours.",
            "Tell me honestly how AI fits into how you study or work.",
        ],
    },
    "pro": {
        "introduction": [
            "Let's start with your professional background.",
            "I'd like a clear picture of your experience and direction.",
            "Give me a crisp overview of who you are professionally.",
            "Before we get technical, set the context for me.",
            "Let's open with what defines you as a candidate.",
            "Start by positioning yourself for the role you want.",
        ],
        "studies_background": [
            "Let's connect your studies to your technical work.",
            "I want to understand how your education supports your work.",
            "How has your academic background shaped your technical thinking?",
            "Let's see the bridge between what you studied and what you built.",
            "Your coursework matters — how did it influence your projects?",
            "Tell me how your studies prepared you for real-world problems.",
        ],
        "ownership": [
            "Let's talk about the work that was clearly yours.",
            "I'd like to understand your individual contribution.",
            "What did you personally decide, design, or deliver?",
            "Show me where your fingerprints are on this project.",
            "I want to see evidence of your individual impact.",
            "Separate your contribution from the team's — what was uniquely yours?",
        ],
        "workflow_process": [
            "Let's dig into the technical workflow.",
            "I want to understand your engineering process.",
            "Walk me through the architecture and flow of your work.",
            "How did you structure this from a technical standpoint?",
            "Let's get specific about your development process.",
            "I'm interested in the engineering decisions behind your workflow.",
        ],
        "tool_method": [
            "Let's look at your technology choices and why you made them.",
            "I'd like to understand your technical decision-making.",
            "Why this stack? Walk me through the reasoning.",
            "Let's evaluate the tools you selected and their trade-offs.",
            "Tell me about a technology choice you'd defend in a review.",
            "I want to understand the 'why' behind your technical stack.",
        ],
        "challenge_debugging": [
            "Let's talk about a real technical problem you solved.",
            "I want to hear about a challenge that pushed your skills.",
            "Tell me about a bug or issue that took real effort to fix.",
            "What technical problem gave you the most trouble?",
            "Let's discuss a failure or setback and how you recovered.",
            "Walk me through your debugging process on a hard problem.",
        ],
        "validation_metrics": [
            "Let's look at how you measure and validate your work.",
            "I want to understand how you know your work actually improved things.",
            "What metrics or evidence prove your work was successful?",
            "How do you validate that what you built actually works?",
            "Let's talk about measurement — how do you quantify impact?",
            "Show me the evidence that your approach was the right one.",
        ],
        "tradeoff_decision": [
            "Engineering is about trade-offs — let's look at one you made.",
            "I'd like to understand a key decision where you had to balance options.",
            "Tell me about a technical compromise you had to make.",
            "What was the hardest engineering trade-off in your project?",
            "Let's discuss a decision where there was no perfect answer.",
            "Walk me through a choice where you had to sacrifice one thing for another.",
        ],
        "communication_explain": [
            "Being able to explain technical work clearly is a real skill.",
            "Let's see how you communicate complex decisions.",
            "Explain this technical concept as if I'm not an engineer.",
            "I want to see how you simplify without losing accuracy.",
            "Let's test your ability to communicate technical depth clearly.",
            "Can you make someone outside your domain understand this?",
        ],
        "teamwork_pressure": [
            "Let's talk about how you perform under pressure or in a team.",
            "I want to hear about a situation that tested your professional judgment.",
            "Tell me about a time you had to navigate a difficult team dynamic.",
            "How do you handle technical disagreements with teammates?",
            "Let's discuss a high-pressure situation and how you managed it.",
            "What's a team scenario that revealed something about your work style?",
        ],
        "learning_growth": [
            "Let's discuss your growth areas and how you're addressing them.",
            "I'd like to understand what you're working to improve.",
            "What technical skill are you actively developing right now?",
            "Tell me about a gap in your knowledge and how you're closing it.",
            "Where do you feel you need the most growth as a professional?",
            "What feedback have you received that changed your approach?",
        ],
        "role_fit": [
            "Let's look at how your background fits the role you're targeting.",
            "I'd like to understand why you're the right person for this kind of role.",
            "Make the case — why should a team hire you for this position?",
            "How does your experience specifically prepare you for this role?",
            "Let's discuss what makes your candidacy compelling.",
            "If you had 30 seconds with a hiring manager, what would you say?",
        ],
        "closeout": [
            "We're nearing the end — let's close with something strong.",
            "One final question to wrap things up.",
            "Last question — leave a strong impression.",
            "Here's your closing moment — make it memorable.",
            "Final opportunity to differentiate yourself.",
            "What's the one thing you want me to remember about this conversation?",
        ],
        # ✅ ADDED: three new families (Report §3.3, §3.4, §3.8)
        "situational_judgment": [
            "Let's see how you handle a real workplace dilemma.",
            "Here's a scenario that tests your professional judgment.",
            "I want to understand how you think through a tough call.",
            "Let's walk through a situation that has no easy answer.",
            "Real interviews include judgment calls — here's one.",
            "Let's test your decision-making in a real-world situation.",
        ],
        "creative_thinking": [
            "Let's shift gears — a lateral thinking challenge.",
            "This one is about reasoning, not knowledge.",
            "Here's a non-standard problem — walk me through your approach.",
            "Let's see how you handle ambiguity and constraint.",
            "No prep needed — just think out loud.",
            "Let's explore how you reason under uncertainty.",
        ],
        "ai_tool_fluency": [
            "AI tools have changed how people work. Let's discuss your experience.",
            "I want to understand how you actually use AI in your technical work.",
            "Let's talk about AI tools — how you use them and how you evaluate their output.",
            "This is a skill every candidate needs now. How do you use AI?",
            "Let's discuss your real workflow with AI tools.",
            "AI fluency is a differentiator — show me yours.",
        ],
        # ✅ ADDED: four new families (PRO)
        "programming_language": [
            "Let's get specific about a language you actually use.",
            "I want to test your real understanding of a programming language, not trivia.",
            "Let's talk about one language on your resume in depth.",
            "Time to go below the surface on a language you know.",
        ],
        "skill_verification": [
            "Let's pressure-test one skill on your resume.",
            "I want to separate a resume keyword from real ability.",
            "Let's verify how deep one of your listed skills actually goes.",
            "Pick a skill you claim — let's see how far it holds up.",
        ],
        "certification": [
            "Let's talk about one of your certifications.",
            "I'm curious what a certification on your resume actually taught you.",
            "Beyond the certificate, I want to know what stuck.",
            "Let's see how a certification you earned shows up in real work.",
        ],
        "self_assessment": [
            "Let's do a quick, honest self-assessment.",
            "I want to understand how accurately you read your own ability.",
            "Self-awareness is a real signal — let's test yours.",
            "Time for an honest rating of where you stand.",
        ],
    },
    "career": {
        "introduction": [
            "Let's open with what makes your candidacy stand out.",
            "I'd like to start with a clear picture of your fit for this role.",
            "Position yourself — what makes you the candidate to watch?",
            "Before we go deep, tell me what sets you apart.",
            "Let's begin with your strongest professional identity.",
            "Start by framing why a hiring panel should pay attention.",
        ],
        "studies_background": [
            "Let's connect your academic foundation to your professional edge.",
            "I want to understand the learning behind your expertise.",
            "How has your education given you a competitive advantage?",
            "Let's see how your studies translate into professional readiness.",
            "What academic experience most shaped your technical judgment?",
            "Tell me how your coursework informs the way you solve problems.",
        ],
        "ownership": [
            "Let's talk about the work where you had real ownership.",
            "I'd like to understand where your decisions directly shaped outcomes.",
            "What's the strongest example of your individual impact?",
            "Show me ownership — what did you decide, build, and deliver?",
            "I want to see where you took full responsibility for an outcome.",
            "Prove to me that you can own a problem end-to-end.",
        ],
        "workflow_process": [
            "Let's dig into the architecture and design thinking behind your work.",
            "I want to understand the engineering decisions you made.",
            "Walk me through your system design and the reasoning behind it.",
            "How did you structure this for maintainability and scale?",
            "Let's look at the architecture — what would you change in hindsight?",
            "I'm interested in the design philosophy behind your technical choices.",
        ],
        "tool_method": [
            "Let's discuss the tools and methods you chose and why they mattered.",
            "I'd like to understand the reasoning behind your technical stack.",
            "Defend your technology choices — why this stack over alternatives?",
            "Let's evaluate your technical judgment through your tool selection.",
            "What technology decision best demonstrates your engineering maturity?",
            "Tell me about a tool choice that had real consequences for the project.",
        ],
        "challenge_debugging": [
            "Let's talk about a real constraint or failure that tested your judgment.",
            "I want to hear about a challenge that shows how you think under pressure.",
            "Tell me about a failure that taught you something important.",
            "What's the hardest technical problem you've faced, and what did you do?",
            "Let's discuss a moment where your approach failed and you had to adapt.",
            "Walk me through a debugging session that tested your deepest skills.",
        ],
        "validation_metrics": [
            "Let's look at how you validate whether your work actually moved the needle.",
            "I want to understand the evidence behind your results.",
            "How do you prove to a stakeholder that your work created real value?",
            "What measurement framework do you use to validate your decisions?",
            "Show me the data — how do you know your approach was successful?",
            "Let's discuss how you separate correlation from causation in your results.",
        ],
        "tradeoff_decision": [
            "Strong engineers make tough trade-offs — let's discuss yours.",
            "I'd like to understand a decision where you had to balance competing priorities.",
            "Tell me about a choice where every option had a downside.",
            "What's the most consequential engineering trade-off you've made?",
            "Let's discuss a decision you'd make differently with hindsight.",
            "Walk me through a prioritization conflict and how you resolved it.",
        ],
        "communication_explain": [
            "A strong hire explains their work so any interviewer can follow.",
            "Let's test how well you can communicate your technical decisions.",
            "Explain this to a VP who has 2 minutes and no technical background.",
            "I want to see if you can make a non-engineer understand your value.",
            "Let's test your ability to translate depth into clarity.",
            "Can you tell this story so a recruiter writes it in their notes?",
        ],
        "teamwork_pressure": [
            "Real-world roles come with pressure and people dynamics.",
            "Let's talk about a situation where your professional judgment was tested.",
            "Tell me about navigating a conflict or high-stakes decision in a team.",
            "How do you lead or influence when you don't have formal authority?",
            "Let's discuss a moment that reveals your leadership potential.",
            "What team experience best demonstrates your professional maturity?",
        ],
        "learning_growth": [
            "Self-awareness is one of the strongest hiring signals.",
            "Let's discuss what you're actively working to improve.",
            "What's the biggest gap between where you are and where you want to be?",
            "Tell me about a weakness you've turned into a development priority.",
            "How do you stay current and keep growing as a professional?",
            "What honest feedback about yourself would you share with a hiring manager?",
        ],
        "role_fit": [
            "Let's talk about why you belong in this role.",
            "I'd like to understand what makes you a strong hire for this position.",
            "Make the business case for hiring you — why you, why now?",
            "If you had one minute with the CEO, how would you pitch yourself?",
            "What would you focus on in your first 30 days on the job?",
            "Why should this panel remember you over every other candidate?",
        ],
        "closeout": [
            "We're wrapping up — this is your last chance to leave a lasting impression.",
            "One final opportunity to show why a panel should remember you.",
            "Last question — this is what the panel will discuss after you leave.",
            "Close strong — what's the one thing that makes you unforgettable?",
            "Final moment — say something that would make a hiring manager pause.",
            "Here's your closing statement — what should the panel take away?",
        ],
        # ✅ ADDED: three new families for career plan (Report §3.3, §3.4, §3.8)
        "situational_judgment": [
            "Strong hires make good calls in hard moments. Let's test yours.",
            "Here's a real-world dilemma — walk me through your reasoning.",
            "I want to see how you navigate ambiguity and competing priorities.",
            "Judgment under pressure is a key hiring signal. Here's a scenario.",
            "Let's see how you think when there's no obviously right answer.",
            "Real leadership means making tough calls. Here's one.",
        ],
        "creative_thinking": [
            "I'd like to see how you think, not just what you know.",
            "Here's a challenge that tests your reasoning, not your memory.",
            "Let's try a lateral thinking exercise — no prep needed.",
            "Strong candidates think clearly under ambiguity. Let's see.",
            "This is about your problem-solving process, not the answer.",
            "Let's explore how you handle novelty and constraint.",
        ],
        "ai_tool_fluency": [
            "AI fluency separates strong candidates from average ones right now.",
            "I want to understand how you critically use AI — not just whether you do.",
            "Let's talk about AI tools — where you use them, where you don't, and why.",
            "Every strong hire in 2025-2026 has a clear AI working practice. Tell me yours.",
            "How you use AI reflects your judgment. Walk me through it.",
            "AI is a tool. Let's see how good you are with it.",
        ],
        # ✅ ADDED: four new families (CAREER)
        "programming_language": [
            "Let's go deep on a language you claim to know well.",
            "I want to see genuine depth in one of your languages, not surface familiarity.",
            "A strong engineer can defend their language choices. Let's test that.",
            "Let's pick one language and go below the syntax.",
        ],
        "skill_verification": [
            "Let's pressure-test one skill on your resume until it either holds or breaks.",
            "I want hard evidence behind one of your listed skills.",
            "Strong candidates can prove every line on their resume. Let's check one.",
            "Pick a skill you list — I want to see how deep it really goes.",
        ],
        "certification": [
            "Let's talk about a certification and what it actually changed in your work.",
            "A certification is only as good as what you do with it. Let's see yours.",
            "I want to know the real value you took from a certification, not the syllabus.",
            "Let's connect a certification you earned to real, applied work.",
        ],
        "self_assessment": [
            "Honest self-assessment is one of the strongest hiring signals. Let's test yours.",
            "I want to see how accurately you judge your own ability.",
            "Strong hires know exactly where they stand. Let's find out if you do.",
            "Let's do a candid rating — and I'll be listening for the evidence behind it.",
        ],
    },
}