"""
PrepVista AI - Interviewer Templates & Rendering
Extracted from interviewer.py - question templates per category,
SJT/creative/AI-fluency templates, difficulty adaptation, preamble
building, follow-up hints, and the main fallback AI response builder.

Re-exported by interviewer.py (barrel file) for backward compatibility.
"""

import json
import re
from typing import Any

import structlog

from app.config import PLAN_CONFIG, normalize_difficulty_mode
from app.services.transcript import normalize_transcript

from app.services.interviewer_constants import (
    QUESTION_FAMILIES,
    QUESTION_CUE_PREFIXES,
    QUESTION_INTRO_PREFIXES,
    QUESTION_STYLE_HINTS,
    FIELD_FOCUS_ANGLES,
    REPEAT_REQUEST_PHRASES,
    NO_ANSWER_TOKEN,
    SYSTEM_TIME_UP_TOKEN,
    TECHNICAL_SIGNAL_TERMS,
)
from app.services.interviewer_helpers import (
    _coerce_question_plan,
    _coerce_resume_summary_dict,
    _resume_highlight,
    _resume_field_profile,
    _resume_primary_project,
    _resume_primary_skill,
    _resume_target_role,
    _field_focus_angle,
    _normalize_candidate_name,
    _short_target_role_label,
    _extract_answer_anchor_facts,
    _build_answer_anchor_summary,
    _extract_answer_coverage,
    _derive_redundant_followup_families,
    _build_answer_led_followup,
    _should_force_answer_led_followup,
    _contains_any,
    _resume_answer_terms,
    _get_next_plan_item,
)

from app.services.interviewer_question_engine import (
    _normalize_plan_category,
    _normalize_plan_difficulty,
    _question_family_from_text,
    _answer_signal_profile,
    _build_free_retry_question,
    _merge_boost_with_question,
    _build_pro_retry_question,
    _build_career_retry_question,
    _build_free_followup_question,
    _is_duplicate_question,
    _violates_family_repeat_rules,
    _get_future_plan_items,
    _build_emergency_unique_question,
    _humanize_question_target,
    _style_variant_index,
)

logger = structlog.get_logger("prepvista.interviewer")

