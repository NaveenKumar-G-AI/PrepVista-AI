"""
PrepVista AI — Question Family Classification for Assistance
"""

FAMILY_HINTS: dict[str, dict[int, str]] = {
    "INTRODUCTION": {
        1: "The interviewer wants to understand your professional background, key skills, and what you are looking for in your career.",
        2: "Include:\n• A brief summary of who you are\n• Your top skills or experiences relevant to the role\n• Your current career goals",
    },
    "PROJECT": {
        1: "Focus on the problem your project solved, your personal contribution, one key decision you made, and the outcome.",
        2: "Include:\n• The problem or need\n• What you personally owned\n• A specific decision you made\n• Why you chose that approach\n• The result or what you learned",
    },
    "TECHNICAL": {
        1: "The interviewer is testing your understanding of technical concepts and your ability to explain them clearly.",
        2: "Include:\n• A direct definition or explanation\n• An example of how it is used\n• Trade-offs or alternatives (if applicable)",
    },
    "BEHAVIORAL": {
        1: "Use one real situation from your experience. The interviewer wants to see how you actually handled something, not a theoretical answer.",
        2: "Include:\n• The situation and context\n• Your specific responsibility\n• The action you took\n• The result or what changed",
    },
    "STRENGTH_WEAKNESS": {
        1: "The interviewer is looking for self-awareness and how you leverage your strengths or work on your weaknesses.",
        2: "Include:\n• A clear statement of your strength or weakness\n• An example demonstrating it\n• For weaknesses, what you are doing to improve",
    },
    "FAILURE": {
        1: "The interviewer wants to see accountability, resilience, and your ability to learn from mistakes.",
        2: "Include:\n• The situation where things went wrong\n• Your role in the failure\n• What you learned\n• How you prevented it from happening again",
    },
    "TEAMWORK": {
        1: "The interviewer is assessing how well you collaborate, communicate, and handle team dynamics.",
        2: "Include:\n• The team context and goal\n• Your role within the team\n• How you communicated or collaborated\n• The team's outcome",
    },
    "LEADERSHIP": {
        1: "The interviewer wants to see how you guide others, take initiative, or manage a project, even without a formal title.",
        2: "Include:\n• The leadership opportunity or challenge\n• The actions you took to guide the team or project\n• How you supported others\n• The outcome of your leadership",
    },
    "PROBLEM_SOLVING": {
        1: "The interviewer is looking at your analytical skills and how you approach complex challenges.",
        2: "Include:\n• The complex problem you faced\n• Your step-by-step approach to solving it\n• Any obstacles you overcame\n• The final resolution",
    },
    "COMPANY_ROLE": {
        1: "The interviewer wants to know if you've researched the company and understand the responsibilities of the role.",
        2: "Include:\n• Specific reasons you admire the company\n• How your skills align with the role's requirements\n• What you hope to contribute",
    },
    "CAREER": {
        1: "The interviewer is checking if your long-term goals align with what the company can offer.",
        2: "Include:\n• Your career objectives for the next few years\n• How this role fits into that path\n• What you hope to learn or achieve",
    },
    "AI_USAGE": {
        1: "The interviewer wants to understand your practical experience with AI tools and your perspective on their impact.",
        2: "Include:\n• Specific AI tools you have used\n• How you used them to solve a problem or improve efficiency\n• Any limitations or ethical considerations you noticed",
    },
    "COMMUNICATION": {
        1: "The interviewer is evaluating your ability to convey information clearly and adapt to different audiences.",
        2: "Include:\n• A situation where communication was critical or challenging\n• How you adapted your message or style\n• The result of your communication",
    },
    "PRESSURE": {
        1: "The interviewer wants to see how you manage stress, prioritize tasks, and maintain quality under tight deadlines.",
        2: "Include:\n• The high-pressure situation or deadline\n• How you prioritized or managed your time\n• How you stayed focused\n• The successful delivery",
    },
    "ETHICS": {
        1: "The interviewer is checking your integrity and how you handle situations where the right choice might be difficult.",
        2: "Include:\n• The ethical dilemma you faced\n• The values or principles that guided you\n• The action you took\n• The resolution",
    },
    "SALARY": {
        1: "The interviewer is trying to understand your compensation expectations to see if they align with the budget.",
        2: "Include:\n• A statement that you are open to negotiation or focusing on the role first\n• Your expected range based on research (if pressed)\n• A request to understand the full compensation package",
    },
    "CLOSING": {
        1: "The interviewer is giving you a chance to show your interest in the role and ask any final questions.",
        2: "Include:\n• 1-2 thoughtful questions about the role, team, or company\n• A brief reiteration of your interest in the position",
    },
    "GENERAL": {
        1: "Focus on giving a clear, structured answer that directly addresses the question.",
        2: "Include:\n• A direct answer to the question\n• Relevant context or an example\n• A brief conclusion",
    },
}

def classify_question_family(question_text: str) -> str:
    """Classify a question into a family based on keywords."""
    text = question_text.lower()
    if any(kw in text for kw in ["introduce yourself", "tell me about yourself"]):
        return "INTRODUCTION"
    if any(kw in text for kw in ["project", "built", "developed", "implemented"]):
        return "PROJECT"
    if any(kw in text for kw in ["explain", "what is", "how does", "difference between", "algorithm"]):
        return "TECHNICAL"
    if any(kw in text for kw in ["time when", "situation", "example of", "describe a"]):
        return "BEHAVIORAL"
    if any(kw in text for kw in ["strength", "weakness", "improve"]):
        return "STRENGTH_WEAKNESS"
    if any(kw in text for kw in ["failed", "failure", "mistake", "wrong"]):
        return "FAILURE"
    if any(kw in text for kw in ["team", "collaborate", "group", "together"]):
        return "TEAMWORK"
    if any(kw in text for kw in ["lead", "leadership", "managed", "mentor"]):
        return "LEADERSHIP"
    if any(kw in text for kw in ["solve", "problem", "challenge", "difficult"]):
        return "PROBLEM_SOLVING"
    if any(kw in text for kw in ["why this company", "why this role", "why do you want"]):
        return "COMPANY_ROLE"
    if any(kw in text for kw in ["career", "future", "goals", "five years", "where do you see"]):
        return "CAREER"
    if any(kw in text for kw in ["ai", "artificial intelligence", "chatgpt", "machine learning"]):
        return "AI_USAGE"
    if any(kw in text for kw in ["communicate", "communication", "explain to"]):
        return "COMMUNICATION"
    if any(kw in text for kw in ["pressure", "deadline", "stress", "tight"]):
        return "PRESSURE"
    if any(kw in text for kw in ["ethical", "integrity", "honest"]):
        return "ETHICS"
    if any(kw in text for kw in ["salary", "compensation", "expectation"]):
        return "SALARY"
    if any(kw in text for kw in ["questions for us", "anything else", "closing"]):
        return "CLOSING"
    return "GENERAL"

def get_fallback_hint(question_family: str, level: int) -> str:
    """Get a deterministic hint for a given family and level."""
    family = question_family.upper()
    if family not in FAMILY_HINTS:
        family = "GENERAL"
    
    hints = FAMILY_HINTS.get(family, FAMILY_HINTS["GENERAL"])
    return hints.get(level, hints[1])