def _question_template_for_category(
    category: str,
    target: str,
    silence_count: int,
    plan: str = "free",
    style_hint: str = "",
    variant_seed: int = 0,  # ✅ ADDED: was missing. Without this, choose() always picks
    # the same template slot for the same plan+category+target combo — every session.
) -> str:
    """Return a deterministic next question when the model is slow or unavailable."""
    family = _normalize_plan_category(category, fallback="communication_explain")
    simple_target = _humanize_question_target(target, family)
    simplified = silence_count >= 2
    # ✅ FIXED: XOR the static hash with variant_seed so the chosen template slot
    # actually rotates across sessions instead of being permanently locked to one string.
    variant_index = (_style_variant_index(plan, family, simple_target, style_hint) + variant_seed) % 65521

    def choose(*options: str) -> str:
        usable = [option for option in options if option]
        if not usable:
            return ""
        return usable[variant_index % len(usable)]

    if plan == "free":
        if family == "introduction":
            return choose(
                "Tell me about yourself.",
                "Give me a short introduction with your background and what you are building toward.",
                "Briefly introduce yourself, your strongest area, and the role you want next.",
                "Start with a short introduction about who you are and what kind of work interests you most.",
                "Share a short introduction about yourself and the kind of role you are preparing for.",
            )
        if family == "studies_background":
            return (
                choose(
                    "What are you currently studying, and what are you focusing on right now?",
                    "What are you studying now, and what part of it connects most to the work you want?",
                    "What are you currently learning, and what interests you most in it?",
                )
                if not simplified
                else choose(
                    "What are you studying right now?",
                    "What course or degree are you doing now?",
                    "What are you studying at the moment?",
                )
            )
        if family == "ownership":
            return (
                choose(
                    f"What part of {simple_target} was mainly yours?",
                    f"What did you mainly handle in {simple_target}?",
                    f"What was your part in {simple_target}, and what changed because of it?",
                )
                if not simplified
                else choose(
                    "What part was mainly yours there?",
                    "What did you mainly handle there?",
                    "What was your role there?",
                )
            )
        if family == "workflow_process":
            return (
                choose(
                    f"Walk me through how {simple_target} worked.",
                    f"How did {simple_target} work step by step?",
                    f"What was the main flow behind {simple_target}, and which step mattered most?",
                )
                if not simplified
                else choose(
                    "Can you explain the main flow there?",
                    "What was the main process there?",
                    "What were the main steps there?",
                )
            )
        if family == "tool_method":
            return (
                choose(
                    f"What tool or method did you use in {simple_target}, and what did it do?",
                    f"What tool or method mattered most in {simple_target}, and why?",
                    f"Which tool or method helped most in {simple_target}, and what changed because of it?",
                )
                if not simplified
                else choose(
                    "Which tool or technology did you use?",
                    "Name one tool you used there.",
                    "What tool did you use in that work?",
                )
            )
        if family == "challenge_debugging":
            return (
                choose(
                    f"What challenge did you handle in {simple_target}, and what changed after it?",
                    f"What issue came up in {simple_target}, and what did you do?",
                    f"What problem in {simple_target} did you solve, and why did it matter?",
                )
                if not simplified
                else choose(
                    "What challenge did you handle there?",
                    "What problem came up there?",
                    "What issue did you solve there?",
                )
            )
        if family == "validation_metrics":
            return choose(
                "How did you check whether that was working well?",
                "What did you check to know that your work was improving?",
                "How did you validate that the result was getting better, and what did you notice?",
            )
        if family == "tradeoff_decision":
            return choose(
                "What choice did you make there, and why?",
                "What was one decision you made there, and what was the reason?",
                "What option did you choose there, and why did that choice help?",
            )
        if family == "communication_explain":
            return choose(
                "If you were explaining that project or idea to a classmate, how would you say it simply, and why would it matter?",
                "How would you explain that project or decision in simple words to someone new, then say why it mattered?",
                "Say that project or idea in a simple way, like you are explaining it to a new teammate, then say the impact.",
            )
        if family == "teamwork_pressure":
            return (
                choose(
                    "Tell me about a time you handled teamwork, pressure, or feedback well.",
                    "Share one time pressure or teamwork changed the decision you made.",
                    "Tell me about a situation where you had to stay calm and useful under pressure.",
                )
                if not simplified
                else choose(
                    "Tell me about one time pressure changed what you did.",
                    "Share one short teamwork or pressure example.",
                    "Tell me about one useful lesson from a team or deadline situation.",
                )
            )
        if family == "learning_growth":
            if any(term in simple_target.lower() for term in ["weakness", "growth area", "improving"]):
                return choose(
                    "What is one weakness or growth area you are actively improving right now?",
                    "What is one area you are working to improve, and what are you doing about it?",
                    "Tell me one weakness or growth area you are trying to improve right now.",
                )
            if any(term in simple_target.lower() for term in ["3 to 5 years", "five years", "ten years", "grow over the next"]):
                return choose(
                    "How do you want to grow over the next few years?",
                    "Where do you see yourself growing in the next 3 to 5 years?",
                    "What direction do you want your career to move toward over the next few years?",
                )
            return choose(
                "What is one thing you are actively improving right now?",
                "What skill or work habit are you trying to improve now?",
                "What are you learning or improving at the moment, and why does it matter for your next role?",
            )
        if family == "role_fit":
            lowered_target = simple_target.lower()
            if any(term in lowered_target for term in ["hire you", "team should hire you"]):
                return choose(
                    "Why should we hire you for the kind of role you want next?",
                    "What makes you someone a team should hire for this role?",
                    "Why would you be a strong hire for the role you want next?",
                )
            if any(term in lowered_target for term in ["stronger fit than", "better than other", "compared to others"]):
                return choose(
                    "What makes you a stronger fit than other entry-level candidates?",
                    "What makes you stand out from similar candidates for the role you want?",
                    "Why would a team choose you over other similar entry-level candidates?",
                )
            if any(term in lowered_target for term in ["strength", "ready for"]):
                return choose(
                    "What is one strength that makes you ready for the role you want next?",
                    "Which strength from your background best supports the role you want?",
                    "What strength do you think helps you most for your next role?",
                )
            return choose(
                "What kind of role are you preparing for next, and what from your background best supports it?",
                "What role are you aiming for next, and what in your background best supports it?",
                "Why does that kind of role feel like the right next step for you?",
            )
        if family == "closeout":
            return choose(
                "What is one thing you want an interviewer to remember about you?",
                "If an interviewer remembered one thing about you, what should it be?",
                "What final point would you want an interviewer to leave with about your fit?",
            )

    if family == "introduction":
        return choose(
            "Can you briefly introduce yourself and your background?",
            "Give me a short introduction about your background.",
            "Start with a quick introduction about yourself and your background.",
            "Introduce yourself with your background, strongest area, and goal.",
            "Briefly introduce yourself in a way that highlights your background and focus.",
        )
    if family == "studies_background":
        return choose(
            "What are you currently studying or focusing on right now?",
            "What part of your background or current studies is most relevant here?",
            "What are you currently learning, and where are you building confidence?",
        )
    if family == "ownership":
        if plan == "career":
            return (
                choose(
                    f"What exactly did you own in {simple_target}, and what changed because of your decision?",
                    f"In {simple_target}, what was clearly yours, and what impact followed from that?",
                    f"What did you personally own in {simple_target}, and what result changed after it?",
                )
                if not simplified
                else choose(
                    "What part did you personally own there?",
                    "What was clearly your responsibility there?",
                    "Which part was mainly yours?",
                )
            )
        return (
            choose(
                f"What exactly did you personally own in {simple_target}?",
                f"What part of {simple_target} was most clearly yours?",
                f"Walk me through the part of {simple_target} that you owned.",
            )
            if not simplified
            else choose(
                "What part did you personally own there?",
                "What was mainly your responsibility there?",
                "What did you personally handle there?",
            )
        )

    if family == "workflow_process":
        if plan == "career":
            return (
                choose(
                    f"Walk me through the architecture or workflow behind {simple_target}, then tell me the design choice that mattered most.",
                    f"What was the most important workflow or architecture choice in {simple_target}, and why?",
                    f"How did {simple_target} work end to end, and which design choice mattered most?",
                )
                if not simplified
                else choose(
                    "Walk me through the main flow there.",
                    "What was the main workflow there?",
                    "What was the key flow or design there?",
                )
            )
        return (
            choose(
                f"Walk me through how {simple_target} worked in practice.",
                f"What was the workflow behind {simple_target}?",
                f"How did {simple_target} work from input to output?",
            )
            if not simplified
            else choose(
                "Walk me through the main flow there.",
                "What was the main workflow there?",
                "Can you explain the process there?",
            )
        )
    if family == "tool_method":
        if plan == "career":
            return (
                choose(
                    f"What exactly did {simple_target} handle, and why was it the right fit for that work?",
                    f"What part of the work did {simple_target} handle, and why did you choose it?",
                    f"Why was {simple_target} the right method or tool for that part of the work?",
                )
                if not simplified
                else choose(
                    "What did that tool or method handle, and why did you use it?",
                    "What did it handle for you, and why was it useful?",
                    "What did that method do, and why was it a fit?",
                )
            )
        return (
            choose(
                f"What tool or method mattered most in {simple_target}, and why?",
                f"What exactly did {simple_target} do in that work?",
                f"Why was {simple_target} important in that work?",
            )
            if not simplified
            else choose(
                "What tool or method mattered most there?",
                "What did that tool or method do?",
                "Why did you use that tool or method?",
            )
        )
    if family == "challenge_debugging":
        if plan == "pro":
            return (
                choose(
                    f"What was the hardest issue you faced in {simple_target}, and how did you fix it?",
                    f"In {simple_target}, what problem did you fix and how?",
                    f"What issue in {simple_target} pushed your technical thinking the most?",
                )
                if not simplified
                else choose(
                    "What issue did you fix, and how?",
                    "Name one issue you fixed and the method you used.",
                    "What technical problem did you solve there?",
                )
            )
        if plan == "career":
            return (
                choose(
                    f"Tell me about a real challenge or constraint you faced in {simple_target}, and how you handled it.",
                    f"What challenge or constraint in {simple_target} tested your judgment most?",
                    f"In {simple_target}, what problem forced you to make a careful decision?",
                )
                if not simplified
                else choose(
                    "What challenge did you face, and what did you change?",
                    "What problem came up, and what did you do?",
                    "Name one challenge and the change you made.",
                )
            )
        return (
            f"What challenge did you solve in {simple_target}?"
            if not simplified
            else "Tell me about one problem you solved in a project."
        )
    if family == "validation_metrics":
        if plan == "career":
            return choose(
                "How did you validate that the result really improved, and what did those checks tell you?",
                "What did you measure or compare to know that change was actually better?",
                "How did you check that the outcome was reliable enough to trust?",
            )
        return choose(
            "How did you validate that the result really improved?",
            "What did you measure or compare to know the change was working?",
            "What checks did you use to know the result improved?",
        )
    if family == "tradeoff_decision":
        if plan == "career":
            return (
                choose(
                    "What trade-off or constraint tested your judgment most, and what final choice did you make?",
                    "What options were you balancing there, and why did you choose the final option?",
                    "What trade-off mattered most there, and why did you land on that choice?",
                )
                if not simplified
                else choose(
                    "What trade-off did you make, and why?",
                    "What choice did you make, and what drove it?",
                    "What options were you balancing there?",
                )
            )
        return choose(
            "What trade-off were you balancing there, and what did you choose?",
            "What decision were you balancing there, and why did you choose that option?",
            "What was the trade-off there, and how did you decide?",
        )
    if family == "teamwork_pressure":
        lowered_target = simple_target.lower()
        if any(term in lowered_target for term in ["conflict", "disagreement", "stakeholder"]):
            return choose(
                "Tell me about a time disagreement or feedback changed how you worked.",
                "Share one situation where you had to handle conflict or feedback well.",
                "Tell me about a time you had to align with someone who saw the work differently.",
                "How did you handle a disagreement with a teammate or stakeholder, and what was the result?",
            )
        if any(term in lowered_target for term in ["deadline", "pressure"]):
            return choose(
                "Tell me about a time pressure or a deadline changed how you worked.",
                "Share one example where time pressure affected your decision-making.",
                "Tell me about a deadline situation where you had to choose what mattered most.",
                "How did you prioritize when everything felt urgent at once?",
            )
        return choose(
            "Tell me about a time pressure, teamwork, or feedback changed how you worked.",
            "Share one example where pressure or teamwork affected your decision-making.",
            "Tell me about a time you had to handle a deadline, feedback, or team issue well.",
            "Tell me about a time you received feedback that was hard to hear — what did you do with it?",
            "What is one situation where you had to manage a conflict between what you thought was right and what the team wanted?",
        )
    if family == "learning_growth":
        lowered_target = simple_target.lower()
        if any(term in lowered_target for term in ["weakness", "growth area", "improving"]):
            return choose(
                "What is one weakness or growth area you are actively improving right now?",
                "What is one area you are trying to get better at right now, and how are you working on it?",
                "Tell me one weakness or growth area you are working on right now.",
                "What would your last manager or teammate say is your biggest area for improvement?",
            )
        if any(term in lowered_target for term in ["3 to 5 years", "five years", "ten years", "grow over the next"]):
            return choose(
                "Where do you see yourself growing over the next few years, and why?",
                "How do you want your work to grow over the next 3 to 5 years?",
                "What direction do you want your career to move toward over the next few years?",
                "Where do you see yourself in five years, and what steps are you taking to get there?",
            )
        return choose(
            "What is one skill or work habit you are actively improving right now?",
            "What are you improving at the moment, and how are you working on it?",
            "What is one area you are trying to get better at right now?",
            "If you could go back and redo one part of your recent work, what would you change and why?",
        )
    if family == "communication_explain":
        if plan == "pro":
            return choose(
                "Explain that project or decision clearly in practical terms, then tell me why it mattered.",
                "Explain that work in simple but precise terms, then tell me the impact.",
                "Explain that project clearly to a non-expert, then say why it mattered.",
            )
        if plan == "career":
            return choose(
                "Explain that project or decision so a non-technical interviewer could follow it, then tell me the real impact.",
                "Explain that work in simple terms first, then tell me why it mattered in practice.",
                "How would you explain that project clearly to a non-technical interviewer, and why did it matter?",
            )
        return choose(
            "Pick one part of your work and explain it in simple terms.",
            "How would you explain that project or idea clearly to someone outside your field?",
            "Say that work in practical terms first, then tell me why it mattered.",
        )
    if family == "role_fit":
        lowered_target = simple_target.lower()
        if any(term in lowered_target for term in ["hire you", "team should hire you"]):
            return choose(
                "Why should we hire you for the role you want next?",
                "What makes you someone a team should hire for this role?",
                "Why would you be a strong hire for this kind of role?",
                "If I asked your last teammate why we should hire you, what would they say?",
            )
        if any(term in lowered_target for term in ["stronger fit than", "better than other", "compared to others"]):
            return choose(
                "What makes you a stronger fit than other similar candidates?",
                "What makes you stand out from other entry-level candidates for this role?",
                "Why would a team pick you over other similar candidates for this role?",
                "What is one thing you bring that most other candidates at your level do not?",
            )
        if any(term in lowered_target for term in ["first priority", "first thing", "if you were hired", "focus on first"]):
            return choose(
                "If you were hired into this role, what would you focus on first and why?",
                "What would be your first priority if you joined this team, and why?",
                "If we hired you, what is the first thing you would want to improve or understand?",
            )
        if any(term in lowered_target for term in ["strength", "ready for"]):
            return choose(
                "What is one strength that makes you a good fit for the role you want next?",
                "Which strength from your background best supports the role you want?",
                "What strength do you think matters most for the role you want next?",
                "What is the one quality you are most confident will help you succeed in your next role?",
            )
        if any(term in lowered_target for term in ["trust you early", "add value early"]):
            return choose(
                "What from your background would make a team trust you early in that role?",
                "What would help you add value early if you joined that kind of role?",
                "What part of your experience would help you contribute quickly in that role?",
            )
        if any(term in lowered_target for term in ["interests you", "right next step", "fits the work you want"]):
            return choose(
                "Why does that kind of role feel like the right next step for you?",
                "Why are you targeting that role next, based on the work you enjoy most?",
                "What about that role fits the direction you want to grow in?",
            )
        if plan == "career":
            return choose(
                f"Why are you targeting {simple_target}, and what part of your background best proves that fit?",
                f"What makes you a strong fit for {simple_target} based on your work so far?",
                f"Which part of your background best shows that you fit {simple_target}?",
                f"Why should a hiring panel pick you for {simple_target} over other candidates with similar backgrounds?",
            )
        return choose(
            f"Why does your background fit {simple_target}?",
            f"What in your background makes you a fit for {simple_target}?",
            f"What part of your background is most relevant for {simple_target}?",
        )
    if family == "closeout":
        lowered_target = simple_target.lower()
        if any(term in lowered_target for term in ["first priority", "first thing", "if you were hired", "focus on first"]):
            return choose(
                "If you were hired into this role, what would you focus on first and why?",
                "What would be your first priority if you joined this team, and why?",
                "If we hired you, what is the first thing you would want to improve or understand?",
            )
        if any(term in lowered_target for term in ["first 30 days", "first month", "30 days", "90 days"]):
            return choose(
                "If you joined this role, what would your first 30 days look like?",
                "What would you want to learn or improve in your first month in that role?",
                "In your first 30 days, where would you focus first and why?",
            )
        if any(term in lowered_target for term in ["3 to 5 years", "five years", "ten years", "grow in this field"]):
            return choose(
                "Where do you see yourself growing over the next few years, and why?",
                "How do you want your career to grow over the next 3 to 5 years?",
                "What direction do you want your work to move toward over the next few years?",
                "If you were exactly where you wanted to be in five years, what would that look like?",
            )
        if plan == "career":
            return choose(
                "What should a hiring panel remember most about you after this round?",
                "What is the strongest reason a hiring panel should remember you?",
                "What one point would you want a hiring panel to leave with?",
                "If you could leave one lasting impression on this panel, what would it be?",
            )
        return choose(
            "What is one final point you want the interviewer to remember?",
            "What is one reason an interviewer should remember you?",
            "What final point would you leave with the interviewer?",
        )

    # ✅ ADDED: dispatch to new-family template helpers (Report §3.3, §3.4, §3.8).
    # Must come before the generic fallback return so these families get proper templates.
    if family == "situational_judgment":
        return _sjt_template(plan, simple_target, simplified, variant_index)
    if family == "creative_thinking":
        return _creative_template(plan, simple_target, simplified, variant_index)
    if family == "ai_tool_fluency":
        return _ai_fluency_template(plan, simple_target, simplified, variant_index)
    # ✅ ADDED: dispatch to the four new-family template helpers (PRO + CAREER).
    if family == "programming_language":
        return _programming_language_template(plan, simple_target, simplified, variant_index)
    if family == "skill_verification":
        return _skill_verification_template(plan, simple_target, simplified, variant_index)
    if family == "certification":
        return _certification_template(plan, simple_target, simplified, variant_index)
    if family == "self_assessment":
        return _self_assessment_template(plan, simple_target, simplified, variant_index)

    return (
        f"Can you walk me through {simple_target}?"
        if not simplified
        else "What technologies did you use, and why?"
    )


# ✅ ADDED: Template blocks for the three new rubric-category families (Report §3.3, §3.4, §3.8).
# These are reached by _question_template_for_category after all existing family checks
# fail — inserted before the generic final fallback above so new families get proper
# templates rather than the "walk me through..." catch-all.
def _sjt_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback SJT question when the model is unavailable (Report §3.3)."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    # Target is already a scenario description — frame it as a hypothetical
    lowered = target.lower()
    if "not contributing" in lowered or "team member" in lowered:
        return choose(
            "One of your teammates is not contributing before a key deadline. What do you do?",
            "A teammate is not pulling their weight with a deadline approaching. Walk me through how you handle that.",
            "You notice a team member is falling behind and the deadline is close. What is your next step?",
        )
    if "contradicting" in lowered or "two seniors" in lowered or "conflicting" in lowered:
        return choose(
            "Two people in authority give you contradicting instructions. How do you decide what to do?",
            "You get different instructions from two seniors. Walk me through how you proceed.",
            "Two people above you tell you to do opposite things. What is your next step?",
        )
    if "mistake after" in lowered or "error" in lowered or "already approved" in lowered:
        return choose(
            "You find a mistake in your work after it has already been approved and shared. What do you do next?",
            "Your work was approved, but you later spot an error. How do you handle that?",
            "After a deliverable is signed off, you find a problem. Walk me through your next steps.",
        )
    if "skip a step" in lowered or "cut a corner" in lowered or "adjust a number" in lowered:
        return choose(
            "You are asked to skip a required step to save time. How do you respond?",
            "A senior asks you to take a shortcut that you think could cause problems later. What do you do?",
            "You are under pressure to skip a quality check. Walk me through how you handle that.",
        )
    if "deadline" in lowered or "on time with gaps" in lowered:
        return choose(
            "You can deliver on time with some gaps, or late but complete. Which do you choose, and how do you communicate that?",
            "You face a choice between submitting on time with missing pieces or late but thorough. What do you decide and why?",
        )
    # Generic SJT frame
    if plan == "career":
        return choose(
            f"Imagine {target}. Walk me through how you would handle it and why.",
            f"Here is a situation: {target}. What is your first step, and what does your decision-making process look like?",
        )
    return choose(
        f"What would you do if {target}?",
        f"Here is a situation: {target}. What do you do next?",
        f"Walk me through how you would handle this: {target}.",
    )


def _creative_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback creative/lateral thinking question (Report §3.4)."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    lowered = target.lower()
    if "estimat" in lowered or "how many" in lowered or "fermi" in lowered:
        return choose(
            "Estimate the number of smartphones sold in India in a single day. Walk me through your reasoning step by step.",
            "Without looking it up, estimate how many software engineers are currently working in Bangalore. Show your working.",
            "Estimate how many litres of water a mid-sized Indian city uses in a day. Think out loud.",
        )
    if "sell" in lowered or "pitch" in lowered:
        return choose(
            "Sell me this pen. You have sixty seconds and zero preparation.",
            "Convince me to use your most-used app for one week, in under a minute.",
            "Pitch me your final-year project as if I am an investor with thirty seconds of attention.",
        )
    if "improve" in lowered or "redesign" in lowered or "product" in lowered:
        return choose(
            "Pick one app or process you use every day and tell me one specific improvement and why it matters.",
            "What is one thing you would change about how your college's placement process works, and why?",
            "Pick a tool you used in your project and tell me one thing you would design differently.",
        )
    if "analogy" in lowered or "household" in lowered or "metaphor" in lowered:
        return choose(
            "If you were a household object, what would you be and why — connect it to how you actually work.",
            "Explain what you do technically using an analogy that anyone could understand.",
            "Use an everyday object as a metaphor for the most important thing you built in your project.",
        )
    if "no budget" in lowered or "no internet" in lowered or "constraint" in lowered:
        return choose(
            "How would you solve your most recent project problem if you had no budget and no internet access?",
            "You have to redo your final-year project with zero external tools or libraries. Where do you start?",
        )
    if plan == "career":
        return choose(
            f"Here is a thinking challenge: {target}. Walk me through your approach.",
            f"Think out loud: {target}.",
        )
    return choose(
        f"Let me give you a quick thinking question: {target}. Walk me through how you approach it.",
        f"No right answer here — think out loud: {target}.",
    )


def _ai_fluency_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback AI tool fluency question (Report §3.8)."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    lowered = target.lower()
    if "how you use" in lowered or "chatgpt" in lowered or "copilot" in lowered:
        return choose(
            "How do you use AI tools like ChatGPT or Copilot in your actual project or study work? Give me a specific example.",
            "Walk me through one specific time you used an AI tool in a project. What did you do with the output?",
            "Which AI tools do you use regularly, and what do you actually use them for? Be specific.",
        )
    if "verify" in lowered or "check" in lowered or "correct" in lowered or "validate" in lowered:
        return choose(
            "How do you check whether an AI-generated answer or piece of code is actually correct?",
            "Walk me through how you verify AI output before you use it.",
            "Give me a specific example of a time you caught an AI tool being wrong. How did you spot it?",
        )
    if "not use" in lowered or "choose not" in lowered or "limit" in lowered or "boundary" in lowered:
        return choose(
            "When would you choose not to use AI for a task, and why?",
            "What kinds of tasks do you think AI tools are not suited for? Give me a real example.",
            "Where do you draw the line on using AI in your work? Walk me through your thinking.",
        )
    if "integrity" in lowered or "genuinely yours" in lowered or "own" in lowered or "disclose" in lowered:
        return choose(
            "How do you make sure that work you completed with AI help is still genuinely yours?",
            "Where do you draw the line between using AI as a tool and letting it do your thinking for you?",
            "If someone asked whether a piece of work was yours, how do you answer when AI was involved?",
        )
    if plan == "career":
        return choose(
            "Walk me through your honest, day-to-day use of AI tools in your work or study — the specifics, not the general idea.",
            "How has your use of AI tools actually changed how you work? Give me a concrete example.",
        )
    return choose(
        "Tell me honestly — how do you use AI tools in your studies or projects, and how do you check the results?",
        "Give me a real example of using an AI tool in your work and what you did with the output.",
    )


# ✅ ADDED: Template blocks for the four new families (PRO + CAREER only).
# Reached by _question_template_for_category after all existing family checks, so
# these families get grounded questions instead of the generic "walk me through" catch-all.
def _programming_language_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback programming-language knowledge question."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    subject = target.strip() or "the programming language you know best"
    if simplified:
        return choose(
            f"Tell me one thing you understand well about {subject}, with an example.",
            f"What is one feature of {subject} you have actually used, and what for?",
        )
    if plan == "career":
        return choose(
            f"Let's go deep on {subject}. Pick one concept you have used in real code and explain how it works under the hood.",
            f"On {subject}, tell me about a specific feature you relied on and one common mistake people make with it.",
            f"For {subject}, explain one thing you have to reason about carefully for correctness or performance, with a real example.",
        )
    return choose(
        f"Let's talk about {subject}. Explain one concept you have used and how it actually works.",
        f"On {subject}, what is one feature you rely on, and when would you avoid it?",
        f"Give me a concrete example of something you built with {subject}, and one tricky part of the language you hit.",
    )


def _skill_verification_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback skill-verification question — prove a declared resume skill."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    subject = target.strip() or "one skill from your resume"
    if simplified:
        return choose(
            f"Let's check {subject} — tell me one real thing you have done with it.",
            f"What is one thing about {subject} you are confident explaining?",
        )
    if plan == "career":
        return choose(
            f"Let's pressure-test {subject}. Walk me through the most advanced thing you have actually done with it.",
            f"On {subject}, where would you honestly rate yourself, and what specific work backs that up?",
            f"Take {subject} and explain a real problem you solved with it, end to end.",
        )
    return choose(
        f"Let's verify {subject}. Tell me about the deepest thing you have actually done with it.",
        f"On {subject}, what can you do confidently, and where do you still have gaps?",
        f"Give me a concrete example that proves your level with {subject}.",
    )


def _certification_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback certification question — what was learned and applied."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    subject = target.strip() or "a certification, course, or credential you completed"
    if simplified:
        return choose(
            f"Tell me one useful thing you learned from {subject}.",
            f"What made you take {subject}, and what did you get out of it?",
        )
    if plan == "career":
        return choose(
            f"Let's talk about {subject}. Beyond the certificate itself, what did you genuinely learn, and where have you applied it?",
            f"On {subject}, give me a concrete example of using what it taught you in real work.",
            f"What made you pursue {subject}, and what is one thing from it you now use regularly?",
        )
    return choose(
        f"Let's talk about {subject}. What did you actually learn, and where have you used it?",
        f"On {subject}, give me one concrete example of applying what you learned.",
        f"What is the most useful thing {subject} taught you, and how do you use it?",
    )


def _self_assessment_template(plan: str, target: str, simplified: bool, variant_index: int) -> str:
    """Fallback self-assessment question — self-rating AND self-critique angles."""
    def choose(*options: str) -> str:
        usable = [o for o in options if o]
        return usable[variant_index % len(usable)] if usable else ""

    subject = target.strip() or "rating your strongest skill honestly and justifying that score"
    if simplified:
        return choose(
            "On a scale of 1 to 10, how would you rate your strongest skill, and why that number?",
            "Where would you rate yourself right now, and what would push that number higher?",
        )
    if plan == "career":
        return choose(
            f"Let's do an honest self-assessment: {subject}. Be specific about the evidence.",
            "On a scale of 1 to 10, rate yourself on your strongest skill, then justify that exact number with real proof.",
            "Where do you think you over-estimate or under-estimate yourself, and what makes you say that?",
        )
    return choose(
        f"Give me an honest self-assessment: {subject}.",
        "On a scale of 1 to 10, how would you rate your strongest skill, and what evidence justifies that score?",
        "What is one area where your self-rating and a manager's rating might differ, and why?",
    )


def _adapt_question_for_difficulty(
    question: str,
    plan: str,
    category: str,
    difficulty_mode: str = "auto",
    planned_difficulty: str = "medium",
) -> str:
    """Shift fallback question wording based on the selected session difficulty."""
    selected_mode = normalize_difficulty_mode(difficulty_mode)
    if not question or selected_mode == "auto":
        return question

    normalized_category = _normalize_plan_category(category, fallback="communication_explain")
    normalized_planned_difficulty = _normalize_plan_difficulty(planned_difficulty or "medium")

    if selected_mode == "basic":
        basic_variants = {
            "introduction": "Give me a short introduction with your background and the kind of role you want next.",
            "studies_background": "What are you currently studying or focusing on right now?",
            "ownership": "What part of that project or work was mainly yours?",
            "workflow_process": "How did that work in simple steps?",
            "tool_method": "What tool or method did you use there, and what did it do?",
            "challenge_debugging": "What problem did you handle there, and what changed after it?",
            "validation_metrics": "How did you check whether it was working?",
            "tradeoff_decision": "What choice did you make there, and why?",
            "communication_explain": "Say that project or idea in simple words, like you are explaining it to a new teammate.",
            "teamwork_pressure": "Tell me about one time you handled pressure or teamwork well.",
            "learning_growth": "What are you improving right now?",
            "role_fit": "What kind of role do you want next, and what makes it fit you?",
            "closeout": "If an interviewer remembered one thing about you, what should it be?",
        }
        return basic_variants.get(normalized_category, question)

    if selected_mode == "medium" and plan in {"pro", "career"} and normalized_planned_difficulty == "easy":
        medium_variants = {
            "introduction": "Give me a short introduction focused on your background, strongest skill, and goal.",
            "studies_background": "What part of your background or studies matters most for this kind of role?",
            "ownership": "What part of that work did you personally own, and why did it matter?",
            "workflow_process": "Walk me through the workflow and point out the step that mattered most.",
            "tool_method": "What tool or method mattered most there, and why did it fit?",
            "challenge_debugging": "What was the main issue there, and how did you resolve it?",
            "validation_metrics": "How did you validate that the result improved?",
            "tradeoff_decision": "What trade-off or decision mattered most there, and why?",
            "communication_explain": "Explain one decision clearly and tell me why it mattered.",
            "teamwork_pressure": "Tell me about a time ownership or pressure changed how you worked.",
            "learning_growth": "What are you improving right now, and how are you working on it?",
            "role_fit": "Why does your background fit the kind of role you want next?",
            "closeout": "What should an interviewer remember about you after this round?",
        }
        return medium_variants.get(normalized_category, question)

    if selected_mode == "difficult":
        difficult_variants = {
            "free": {
                "introduction": "Give me a quick introduction that highlights your background, strongest skill, and career goal.",
                "ownership": "What part of that project or work was clearly yours, and what outcome are you most confident explaining?",
                "workflow_process": "Walk me through the main flow there, then name the step that mattered most.",
                "tool_method": "What tool or method mattered most there, and why was it the right choice?",
                "challenge_debugging": "What challenge tested you most there, and what changed after your fix?",
                "communication_explain": "Explain one decision simply, then tell me why it mattered.",
                "teamwork_pressure": "Tell me about a time you learned quickly under pressure or ownership.",
            },
            "pro": {
                "introduction": "Give me a short introduction focused on your background, strongest technical skill, and target role.",
                "ownership": "What did you own end to end there, and which decision was clearly yours?",
                "workflow_process": "Walk me through the workflow and name the design choice that mattered most.",
                "tool_method": "What method or tool mattered most there, and why was it the right fit?",
                "challenge_debugging": "What was the hardest failure or bug there, and how did you validate the fix?",
                "validation_metrics": "What did you measure or compare to know the result truly improved?",
                "tradeoff_decision": "What trade-off were you balancing, and what final choice did you make?",
                "communication_explain": "Explain one technical decision, why you made it, and what changed.",
                "teamwork_pressure": "Tell me about a time ownership or pressure changed your technical approach.",
            },
            "career": {
                "introduction": "Introduce yourself in a way that shows why a hiring panel should remember you.",
                "ownership": "What did you personally own there, what decision was clearly yours, and what changed after it?",
                "workflow_process": "Walk me through the architecture or workflow, then tell me the design choice that mattered most.",
                "tool_method": "What method or tool was crucial there, and why was it the right fit for the work?",
                "challenge_debugging": "What constraint or failure tested your judgment most, and what final choice did you make?",
                "validation_metrics": "How did you validate that the result really improved, and what did that evidence tell you?",
                "tradeoff_decision": "What trade-off mattered most there, and why did you land on that final choice?",
                "communication_explain": "Explain that project or decision clearly for a non-technical interviewer, then tell me the real impact.",
                "teamwork_pressure": "Tell me about a time pressure, ownership, or feedback changed your decision-making.",
                "role_fit": "Which part of your background best proves you fit the role you want next?",
                "closeout": "What should a hiring panel remember most about you after this round?",
            },
        }
        return difficult_variants.get(plan, difficult_variants["free"]).get(normalized_category, question)

    return question


def _build_question_preamble(
    plan: str,
    category: str,
    variant_seed: int = 0,
    is_followup: bool = False,
    is_retry: bool = False,
) -> str:
    """Return a 1-sentence context intro for a new-topic question.

    Preambles are only added to the first question on a new topic.
    Follow-ups and retries skip the preamble to stay conversational.
    """
    if is_followup or is_retry:
        return ""

    from app.services.prompts import QUESTION_PREAMBLE_TEMPLATES

    normalized_plan = (plan or "free").lower().strip()
    normalized_category = _normalize_plan_category(category, fallback="communication_explain")
    plan_templates = QUESTION_PREAMBLE_TEMPLATES.get(normalized_plan, QUESTION_PREAMBLE_TEMPLATES.get("free", {}))
    family_options = plan_templates.get(normalized_category, [])
    if not family_options:
        return ""
    return family_options[variant_seed % len(family_options)]


def _render_question_template(
    category: str,
    target: str,
    silence_count: int,
    plan: str,
    style_hint: str = "",
    planned_difficulty: str = "medium",
    difficulty_mode: str = "auto",
    is_followup: bool = False,
    is_retry: bool = False,
    variant_seed: int = 0,
) -> str:
    """Build one fallback question with session difficulty adjustments and context preamble."""
    question = _question_template_for_category(
        category=category,
        target=target,
        silence_count=silence_count,
        plan=plan,
        style_hint=style_hint,
        variant_seed=variant_seed,  # ✅ ADDED: was missing — variant_seed was accepted by
        # _render_question_template but never forwarded, making it dead at the choose() level.
    )
    question = _adapt_question_for_difficulty(
        question=question,
        plan=plan,
        category=category,
        difficulty_mode=difficulty_mode,
        planned_difficulty=planned_difficulty,
    )
    preamble = _build_question_preamble(
        plan=plan,
        category=category,
        variant_seed=variant_seed,
        is_followup=is_followup,
        is_retry=is_retry,
    )
    if preamble and question:
        return f"{preamble} {question}"
    return question


def _select_live_difficulty_signal(
    inferred_signal: str,
    difficulty_mode: str,
    is_timeout: bool,
    is_idk: bool,
    silence_count: int,
) -> str:
    """Blend the live answer signal with the user-selected session difficulty mode."""
    selected_mode = normalize_difficulty_mode(difficulty_mode)
    if selected_mode == "auto":
        return inferred_signal
    if selected_mode == "basic":
        return "easier"
    if selected_mode == "medium":
        if is_timeout or is_idk or silence_count >= 1:
            return "easier"
        return "steady" if inferred_signal == "easier" else inferred_signal
    if selected_mode == "difficult":
        if is_timeout or is_idk or silence_count >= 1:
            return "steady"
        return "harder"
    return inferred_signal


def _infer_difficulty_signal(user_text: str, is_timeout: bool, is_idk: bool, silence_count: int) -> str:
    """Infer whether the next question should get easier, stay steady, or get harder."""
    if is_timeout or is_idk or silence_count >= 1:
        return "easier"

    normalized = normalize_transcript(user_text or "")
    word_count = len([word for word in normalized.split() if word.strip()])

    if word_count >= 45:
        return "harder"
    if word_count <= 10:
        return "easier"
    return "steady"


def _build_pro_followup_hint(previous_question: str, user_text: str, resume_summary: dict | None = None) -> str:
    """Suggest a sharper Pro follow-up chain based on the last answer."""
    normalized = normalize_transcript(user_text or "", aggressive=True).lower()
    previous_question_lower = (previous_question or "").lower()
    previous_family = _question_family_from_text(previous_question)
    signals = _answer_signal_profile(user_text)
    facts = _extract_answer_anchor_facts(user_text, resume_summary or {})

    if not normalized:
        return ""

    if previous_family == "introduction":
        if facts.get("project_name") and facts.get("metric_claim"):
            return "If appropriate, anchor the follow-up to that exact claim, such as the project name plus the metric or result they just mentioned."
        if signals["mentions_project"] and (signals["mentions_decision"] or signals["mentions_ownership"]):
            return "If appropriate, move straight to ownership or proof instead of asking another background question."
        return "If appropriate, ask for one project, practical example, or decision that proves the background claim."
    if previous_family == "studies_background" and (signals["mentions_project"] or signals["mentions_method"] or signals["mentions_role_goal"]):
        return "If appropriate, the candidate already covered current focus, so ask for a project, proof point, or decision instead of re-asking studies."
    if previous_family == "role_fit":
        if signals["mentions_project"] and signals["mentions_outcome"]:
            return "If appropriate, ask for the exact decision or result that proves the role fit instead of repeating role-fit wording."
        return "If appropriate, ask which project, ownership area, or strength best proves that role fit."
    if previous_family == "teamwork_pressure":
        if signals["mentions_decision"] and signals["mentions_outcome"]:
            return "If appropriate, ask what changed in how they work now, rather than repeating the same pressure question."
        return "If appropriate, ask what decision changed under pressure and what result followed."
    if previous_family == "learning_growth":
        return "If appropriate, ask how the candidate is actively improving that area in practice."
    if any(term in normalized for term in ["hallucination", "unsupported", "wrong output"]):
        return "If appropriate, ask which exact mitigation method they used to reduce hallucination."
    if any(term in normalized for term in ["mitigation", "prompt", "filter", "source-aware", "grounded"]):
        return "If appropriate, ask what stress tests or adversarial cases they used to validate that mitigation."
    if any(term in normalized for term in ["adversarial", "stress test", "tested", "test case"]):
        return "If appropriate, ask how they measured whether that testing actually improved the system."
    if any(term in normalized for term in ["metric", "metrics", "accuracy", "latency", "benchmark", "precision", "recall"]):
        return "If appropriate, ask what trade-off or design decision those metrics influenced."
    if any(term in normalized for term in ["owned", "ownership", "built", "changed", "implemented"]):
        return "If appropriate, ask what exactly they personally built, changed, or were responsible for in that flow."
    if any(term in normalized for term in ["rag", "retrieval", "pipeline", "workflow", "embedding", "vector"]):
        return "If appropriate, ask them to walk through the pipeline stage by stage and explain the technical decision behind one stage."
    if "how" in previous_question_lower and len(normalized.split()) <= 8:
        return "If the answer stays short, ask for one concrete method, tool, or result instead of repeating the same question."
    return ""


def _build_free_followup_hint(previous_question: str, user_text: str, resume_summary: dict | None = None) -> str:
    """Guide the live model toward a warmer, answer-aware Free follow-up."""
    normalized = normalize_transcript(user_text or "", aggressive=True).lower()
    previous_family = _question_family_from_text(previous_question)
    signals = _answer_signal_profile(user_text)
    facts = _extract_answer_anchor_facts(user_text, resume_summary or {})

    if not normalized:
        return ""

    if previous_family == "introduction":
        if facts.get("project_name") and facts.get("metric_claim"):
            return "If appropriate, use the project and metric claim directly in the next question so it feels like a real interviewer follow-up."
        if signals["mentions_degree"] and signals["mentions_role_goal"]:
            return "If appropriate, do not ask for studies again; ask for one easy project, proof point, or role-fit example next."
        if signals["mentions_project"]:
            return "If appropriate, ask about the project they just mentioned in plain language instead of repeating background."
    if previous_family == "studies_background" and (signals["mentions_project"] or signals["mentions_role_goal"]):
        return "If appropriate, move to one project, method, or role-fit example instead of asking about studies again."
    if previous_family == "teamwork_pressure" and signals["mentions_outcome"]:
        return "If appropriate, ask what they learned or what changed after that experience."
    if previous_family == "learning_growth" and signals["mentions_role_goal"]:
        return "If appropriate, ask why that growth area matters for the role they want next."
    if previous_family == "role_fit" and signals["mentions_project"]:
        return "If appropriate, ask for the one project result that best proves the role fit."
    return ""


def _build_pro_followup_question(previous_question: str, user_text: str, resume_summary: dict | None = None) -> str:
    """Deterministic Pro follow-up if the live model is unavailable."""
    normalized = normalize_transcript(user_text or "", aggressive=True).lower()
    previous_question_lower = (previous_question or "").lower()
    previous_family = _question_family_from_text(previous_question)
    signals = _answer_signal_profile(user_text)
    summary = _coerce_resume_summary_dict(resume_summary or {})
    facts = _extract_answer_anchor_facts(user_text, summary)
    project_name = facts.get("project_name") or ""
    metric_claim = facts.get("metric_claim") or ""
    outcome_phrase = facts.get("outcome_phrase") or ""
    target_role = facts.get("target_role") or _resume_target_role(summary)

    # Resume-derived fallbacks so questions are NEVER vague
    primary_proj = _resume_primary_project(summary)
    primary_project_name = (primary_proj.get("name") or "").strip() if primary_proj else ""
    primary_skill = _resume_primary_skill(summary)
    subject = project_name or primary_project_name or (f"your {primary_skill} work" if primary_skill else "your strongest project")

    if previous_family == "introduction":
        if project_name and metric_claim:
            return f"In {project_name}, you said {metric_claim}. What did you change, and how did you verify it?"
        if signals["mentions_project"] and signals["mentions_decision"] and signals["mentions_outcome"]:
            return f"In {subject}, what exactly did you personally own, and what changed because of your decision?"
        if signals["mentions_project"] and (signals["mentions_ownership"] or signals["mentions_decision"]):
            return f"In {subject}, what exactly did you personally own, and what changed because of your decision?"
        if signals["mentions_role_goal"] and signals["mentions_strength"]:
            return f"What project, result, or decision best proves that strength for {target_role}?"
        if signals["mentions_degree"] and signals["mentions_project"]:
            return f"From your work on {subject}, which result or decision best proves that background?"
        if signals["mentions_degree"] and signals["mentions_role_goal"]:
            return f"What project or decision best proves that you are moving toward {target_role}?"
        if signals["mentions_degree"]:
            if primary_project_name:
                return f"I noticed you worked on {primary_project_name}. Which result or decision from that project best proves your background?"
            return f"Which project or practical example best proves {'your ' + primary_skill + ' background' if primary_skill else 'that background'}?"
        return f"Which project, internship, or practical example best proves {'your ' + primary_skill + ' background' if primary_skill else 'your background'}?"
    if previous_family == "studies_background":
        if project_name and metric_claim:
            return f"In {project_name}, you mentioned {metric_claim}. How did you know that result was real?"
        if signals["mentions_project"] and signals["mentions_workflow"]:
            return f"Walk me through the {subject} workflow and tell me which step mattered most."
        if signals["mentions_project"] and (signals["mentions_decision"] or signals["mentions_ownership"]):
            return f"What exactly did you own in {subject}, and what result changed after your decision?"
        if signals["mentions_project"] or signals["mentions_method"]:
            return f"From your work on {subject}, which result or example best shows that focus in action?"
        if primary_project_name:
            return f"I noticed you worked on {primary_project_name}. How does that project connect to what you are studying right now?"
        return f"What project, internship, or practical example best connects to {'your ' + primary_skill + ' studies' if primary_skill else 'what you are studying right now'}?"
    if previous_family == "role_fit":
        if project_name and outcome_phrase:
            return f"From {project_name}, what result best proves you are ready for {target_role}?"
        if any(term in previous_question_lower for term in ["hire", "stronger fit", "compared to"]) and signals["mentions_project"] and signals["mentions_outcome"]:
            return f"If you joined {target_role}, what would you focus on first and why?"
        if signals["mentions_project"] and signals["mentions_outcome"]:
            return f"What specific decision or result from {subject} best proves you fit {target_role}?"
        return f"Which project or decision best proves that you fit {target_role}?"
    if previous_family == "ownership":
        if project_name and outcome_phrase:
            return f"In {project_name}, why did {outcome_phrase} matter to the user, team, or product?"
        return f"In {subject}, what changed in the result because of your decision?"
    if previous_family == "workflow_process":
        if project_name and metric_claim:
            return f"In {project_name}, what change led to {metric_claim}, and why did you choose it?"
        return f"In {subject}, which design choice mattered most, and why did you make it?"
    if previous_family == "validation_metrics":
        if metric_claim:
            return f"You said {metric_claim}. Can you explain what you changed to get that result, and how you measured the improvement?"
        if signals["mentions_validation"] and signals["mentions_outcome"]:
            return f"In {subject}, how would those metrics influence whether you ship, change, or reject that approach?"
        return f"In {subject}, what exactly did you measure, and what did those numbers tell you about your work?"
    if previous_family == "tradeoff_decision":
        if project_name and outcome_phrase:
            return f"In {project_name}, what changed in the final result because of that trade-off?"
        if signals["mentions_decision"] and signals["mentions_outcome"]:
            return f"Looking back at {subject}, would you make the same trade-off again, and why?"
        return f"In {subject}, what constraint forced that trade-off, and what would you change next time?"
    if previous_family == "tool_method":
        if signals["mentions_method"] and signals["mentions_outcome"]:
            return f"In {subject}, what made that the right tool or method over the alternatives you considered?"
        return f"In {subject}, why was that the right choice over alternatives, and what result changed because of it?"
    if previous_family == "challenge_debugging":
        if metric_claim:
            return f"You mentioned {metric_claim}. How did you verify the fix actually worked?"
        return f"In {subject}, how did you know the fix actually solved the problem, and what would you do differently next time?"
    if previous_family == "teamwork_pressure":
        if signals["mentions_decision"] and signals["mentions_outcome"]:
            return "What did that situation teach you about how you handle pressure now?"
        return "What decision changed because of that pressure or teamwork situation?"
    if previous_family == "learning_growth":
        if signals["mentions_growth"] and (signals["mentions_method"] or signals["mentions_role_goal"]):
            return f"Why does improving that area matter for {target_role}?"
        return "How are you actively improving that in your current work or studies?"
    if previous_family == "communication_explain":
        if project_name and outcome_phrase:
            return f"In {project_name}, why would {outcome_phrase} matter to the user, team, or product?"
        return f"In {subject}, what practical impact did that change have on the user, team, or system?"
    if any(term in normalized for term in ["hallucination", "unsupported", "wrong output"]):
        return f"In {subject}, what exact method did you use to reduce hallucination?"
    if any(term in normalized for term in ["mitigation", "prompt", "filter", "source-aware", "grounded"]):
        return f"In {subject}, what stress tests or adversarial cases did you use to verify that mitigation?"
    if any(term in normalized for term in ["adversarial", "stress test", "tested", "test case"]):
        return f"In {subject}, how did you measure whether those tests actually improved the output quality?"
    if any(term in normalized for term in ["reduced", "improved", "increased", "decreased", "optimized"]):
        if metric_claim:
            return f"You said {metric_claim}. What specifically did you change, and how did you measure the improvement?"
        return f"In {subject}, can you walk me through what you changed and how you measured the improvement?"
    if any(term in normalized for term in ["metric", "metrics", "accuracy", "latency", "benchmark", "precision", "recall"]):
        return f"In {subject}, which trade-off or technical decision did those metrics help you make?"
    if any(term in normalized for term in ["owned", "ownership", "built", "changed", "implemented"]):
        return f"In {subject}, what exactly did you personally build or change?"
    if any(term in normalized for term in ["rag", "retrieval", "pipeline", "workflow", "embedding", "vector"]):
        return f"Walk me through the {subject} pipeline stage by stage, and tell me why you designed it that way."
    if "how" in previous_question_lower and len(normalized.split()) <= 8:
        return f"In {subject}, can you give one concrete tool, method, or result for that answer?"
    return ""


def _build_career_followup_hint(previous_question: str, user_text: str, resume_summary) -> str:
    normalized = normalize_transcript(user_text or "", aggressive=True).lower()
    resume_blob = json.dumps(resume_summary).lower() if isinstance(resume_summary, dict) else str(resume_summary).lower()
    previous_question_lower = (previous_question or "").lower()
    previous_family = _question_family_from_text(previous_question)
    signals = _answer_signal_profile(user_text, resume_summary)
    facts = _extract_answer_anchor_facts(user_text, resume_summary)

    if previous_family == "introduction":
        if facts.get("project_name") and (facts.get("metric_claim") or facts.get("outcome_phrase")):
            return "If appropriate, ask a hiring-style follow-up anchored to the exact project and claim the candidate just mentioned."
        if signals["mentions_project"] and (signals["mentions_decision"] or signals["mentions_ownership"]):
            return "If appropriate, move from introduction to proof, ownership, or hiring justification instead of asking another background variation."
        return "If appropriate, ask which strength, project, or result most clearly proves why the panel should remember them."
    if previous_family == "role_fit":
        if signals["mentions_project"] and signals["mentions_outcome"]:
            return "If appropriate, the fit claim already has raw proof, so ask for the strongest decision, outcome, or first-priority-if-hired angle next."
        return "If appropriate, ask why the team should hire them, what makes them stand out, or what they would focus on first if hired."
    if previous_family == "teamwork_pressure":
        if signals["mentions_decision"] and signals["mentions_outcome"]:
            return "If appropriate, ask what changed in how they work now, not just what happened in the moment."
        return "If appropriate, ask what exact decision changed under pressure and what result followed."
    if previous_family == "learning_growth":
        return "If appropriate, ask how that growth area affects the role they want next."
    if previous_family == "closeout":
        return "If appropriate, end the round or shift to one missing hiring dimension instead of asking another final-pitch variation."
    if any(term in normalized for term in ["fastapi", "api", "backend"]) or "fastapi" in resume_blob:
        return "If appropriate, ask about API design, async behavior, deployment, or why that backend choice fit the system."
    if any(term in normalized for term in ["rag", "retrieval", "grounding", "ranking"]) or "rag" in resume_blob:
        return "If appropriate, ask about retrieval quality, ranking, grounding, or how weak context was handled."
    if any(term in normalized for term in ["classification", "fake job", "false positive", "false negative"]):
        return "If appropriate, ask which features, checks, or evaluation signals mattered most and what trade-off appeared."
    if any(term in normalized for term in ["solo", "alone", "independently", "myself"]):
        return "If appropriate, ask how the candidate prioritized work, validated quality, and handled ownership alone."
    if any(term in previous_question_lower for term in ["role you want", "targeting", "why should we hire", "trust you", "fit the role"]):
        return "If appropriate, ask which specific project, decision, or result best proves that fit."
    if any(term in previous_question_lower for term in ["non-technical", "simple terms", "clear non-technical way"]):
        return "If appropriate, move to ownership, judgment, or impact next instead of asking for another simple explanation."
    if any(term in previous_question_lower for term in ["improving", "feedback", "weakness", "growth"]):
        return "If appropriate, ask what changed in their work after that learning or feedback."
    if any(term in previous_question_lower for term in ["trade-off", "constraint", "decision"]):
        return "If appropriate, ask what changed in the final result because of that decision."
    if any(term in previous_question_lower for term in ["measure", "metric", "evaluation"]):
        return "If appropriate, ask how those results would affect a hiring or production decision."
    return ""


def _build_career_followup_question(previous_question: str, user_text: str, resume_summary) -> str:
    normalized = normalize_transcript(user_text or "", aggressive=True).lower()
    resume_blob = json.dumps(resume_summary).lower() if isinstance(resume_summary, dict) else str(resume_summary).lower()
    previous_question_lower = (previous_question or "").lower()
    previous_family = _question_family_from_text(previous_question)
    summary = _coerce_resume_summary_dict(resume_summary or {})
    signals = _answer_signal_profile(user_text, resume_summary)
    facts = _extract_answer_anchor_facts(user_text, resume_summary)
    project_name = facts.get("project_name") or ""
    metric_claim = facts.get("metric_claim") or ""
    outcome_phrase = facts.get("outcome_phrase") or ""
    target_role = facts.get("target_role") or _resume_target_role(summary)

    # Resume-derived fallbacks so questions are NEVER vague
    primary_proj = _resume_primary_project(summary)
    primary_project_name = (primary_proj.get("name") or "").strip() if primary_proj else ""
    primary_skill = _resume_primary_skill(summary)
    subject = project_name or primary_project_name or (f"your {primary_skill} work" if primary_skill else "your strongest project")

    if previous_family == "introduction":
        if project_name and metric_claim:
            return f"In {project_name}, you said {metric_claim}. What did you change, and how did you verify it?"
        if signals["mentions_project"] and signals["mentions_decision"] and signals["mentions_outcome"]:
            if project_name and outcome_phrase:
                return f"In {project_name}, you helped produce {outcome_phrase}. Why does that make you a strong fit for {target_role}?"
            return f"Why should a team hire you for {target_role} instead of seeing you as only project-level potential?"
        if signals["mentions_project"] and (signals["mentions_decision"] or signals["mentions_ownership"]):
            return f"What decision or result from {subject} best proves why a hiring panel should remember you?"
        if signals["mentions_degree"] and signals["mentions_project"]:
            return f"From your work on {subject}, which result best proves you are ready for {target_role}?"
        if signals["mentions_degree"] and signals["mentions_role_goal"]:
            return f"Which project, strength, or result best proves you are ready for {target_role}?"
        if primary_project_name:
            return f"I noticed you worked on {primary_project_name}. What strength, decision, or result from that project would make a hiring panel remember you?"
        return f"What strength, project, or result would make a hiring panel remember you for {target_role}?"
    if previous_family == "role_fit":
        if project_name and metric_claim:
            return f"From {project_name}, what exactly led to {metric_claim}, and why would that matter to a team?"
        if any(term in previous_question_lower for term in ["hire", "stronger fit", "compared to"]):
            return f"If you were hired into {target_role}, what would you focus on first and why?"
        if signals["mentions_project"] and signals["mentions_decision"] and signals["mentions_outcome"]:
            return f"What decision from {subject} best shows your judgment and readiness for {target_role}?"
        if signals["mentions_project"] and signals["mentions_outcome"]:
            return f"What specific decision or result from {subject} best proves you are ready for {target_role}?"
        return f"Why should a team hire you for {target_role} instead of seeing you as only project-level potential?"
    if previous_family == "studies_background":
        if signals["mentions_project"] and signals["mentions_role_goal"]:
            return f"How does that learning make you more ready for {target_role}?"
        if signals["mentions_project"] or signals["mentions_method"]:
            return f"From your work on {subject}, which example best proves that learning is already turning into real work?"
        if primary_project_name:
            return f"Which part of your work on {primary_project_name} is becoming most useful in real project work?"
        return f"Which part of your current learning is becoming most useful in {'your ' + primary_skill + ' work' if primary_skill else 'real project work'}?"
    if previous_family == "ownership":
        if project_name and outcome_phrase:
            return f"In {project_name}, what result changed because of that decision, and what would you improve next?"
        return f"In {subject}, what changed in the result because of your decision, and what would you improve next?"
    if previous_family == "workflow_process":
        if project_name and metric_claim:
            return f"In {project_name}, what trade-off led to {metric_claim}, and why did you accept it?"
        return f"In {subject}, what trade-off or design choice mattered most, and why?"
    if previous_family == "teamwork_pressure":
        if signals["mentions_decision"] and signals["mentions_outcome"]:
            return "What did that experience change in how you work now?"
        return "What exact decision changed under that pressure, and what result followed from it?"
    if previous_family == "learning_growth":
        if any(term in previous_question_lower for term in ["five years", "ten years", "next few years"]):
            return "What kind of work or responsibility do you want to own as you grow?"
        if signals["mentions_growth"] and (signals["mentions_method"] or signals["mentions_role_goal"]):
            return f"How will that improvement make you more effective in {target_role}?"
        return f"How does that growth area matter for {target_role}, and what are you doing about it?"
    if previous_family == "closeout":
        return ""
    if previous_family == "communication_explain":
        if project_name and outcome_phrase:
            return f"In {project_name}, why would {outcome_phrase} matter to a hiring manager or product team?"
        if signals["mentions_project"] and signals["mentions_outcome"]:
            return f"What result or decision from {subject} best shows the value you would bring to a team?"
        if signals["mentions_outcome"]:
            return f"In {subject}, why would that outcome matter to a hiring manager or product team?"
        return f"In {subject}, what decision, trade-off, or outcome best shows your judgment?"
    if any(term in normalized for term in ["fastapi", "api", "backend"]) or "fastapi" in resume_blob:
        return f"In {subject}, what design or deployment choice mattered most in the backend work, and why?"
    if any(term in normalized for term in ["rag", "retrieval", "grounding", "ranking"]) or "rag" in resume_blob:
        return f"In {subject}, how did you judge whether the retrieval or grounding quality was actually good enough?"
    if any(term in normalized for term in ["classification", "fake job", "false positive", "false negative"]):
        return f"In {subject}, which signals or checks mattered most in that classification logic, and what trade-off did you see?"
    if any(term in normalized for term in ["solo", "alone", "independently", "myself"]):
        return f"When you were handling {subject} mostly on your own, how did you prioritize and validate what mattered first?"
    if any(term in previous_question_lower for term in ["role you want", "targeting", "why should we hire", "trust you"]):
        return f"From {subject}, which decision or result best proves that you are ready for {target_role}?"
    if any(term in previous_question_lower for term in ["non-technical", "simple terms", "clear non-technical way"]):
        return f"In {subject}, what decision, trade-off, or outcome best shows your judgment?"
    if any(term in previous_question_lower for term in ["improving", "feedback", "weakness", "growth"]):
        return "What changed in your work after that learning or feedback?"
    if any(term in previous_question_lower for term in ["trade-off", "constraint", "decision"]):
        return f"In {subject}, what changed in the result because of that decision, and what would you improve next?"
    if any(term in previous_question_lower for term in ["measure", "metric", "evaluation"]):
        return f"In {subject}, how would those metrics influence whether you would ship, change, or reject that approach?"
    return ""


def _is_probably_followup(previous_question: str, latest_user_text: str, plan_item: dict | None, plan: str) -> bool:
    """Estimate whether the next question should stay on the same topic."""
    previous = normalize_transcript(previous_question or "", aggressive=True).lower()
    latest = normalize_transcript(latest_user_text or "", aggressive=True).lower()
    target = normalize_transcript(str((plan_item or {}).get("target") or ""), aggressive=True).lower()
    previous_family = _question_family_from_text(previous_question)
    next_family = _normalize_plan_category(str((plan_item or {}).get("category") or previous_family), fallback="communication_explain")
    signals = _answer_signal_profile(latest_user_text)

    if not latest or not previous:
        return False

    technical_overlap = any(term in latest for term in TECHNICAL_SIGNAL_TERMS) and any(
        term in previous for term in TECHNICAL_SIGNAL_TERMS
    )
    target_overlap = bool(target and (target in latest or any(token and token in latest for token in target.split()[:4])))
    followup_cues = any(
        cue in previous
        for cue in ["how did", "what metric", "what challenge", "walk me through", "what exact", "why did", "trade-off"]
    )
    same_project_cues = any(term in latest for term in ["project", "pipeline", "workflow", "backend", "model", "summary"])

    if plan == "free":
        if previous_family in {"ownership", "workflow_process", "teamwork_pressure"} and not (
            signals["mentions_decision"] or signals["mentions_outcome"] or signals["mentions_team"]
        ):
            return True
        return False

    if previous_family in {"introduction", "studies_background"}:
        if signals["mentions_project"] or signals["mentions_decision"] or signals["mentions_ownership"] or signals["mentions_role_goal"]:
            return False
        return next_family == previous_family and target_overlap

    if previous_family == "role_fit":
        if signals["mentions_project"] and (signals["mentions_decision"] or signals["mentions_outcome"]):
            return False
        return next_family == previous_family and target_overlap

    if previous_family == "learning_growth":
        if signals["mentions_growth"] and (signals["mentions_method"] or signals["mentions_outcome"] or signals["mentions_role_goal"]):
            return False
        return next_family == previous_family and target_overlap

    if previous_family == "teamwork_pressure":
        return not (signals["mentions_decision"] and signals["mentions_outcome"])

    if previous_family == "ownership":
        return not signals["mentions_outcome"]

    if previous_family == "workflow_process":
        return not (signals["mentions_decision"] or signals["mentions_method"] or signals["mentions_outcome"])

    if previous_family == "validation_metrics":
        return not (signals["mentions_validation"] and signals["mentions_outcome"])

    if previous_family == "tradeoff_decision":
        return not (signals["mentions_decision"] and signals["mentions_outcome"])

    return technical_overlap or target_overlap or (followup_cues and same_project_cues)


def _should_force_topic_change(
    plan: str,
    consecutive_followups: int,
    silence_count: int,
    is_idk: bool,
    is_timeout: bool,
) -> bool:
    """Decide when to force the system away from the current topic."""
    cfg = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
    limit = max(1, int(cfg.get("followup_depth_limit", 1 if plan == "free" else 2)))
    if silence_count >= 3:
        return True
    if is_idk and consecutive_followups >= 1:
        return True
    if is_timeout and consecutive_followups >= 1:
        return True
    return consecutive_followups >= limit


def _is_repeat_request(text: str) -> bool:
    normalized = normalize_transcript(text or "", aggressive=True).lower().strip()
    if not normalized:
        return False

    if normalized in {"sorry", "pardon", "come again"}:
        return True

    if any(phrase in normalized for phrase in REPEAT_REQUEST_PHRASES):
        return True

    clarification_prefixes = (
        "what ",
        "which ",
        "do you",
        "are you",
        "can you",
        "could you",
        "should i",
        "am i",
        "sorry ",
    )
    clarification_terms = (
        "mean",
        "asking",
        "question",
        "clarify",
        "repeat",
        "rephrase",
        "explain",
        "example",
        "project",
        "role",
        "answer",
        "tell",
        "say",
        "clear",
        "simple",
    )
    has_question_shape = "?" in (text or "") or normalized.startswith(clarification_prefixes)
    if has_question_shape and len(normalized.split()) <= 18 and any(term in normalized for term in clarification_terms):
        return True

    return False


def _build_fallback_ai_response(
    plan: str,
    upcoming_turn: int,
    question_plan,
    resume_summary,
    silence_count: int,
    is_greeting: bool,
    difficulty_signal: str = "steady",
    previous_question: str | None = None,
    latest_user_text: str = "",
    asked_question_signatures: set[str] | None = None,
    asked_questions: list[str] | None = None,
    boost_prefix: str = "",
    difficulty_mode: str = "auto",
    preferred_plan_item: dict | None = None,
    avoid_families: set[str] | None = None,
) -> str:
    """Fallback interviewer response when the live model is delayed or unavailable."""
    asked_question_signatures = asked_question_signatures or set()
    asked_questions = asked_questions or []
    avoid_families = {family for family in (avoid_families or set()) if family in QUESTION_FAMILIES}

    if is_greeting:
        candidate_name = "Candidate"
        if isinstance(resume_summary, str):
            try:
                resume_summary = json.loads(resume_summary)
            except Exception:
                resume_summary = {}
        if isinstance(resume_summary, dict):
            candidate_name = _normalize_candidate_name(str(resume_summary.get("candidate_name") or "Candidate"))

        from app.services.interviewer_coverage import _build_opening_question
        opening_question = _build_opening_question(
            plan=plan,
            question_plan=question_plan,
            difficulty_mode=difficulty_mode,
            recent_question_signatures=asked_question_signatures,
            recent_questions=asked_questions,
        )
        return f"Hello {candidate_name}. I noticed {_resume_highlight(resume_summary)}. {opening_question}"

    planned_turn = preferred_plan_item or _get_next_plan_item(question_plan, upcoming_turn)
    category = str((planned_turn or {}).get("category") or "technical_depth")
    target = str((planned_turn or {}).get("target") or "your recent work")
    style_hint = str((planned_turn or {}).get("style_hint") or "")
    planned_difficulty = str((planned_turn or {}).get("difficulty") or "medium")
    if plan == "free" and previous_question and silence_count >= 1:
        question = _build_free_retry_question(previous_question, category, silence_count)
        return _merge_boost_with_question("", question)
    if plan == "pro" and previous_question and silence_count >= 1:
        question = _build_pro_retry_question(previous_question, category, silence_count)
        return _merge_boost_with_question("", question)
    if plan == "career" and previous_question and silence_count >= 1:
        question = _build_career_retry_question(previous_question, category, silence_count)
        return _merge_boost_with_question("", question)
    if plan == "free":
        question = _build_free_followup_question(previous_question or "", latest_user_text, resume_summary)
    elif plan == "pro":
        question = _build_pro_followup_question(previous_question or "", latest_user_text)
    elif plan == "career":
        question = _build_career_followup_question(previous_question or "", latest_user_text, resume_summary)
    else:
        question = ""

    if question and (
        _question_family_from_text(question) in avoid_families
        or _is_duplicate_question(question, asked_question_signatures, asked_questions)
        or _violates_family_repeat_rules(question, asked_questions, plan=plan)
    ):
        question = ""

    if not question:
        for candidate_item in _get_future_plan_items(question_plan, upcoming_turn):
            candidate_category = str(candidate_item.get("category") or category)
            if _normalize_plan_category(candidate_category, fallback="communication_explain") in avoid_families:
                continue
            candidate_target = str(candidate_item.get("target") or target)
            candidate_style_hint = str(candidate_item.get("style_hint") or style_hint)
            candidate_planned_difficulty = str(candidate_item.get("difficulty") or planned_difficulty)
            candidate_question = _render_question_template(
                category=candidate_category,
                target=candidate_target,
                silence_count=silence_count,
                plan=plan,
                style_hint=candidate_style_hint,
                planned_difficulty=candidate_planned_difficulty,
                difficulty_mode=difficulty_mode,
            )
            if not _is_duplicate_question(candidate_question, asked_question_signatures, asked_questions) and not _violates_family_repeat_rules(candidate_question, asked_questions, plan=plan):
                question = candidate_question
                break

    if not question:
        question = _render_question_template(
            category=category,
            target=target,
            silence_count=silence_count,
            plan=plan,
            style_hint=style_hint,
            planned_difficulty=planned_difficulty,
            difficulty_mode=difficulty_mode,
        )

    question = _adapt_question_for_difficulty(
        question=question,
        plan=plan,
        category=category,
        difficulty_mode=difficulty_mode,
        planned_difficulty=planned_difficulty,
    )

    if question and _violates_family_repeat_rules(question, asked_questions, plan=plan):
        question = _build_emergency_unique_question(
            plan,
            asked_question_signatures,
            asked_questions,
            difficulty_mode=difficulty_mode,
            avoid_families=avoid_families,
        )

    # ✅ FIXED: Removed dead `if plan == "free" and silence_count >= 1:` branch —
    # both paths returned the identical expression, so the condition was never
    # meaningful. Single unconditional return is cleaner and avoids confusion.
    return _merge_boost_with_question(boost_prefix, question)
