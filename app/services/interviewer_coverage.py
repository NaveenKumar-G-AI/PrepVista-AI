"""
PrepVista AI - Interviewer Coverage & Planning
Extracted from interviewer.py - session coverage planning, family sequence
generation, fallback plan construction, cross-session cooldown, and
opening question selection.

Re-exported by interviewer.py (barrel file) for backward compatibility.
"""

import json
import re
import random
from typing import Any

import structlog

from app.config import PLAN_CONFIG, SESSION_COVERAGE_TARGETS, get_settings, normalize_difficulty_mode, normalize_department
from app.database.connection import DatabaseConnection
from app.services.technical_taxonomy import get_technical_categories
from app.services.resume_parser import infer_resume_field_profile
from app.services.transcript import clean_for_display

from app.services.interviewer_constants import (
    QUESTION_FAMILIES,
    FIELD_FOCUS_ANGLES,
)
from app.services.interviewer_helpers import (
    _coerce_question_plan,
    _coerce_resume_summary_dict,
    _resume_field_profile,
    _resume_primary_project,
    _normalize_topic_label,
    _resume_target_role,
    _resume_primary_skill,
    _field_focus_angle,
)
from app.services.interviewer_question_engine import (
    _question_signature,
    _question_core_tokens,
    _normalize_plan_category,
    _normalize_plan_difficulty,
    _sanitize_plan_target,
    _normalize_generated_question_plan,
    _style_variant_index,
    _apply_question_style_hints,
    _is_duplicate_question,
    _resolve_item_difficulty,
    _plan_target_angle,
    _plan_target_signature,
)
from app.services.interviewer_templates import (
    _render_question_template,
    _adapt_question_for_difficulty,
)

logger = structlog.get_logger("prepvista.interviewer")

def _planned_turn_limit(plan: str, question_plan) -> int:
    """Use the stored plan length when available so session limits stay stable per interview."""
    normalized_plan = (plan or "free").lower().strip()
    planned_items = _coerce_question_plan(question_plan)
    if planned_items:
        return len(planned_items)
    cfg = PLAN_CONFIG.get(normalized_plan, PLAN_CONFIG["free"])
    return int(cfg.get("max_turns") or 0)


def _family_base_difficulty(family: str) -> str:
    if family in {"introduction", "studies_background"}:
        return "easy"
    if family in {"ownership", "workflow_process", "tool_method", "communication_explain", "teamwork_pressure", "learning_growth", "role_fit", "closeout"}:
        return "medium"
    return "hard"


def _rotate_question_families(families: list[str], variant_seed: int, *, keep_first: bool = True) -> list[str]:
    if not families:
        return []
    if keep_first and len(families) > 1:
        head = families[:1]
        tail = families[1:]
        offset = variant_seed % len(tail)
        return head + tail[offset:] + tail[:offset]
    offset = variant_seed % len(families)
    return families[offset:] + families[:offset]


def _pick_target_variant(options: list[str], variant_seed: int, offset: int = 0) -> str:
    cleaned = [item.strip() for item in options if item and item.strip()]
    if not cleaned:
        return ""
    return cleaned[(variant_seed + offset) % len(cleaned)]


def _compose_family_targets(plan: str, resume_summary: dict, variant_seed: int) -> dict[str, str]:
    summary = _coerce_resume_summary_dict(resume_summary)
    field_profile = _resume_field_profile(summary)
    target_role = _resume_target_role(summary)
    broad_field = str(field_profile.get("broad_field") or "general_fresher_mixed")
    education = [item for item in summary.get("education", []) if isinstance(item, str) and item.strip()]
    experience = [item for item in summary.get("experience", []) if isinstance(item, dict)]
    projects = [item for item in summary.get("projects", []) if isinstance(item, dict)]
    primary_project = _resume_primary_project(summary, index=variant_seed % max(1, min(2, len(projects) or 1)))
    secondary_project = _resume_primary_project(summary, index=1 if len(projects) > 1 else 0)
    primary_skill = _resume_primary_skill(summary)
    role_title = str(experience[0].get("title") or "").strip() if experience else ""
    primary_project_name = str((primary_project or {}).get("name") or "").strip()
    secondary_project_name = str((secondary_project or {}).get("name") or "").strip()
    primary_label = (
        f"your project {primary_project_name}"
        if primary_project_name
        else f"your experience as {role_title}"
        if role_title
        else "one project, internship, or practical example from your resume"
    )
    secondary_label = (
        f"your project {secondary_project_name}"
        if secondary_project_name and secondary_project_name != primary_project_name
        else "another project, internship, or practical example from your resume"
    )

    communication_options = (
        [
            "explaining your work clearly to a recruiter or non-technical interviewer",
            "explaining one technical decision in practical business terms",
            "turning one project decision into clear user or team impact",
            # ✅ ADDED: 3 more options — previously 3 so target repeated every 3 sessions
            "explaining one complex idea from your work in simple, audience-friendly language",
            "making one key project result understandable to a hiring manager with no technical background",
            "describing one workflow decision in terms of user value rather than technical steps",
        ]
        if plan == "career"
        else [
            "one decision from your work in simple terms",
            "one project detail in clear practical language",
            "one technical choice explained for a non-expert",
            # ✅ ADDED: 3 more options
            "one part of your project explained to someone without your background",
            "one key result from your work explained in plain, direct language",
            "one engineering or project tradeoff explained in business terms",
        ]
        if plan == "pro"
        else [
            "one part of your background or project in simple terms",
            "one thing you built explained clearly",
            "one project detail in beginner-friendly language",
            # ✅ ADDED: 3 more options
            "one study or project result explained in everyday language",
            "one skill or subject explained simply as if to a classmate outside your field",
            "one task or challenge explained so anyone can understand why it mattered",
        ]
    )
    if broad_field in {"non_technical_general", "business_analyst_operations", "design_creative"}:
        communication_options = (
            [
                "explaining your work clearly to a recruiter or stakeholder",
                "explaining one process improvement in simple business language",
                "making your work easy for a non-specialist to follow",
                # ✅ ADDED: 3 more options
                "turning one project outcome into a clear business impact story",
                "explaining one stakeholder interaction or decision in plain terms",
                "making one operational result easy to understand for a hiring manager",
            ]
            if plan == "career"
            else [
                "explaining your work, process, or impact clearly",
                "one stakeholder-facing example from your work",
                "one result from your work explained simply",
                # ✅ ADDED: 3 more options
                "one process or workflow improvement explained without jargon",
                "one business or operational result made clear for a non-expert",
                "one practical example from your work explained in everyday terms",
            ]
        )
    communication_target = _pick_target_variant(communication_options, variant_seed)

    teamwork_target = _pick_target_variant(
        (
            [
                "a deadline, feedback, or conflict that changed your decision",
                "one pressure or team situation that tested your judgment",
                "a moment when feedback changed how you worked next",
                # ✅ ADDED: 3 more options
                "one high-stakes team situation and how you handled your part",
                "a time you disagreed with a teammate and how you resolved it",
                "one moment when working under pressure improved your outcome",
            ]
            if plan == "career"
            else [
                "one deadline, feedback, or team situation that changed your decision",
                "a time pressure or teamwork changed what you did next",
                "one example where feedback or pressure affected your approach",
                # ✅ ADDED: 3 more options
                "one experience where a team challenge made you a better contributor",
                "a moment where you had to adjust your work because of someone else's feedback",
                "one time a tight deadline changed how you worked with others",
            ]
            if plan == "pro"
            else [
                "one teamwork, pressure, or feedback example you handled well",
                "a time pressure or teamwork changed what you did",
                "one example where you had to stay useful under pressure",
                # ✅ ADDED: 3 more options
                "one experience where working with others helped you do better work",
                "a moment where you had to adapt quickly because of a team or time challenge",
                "one situation where feedback or pressure pushed you to improve",
            ]
        ),
        variant_seed,
        offset=1,
    )
    learning_growth_target = _pick_target_variant(
        (
            [
                "one weakness or growth area you are actively improving",
                "one skill, habit, or weakness you are working on right now",
                "how you want to grow over the next 3 to 5 years",
                # ✅ ADDED: 3 more options
                "one professional habit or mindset you are actively developing",
                "a specific skill gap you identified and what you are doing about it",
                "the most important thing you want to be better at in your next role",
            ]
            if plan == "career"
            else [
                "one technical or professional area you are improving",
                "one skill or work habit you are trying to strengthen",
                "how you want your work to improve over the next few years",
                # ✅ ADDED: 3 more options
                "one gap in your current skills and your plan to address it",
                "one technical area you are studying or practising right now",
                "one lesson from a recent project that you are applying to your growth",
            ]
            if plan == "pro"
            else [
                "one skill or work habit you are actively improving",
                "one area you are learning or improving right now",
                "one quality you want to get better at next",
                # ✅ ADDED: 3 more options
                "one subject or skill you are working on to be more ready for work",
                "one thing that is hard for you right now and what you are doing about it",
                "one lesson from recent study or project work you are building on",
            ]
        ),
        variant_seed,
        offset=2,
    )
    role_fit_target = _pick_target_variant(
        (
            [
                f"why a team should hire you for {target_role}",
                f"what makes you a stronger fit than similar candidates for {target_role}",
                f"which part of your background best proves you fit {target_role}",
                f"why {target_role} is the right next step for you",
                f"what would make a hiring manager trust you early in {target_role}",
                # ✅ ADDED: 3 more options
                f"what result or decision best shows you are ready for {target_role}",
                f"what you would prioritise learning in your first 30 days in {target_role}",
                f"what specific strength of yours is hardest to find in other candidates for {target_role}",
            ]
            if plan == "career"
            else [
                f"why your background fits {target_role}",
                f"which project best proves you fit {target_role}",
                f"what strength makes you a good fit for {target_role}",
                f"why {target_role} fits the work you want to do next",
                f"what would help you add value early in {target_role}",
                # ✅ ADDED: 3 more options
                f"what experience makes you most confident about {target_role}",
                f"what part of your current skill set fits {target_role} best",
                f"how your background points naturally toward {target_role}",
            ]
            if plan == "pro"
            else [
                f"the role you want next and why your background fits it",
                f"one strength that makes you ready for {target_role}",
                f"what kind of role you want next and why it fits you",
                f"why {target_role} interests you next",
                # ✅ ADDED: 4 more options
                f"what from your background would help you grow in {target_role}",
                f"why you feel ready to take on {target_role} now",
                f"one project or example that connects directly to {target_role}",
                f"what you most want to learn or contribute in {target_role}",
            ]
        ),
        variant_seed,
        offset=3,
    )
    closeout_target = _pick_target_variant(
        (
            [
                "what your first priority would be if you were hired into this role",
                "what your first 30 days would look like if you joined this role",
                "the strongest reason a hiring panel should remember you",
                "how you want to grow in this field over the next 3 to 5 years",
                # ✅ ADDED: 4 more options
                "what one thing you bring that other candidates are unlikely to match",
                "what lasting impression you want to leave with the hiring panel",
                "how your background positions you to succeed where others might struggle",
                "what your proudest work decision says about how you will work in this role",
            ]
            if plan == "career"
            else [
                f"what you would focus on first in {target_role}",
                f"what you would try to improve in your first month in {target_role}",
                "the one point you want the interviewer to remember",
                f"why you would add value early in {target_role}",
                # ✅ ADDED: 4 more options
                "the single most important thing you want the interviewer to take away",
                f"what makes you confident you will contribute quickly in {target_role}",
                "what one proof point best sums up why you are ready",
                "the strongest thing you have said today that an interviewer should remember",
            ]
            if plan == "pro"
            else [
                "the next opportunity you are preparing for",
                "one reason an interviewer should remember you",
                "what you want to keep improving next",
                # ✅ ADDED: 4 more options
                "one thing that makes you stand out at your stage",
                "what you are most excited to learn in your first role",
                "the one strength you most want an interviewer to remember",
                "why you are ready to take the next step in your career",
            ]
        ),
        variant_seed,
        offset=4,
    )

    # ✅ ADDED: branch-aware technical framing (Report §6.3).
    # department_code comes from resume_summary["department"] → normalize_department().
    # get_technical_categories() returns the branch module (10 cats) or generic fallback.
    # We sample core_topics from the first non-niche category to make tool_method /
    # workflow_process / challenge_debugging questions sound like they belong to
    # the student's actual branch rather than defaulting to IT-flavoured framing.
    _dept_raw = str(summary.get("department") or "").strip()
    _dept_code = normalize_department(_dept_raw)
    _tech_cats = get_technical_categories(_dept_code)
    # Pick a core-weight category for this variant so even the same branch rotates topics
    _core_cats = [c for c in _tech_cats if c.get("weight_hint") != "niche"]
    _tech_cat_index = variant_seed % max(1, len(_core_cats))
    _picked_cat = _core_cats[_tech_cat_index] if _core_cats else {}
    _tech_topic = (_picked_cat.get("core_topics") or ["your technical work"])[0]
    _tech_label = _picked_cat.get("label") or "your technical work"
    # Build branch-appropriate angle text for downstream target slots
    _branch_workflow_target = (
        f"{_tech_topic} in {primary_label}"
        if _tech_topic and _tech_topic != "your technical work"
        else _field_focus_angle(summary, "workflow_process") + f" in {primary_label}"
    )
    _branch_tool_target = (
        f"your use of {_tech_topic}"
        if _tech_topic and _tech_topic != "your technical work"
        else (f"your work with {primary_skill}" if primary_skill else _field_focus_angle(summary, "tool_method"))
    )
    _branch_challenge_target = (
        f"a challenge with {_tech_topic} in {primary_label}"
        if _tech_topic and _tech_topic != "your technical work"
        else _field_focus_angle(summary, "challenge_debugging") + f" in {primary_label}"
    )

    # ✅ ADDED: target pools for situational_judgment, creative_thinking, ai_tool_fluency
    # (Report §3.3, §3.4, §3.8 — the three new rubric categories #15-17).
    # Resume-personalized where possible; branch-neutral by design (SJT/creative questions
    # test judgment, not domain knowledge).
    sjt_options = (
        [
            "how you would handle a team member who is not contributing before a deadline",
            "what you would do if two seniors gave you contradicting instructions",
            "how you would respond if you discovered a mistake after your work was already approved",
            "how you would handle a situation where a client or stakeholder is frustrated and unreasonable",
            "what you would do if you were asked to skip a step or cut a corner to save time",
            "how you would decide between delivering on time with gaps versus late but complete",
            "what you would do if you strongly disagreed with a decision your manager made",
        ]
        if plan in {"pro", "career"}
        else [
            "how you would handle a teammate who is not doing their part",
            "what you would do if two people gave you different instructions",
            "how you would handle finding a mistake in work that was already submitted",
            "what you would do if you had more tasks than time to finish them",
            "how you would respond to a very difficult or unreasonable person",
        ]
    )
    creative_options = (
        [
            f"estimating a real-world quantity related to {_tech_label}",
            "selling or pitching an idea quickly under zero preparation",
            f"how you would improve one common tool or process in {_tech_label}",
            "solving a familiar problem with no budget and no internet",
            f"an analogy that explains {_tech_label} to a non-technical person",
            "thinking through a pattern or constraint problem out loud",
        ]
        if plan in {"pro", "career"}
        else [
            "estimating a simple real-world quantity step by step",
            "explaining something in your field using an analogy",
            "how you would improve one app or process you use every day",
            "solving a simple problem with limited resources",
        ]
    )
    ai_fluency_options = (
        [
            "how you use AI tools like ChatGPT or Copilot in your actual project or study work",
            "how you check whether an AI-generated answer or piece of code is actually correct",
            "when you would choose not to use AI for a task, and why",
            "how you make sure AI-assisted work is still genuinely your own",
            f"how AI tools have changed the way you approach {_tech_label}",
        ]
        if plan in {"pro", "career"}
        else [
            "how you use AI tools like ChatGPT in your studies or projects",
            "how you check whether an AI-generated answer is correct",
            "one time you chose not to trust an AI response, and what you did instead",
            "how you make sure work you did with AI help is still your own",
        ]
    )

    sjt_target = _pick_target_variant(sjt_options, variant_seed, offset=5)
    creative_target = _pick_target_variant(creative_options, variant_seed, offset=6)
    ai_fluency_target = _pick_target_variant(ai_fluency_options, variant_seed, offset=7)

    return {
        "introduction": "your background, strongest area, and next goal",
        "studies_background": education[0] if education else "your current studies or background",
        "ownership": primary_label,
        # ✅ UPDATED: branch-aware versions replace generic IT framing
        "workflow_process": _branch_workflow_target,
        "tool_method": _branch_tool_target,
        "challenge_debugging": _branch_challenge_target,
        "validation_metrics": _field_focus_angle(summary, "validation_metrics"),
        "tradeoff_decision": _field_focus_angle(summary, "tradeoff_decision"),
        "communication_explain": communication_target,
        "teamwork_pressure": teamwork_target,
        "learning_growth": learning_growth_target,
        "role_fit": role_fit_target,
        "closeout": closeout_target,
        "secondary_ownership": secondary_label,
        # ✅ ADDED: targets for the three new rubric categories (#15-17)
        "situational_judgment": sjt_target,
        "creative_thinking": creative_target,
        "ai_tool_fluency": ai_fluency_target,
    }


def _plan_family_sequence(plan: str, resume_summary: dict, difficulty_mode: str, variant_seed: int, max_turns: int) -> list[str]:
    selected_mode = normalize_difficulty_mode(difficulty_mode)
    summary = _coerce_resume_summary_dict(resume_summary)
    field_profile = _resume_field_profile(summary)
    broad_field = str(field_profile.get("broad_field") or "general_fresher_mixed")
    projects = [item for item in summary.get("projects", []) if isinstance(item, dict)]
    skills = [item for item in summary.get("skills", []) if isinstance(item, str) and item.strip()]
    thin_resume = len(projects) == 0 or (len(projects) <= 1 and len(skills) <= 3)

    def choose_blueprint(options: list[list[str]]) -> list[str]:
        usable = [option for option in options if option]
        if not usable:
            return []
        return usable[variant_seed % len(usable)]

    if plan == "free":
        if selected_mode == "difficult":
            blueprints = [
                ["introduction", "ownership", "workflow_process", "learning_growth", "role_fit"],
                ["introduction", "role_fit", "ownership", "teamwork_pressure", "learning_growth"],
                ["introduction", "studies_background", "ownership", "workflow_process", "learning_growth"],
                # ✅ ADDED: 5 more blueprints — previously only 3 so sequence repeated every 3 sessions
                ["introduction", "ownership", "challenge_debugging", "role_fit", "learning_growth"],
                ["introduction", "role_fit", "studies_background", "ownership", "teamwork_pressure"],
                ["introduction", "ownership", "teamwork_pressure", "workflow_process", "role_fit"],
                ["introduction", "studies_background", "challenge_debugging", "ownership", "role_fit"],
                ["introduction", "ownership", "role_fit", "challenge_debugging", "teamwork_pressure"],
            ]
        elif selected_mode == "medium":
            blueprints = [
                ["introduction", "studies_background", "ownership", "workflow_process", "role_fit"],
                ["introduction", "ownership", "studies_background", "teamwork_pressure", "role_fit"],
                ["introduction", "studies_background", "ownership", "learning_growth", "role_fit"],
                # ✅ ADDED: 5 more blueprints
                ["introduction", "ownership", "role_fit", "studies_background", "teamwork_pressure"],
                ["introduction", "studies_background", "teamwork_pressure", "ownership", "role_fit"],
                ["introduction", "ownership", "workflow_process", "studies_background", "role_fit"],
                ["introduction", "role_fit", "studies_background", "ownership", "learning_growth"],
                ["introduction", "studies_background", "ownership", "role_fit", "teamwork_pressure"],
            ]
        else:
            blueprints = [
                ["introduction", "studies_background", "ownership", "teamwork_pressure", "role_fit"],
                ["introduction", "ownership", "studies_background", "teamwork_pressure", "learning_growth"],
                ["introduction", "studies_background", "role_fit", "ownership", "teamwork_pressure"],
                # ✅ ADDED: 5 more blueprints
                ["introduction", "studies_background", "ownership", "role_fit", "learning_growth"],
                ["introduction", "ownership", "teamwork_pressure", "studies_background", "role_fit"],
                ["introduction", "role_fit", "ownership", "studies_background", "teamwork_pressure"],
                ["introduction", "studies_background", "teamwork_pressure", "role_fit", "ownership"],
                ["introduction", "ownership", "role_fit", "teamwork_pressure", "studies_background"],
            ]

        base = choose_blueprint(blueprints)
        if thin_resume:
            base = [
                "introduction",
                "studies_background",
                "ownership",
                "learning_growth" if selected_mode in {"medium", "difficult"} else "teamwork_pressure",
                "role_fit",
            ]
        return _rotate_question_families(base[:max_turns], variant_seed, keep_first=True)

    if plan == "pro":
        if selected_mode == "basic":
            blueprints = [
                ["introduction", "ownership", "role_fit", "workflow_process", "tool_method", "communication_explain", "teamwork_pressure", "learning_growth", "challenge_debugging", "closeout"],
                ["introduction", "role_fit", "ownership", "tool_method", "workflow_process", "teamwork_pressure", "communication_explain", "learning_growth", "challenge_debugging", "closeout"],
                # ✅ ADDED: 4 more blueprints
                ["introduction", "ownership", "tool_method", "role_fit", "workflow_process", "communication_explain", "challenge_debugging", "teamwork_pressure", "learning_growth", "closeout"],
                ["introduction", "role_fit", "tool_method", "ownership", "challenge_debugging", "workflow_process", "teamwork_pressure", "communication_explain", "learning_growth", "closeout"],
                ["introduction", "ownership", "workflow_process", "tool_method", "role_fit", "teamwork_pressure", "communication_explain", "challenge_debugging", "learning_growth", "closeout"],
                ["introduction", "tool_method", "ownership", "role_fit", "communication_explain", "challenge_debugging", "workflow_process", "teamwork_pressure", "learning_growth", "closeout"],
            ]
        elif selected_mode == "difficult":
            blueprints = [
                ["introduction", "role_fit", "ownership", "challenge_debugging", "tradeoff_decision", "validation_metrics", "workflow_process", "tool_method", "communication_explain", "teamwork_pressure", "learning_growth", "closeout"],
                ["introduction", "ownership", "role_fit", "workflow_process", "tradeoff_decision", "validation_metrics", "challenge_debugging", "tool_method", "teamwork_pressure", "communication_explain", "learning_growth", "closeout"],
                ["introduction", "role_fit", "ownership", "validation_metrics", "challenge_debugging", "tradeoff_decision", "workflow_process", "tool_method", "teamwork_pressure", "learning_growth", "communication_explain", "closeout"],
                # ✅ ADDED: 4 more blueprints
                ["introduction", "ownership", "challenge_debugging", "role_fit", "validation_metrics", "tradeoff_decision", "tool_method", "workflow_process", "communication_explain", "teamwork_pressure", "learning_growth", "closeout"],
                ["introduction", "role_fit", "tradeoff_decision", "ownership", "challenge_debugging", "workflow_process", "validation_metrics", "communication_explain", "tool_method", "teamwork_pressure", "learning_growth", "closeout"],
                ["introduction", "ownership", "validation_metrics", "role_fit", "tradeoff_decision", "challenge_debugging", "communication_explain", "workflow_process", "tool_method", "learning_growth", "teamwork_pressure", "closeout"],
                ["introduction", "challenge_debugging", "ownership", "role_fit", "workflow_process", "validation_metrics", "tradeoff_decision", "tool_method", "teamwork_pressure", "communication_explain", "learning_growth", "closeout"],
            ]
        else:
            blueprints = [
                ["introduction", "role_fit", "ownership", "workflow_process", "tool_method", "challenge_debugging", "validation_metrics", "communication_explain", "teamwork_pressure", "learning_growth", "closeout"],
                ["introduction", "ownership", "role_fit", "tool_method", "workflow_process", "validation_metrics", "challenge_debugging", "teamwork_pressure", "communication_explain", "learning_growth", "closeout"],
                ["introduction", "role_fit", "ownership", "workflow_process", "challenge_debugging", "tool_method", "validation_metrics", "teamwork_pressure", "communication_explain", "learning_growth", "closeout"],
                # ✅ ADDED: 4 more blueprints
                ["introduction", "ownership", "tool_method", "role_fit", "challenge_debugging", "workflow_process", "validation_metrics", "communication_explain", "learning_growth", "teamwork_pressure", "closeout"],
                ["introduction", "role_fit", "workflow_process", "ownership", "tool_method", "challenge_debugging", "communication_explain", "validation_metrics", "teamwork_pressure", "learning_growth", "closeout"],
                ["introduction", "ownership", "challenge_debugging", "tool_method", "role_fit", "workflow_process", "validation_metrics", "teamwork_pressure", "communication_explain", "learning_growth", "closeout"],
                ["introduction", "tool_method", "ownership", "role_fit", "workflow_process", "validation_metrics", "challenge_debugging", "communication_explain", "learning_growth", "teamwork_pressure", "closeout"],
            ]
        base = choose_blueprint(blueprints)
        if thin_resume:
            replace_index = 5 if len(base) > 5 else -1
            if replace_index >= 0:
                base[replace_index] = "studies_background"
        return _rotate_question_families(base[:max_turns], variant_seed, keep_first=True)

    # ✅ UPDATED: career-plan blueprints now include the three new families
    # (situational_judgment, creative_thinking, ai_tool_fluency — Report §6.2 #15-17).
    # The 13-turn career plan has exactly enough room to include all three once each.
    # They are placed in slots 7-9 (post-technical-depth, pre-wrap-up) so the interview
    # flows: intro → role-fit → deep technical → judgment/creative/AI → growth → close.
    # Three original 13-slot blueprints expanded to 6 to extend variety further.
    blueprints = [
        [
            "introduction",
            "role_fit",
            "ownership",
            "workflow_process",
            "tradeoff_decision",
            "validation_metrics",
            "situational_judgment",
            "teamwork_pressure",
            "creative_thinking",
            "communication_explain",
            "ai_tool_fluency",
            "learning_growth",
            "closeout",
        ],
        [
            "introduction",
            "ownership",
            "role_fit",
            "tradeoff_decision",
            "workflow_process",
            "validation_metrics",
            "creative_thinking",
            "teamwork_pressure",
            "situational_judgment",
            "communication_explain",
            "ai_tool_fluency",
            "learning_growth",
            "closeout",
        ],
        [
            "introduction",
            "role_fit",
            "ownership",
            "validation_metrics",
            "tradeoff_decision",
            "workflow_process",
            "ai_tool_fluency",
            "teamwork_pressure",
            "creative_thinking",
            "communication_explain",
            "situational_judgment",
            "learning_growth",
            "closeout",
        ],
        # ✅ ADDED: 3 more blueprints for variety across sessions
        [
            "introduction",
            "ownership",
            "role_fit",
            "challenge_debugging",
            "tool_method",
            "tradeoff_decision",
            "situational_judgment",
            "creative_thinking",
            "teamwork_pressure",
            "ai_tool_fluency",
            "communication_explain",
            "learning_growth",
            "closeout",
        ],
        [
            "introduction",
            "role_fit",
            "ownership",
            "workflow_process",
            "challenge_debugging",
            "validation_metrics",
            "ai_tool_fluency",
            "situational_judgment",
            "teamwork_pressure",
            "creative_thinking",
            "tool_method",
            "learning_growth",
            "closeout",
        ],
        [
            "introduction",
            "ownership",
            "role_fit",
            "tool_method",
            "tradeoff_decision",
            "challenge_debugging",
            "creative_thinking",
            "situational_judgment",
            "workflow_process",
            "ai_tool_fluency",
            "teamwork_pressure",
            "learning_growth",
            "closeout",
        ],
    ]
    base = choose_blueprint(blueprints)
    if selected_mode == "basic":
        # Basic mode: keep the three new families but move them later so core topics land first
        base = [
            "introduction",
            "studies_background",
            "ownership",
            "workflow_process",
            "teamwork_pressure",
            "communication_explain",
            "situational_judgment",
            "learning_growth",
            "ai_tool_fluency",
            "role_fit",
            "creative_thinking",
            "closeout",
        ]
    elif selected_mode == "difficult":
        base = [
            "introduction",
            "role_fit",
            "ownership",
            "tradeoff_decision",
            "validation_metrics",
            "workflow_process",
            "situational_judgment",
            "creative_thinking",
            "ai_tool_fluency",
            "teamwork_pressure",
            "challenge_debugging",
            "learning_growth",
            "closeout",
        ]
    if thin_resume or broad_field in {"general_fresher_mixed", "non_technical_general"}:
        base[4] = "studies_background"
        if selected_mode != "basic" and len(base) > 9:
            base[9] = "challenge_debugging"
    return _rotate_question_families(base[:max_turns], variant_seed, keep_first=True)


def _build_fallback_question_plan(
    plan: str,
    resume_summary,
    max_turns: int,
    difficulty_mode: str = "auto",
    variant_seed: int = 0,
) -> list[dict]:
    """Build a deterministic question plan when the live planner is unavailable."""
    summary = _coerce_resume_summary_dict(resume_summary)
    family_targets = _compose_family_targets(plan, summary, variant_seed)
    family_sequence = _plan_family_sequence(plan, summary, difficulty_mode, variant_seed, max_turns)
    if not family_sequence:
        return []

    question_plan: list[dict] = []
    for turn, family in enumerate(family_sequence[:max_turns], start=1):
        target = family_targets.get(family) or family_targets.get("ownership") or "one experience from your resume"
        if family == "ownership" and turn >= 4 and family_targets.get("secondary_ownership"):
            target = family_targets["secondary_ownership"]
        question_plan.append(
            {
                "turn": turn,
                "category": family,
                "family": family,
                "target": target,
                "difficulty": _resolve_item_difficulty(plan, _family_base_difficulty(family), difficulty_mode),
            }
        )

    return question_plan


def _apply_cross_session_question_cooldown(
    plan: str,
    question_plan,
    resume_summary,
    max_turns: int,
    difficulty_mode: str,
    recent_memory: dict[str, Any] | None,
    variant_seed: int,
) -> list[dict]:
    """Replace recently reused targets so repeated interviews feel fresher."""
    normalized_plan = (plan or "free").lower().strip()
    normalized_mode = normalize_difficulty_mode(difficulty_mode)
    recent_memory = recent_memory or {}
    recent_target_signatures = set(recent_memory.get("recent_target_signatures") or set())
    recent_angle_signatures = set(recent_memory.get("recent_angle_signatures") or set())
    recent_position_signatures = set(recent_memory.get("recent_position_signatures") or set())

    current_items = _coerce_question_plan(question_plan)
    if not current_items:
        current_items = _build_fallback_question_plan(
            normalized_plan,
            resume_summary,
            max_turns,
            difficulty_mode=normalized_mode,
            variant_seed=variant_seed,
        )

    if not recent_target_signatures and not recent_angle_signatures:
        return current_items[:max_turns]

    candidate_pools = [current_items]
    # ✅ PERF: Memoize _build_fallback_question_plan calls inside this loop.
    # We call it up to 21 times, but many calls share the same underlying computation.
    # Caching by (plan, seed, max_turns, mode) makes repeated calls return instantly.
    _plan_cache: dict[tuple, list] = {}

    def _cached_build(seed: int) -> list:
        key = (normalized_plan, seed, max_turns, normalized_mode)
        if key not in _plan_cache:
            _plan_cache[key] = _build_fallback_question_plan(
                normalized_plan,
                resume_summary,
                max_turns,
                difficulty_mode=normalized_mode,
                variant_seed=seed,
            )
        return _plan_cache[key]

    # ✅ FIXED: was range(1, 5) — only 5 alternative pools. Exhausted after 5 sessions.
    # At 300+ sessions, the cooldown system had no more novel targets to pick from.
    # 20 pools gives 21 total alternatives — enough novelty across a full semester.
    for offset in range(1, 21):
        candidate_pools.append(_cached_build(variant_seed + offset))

    def _pool_novelty_score(pool: list[dict]) -> tuple[int, int, int]:
        normalized_pool = _coerce_question_plan(pool)
        target_overlap = 0
        angle_overlap = 0
        position_overlap = 0
        for index, item in enumerate(normalized_pool[:max_turns], start=1):
            category = _normalize_plan_category(str(item.get("category") or "communication"))
            target = clean_for_display(str(item.get("target") or "")).strip()
            if target and _plan_target_signature(category, target) in recent_target_signatures:
                target_overlap += 1
            if target and f"{category}:{_plan_target_angle(category, target)}" in recent_angle_signatures:
                angle_overlap += 1
            if f"{index}:{category}" in recent_position_signatures:
                position_overlap += 1
        return (target_overlap, angle_overlap, position_overlap)

    candidate_pools = sorted(candidate_pools, key=_pool_novelty_score)

    final_items: list[dict] = []
    seen_target_signatures: set[str] = set()
    seen_angle_signatures: set[str] = set()
    deferred_items: list[dict] = []

    def _try_add(item: dict, *, allow_recent: bool) -> bool:
        category = _normalize_plan_category(str(item.get("category") or "communication"))
        target = clean_for_display(str(item.get("target") or "")) or ""
        target = re.sub(r"\s+", " ", target).strip()
        if not target:
            return False

        item_signature = _plan_target_signature(category, target)
        item_angle_signature = f"{category}:{_plan_target_angle(category, target)}"
        if item_signature in seen_target_signatures:
            return False

        normalized_item = {
            "turn": len(final_items) + 1,
            "category": category,
            "family": category,
            "target": target,
            "difficulty": _resolve_item_difficulty(
                normalized_plan,
                str(item.get("difficulty") or "medium"),
                normalized_mode,
            ),
            "style_hint": str(item.get("style_hint") or ""),
        }

        if (
            not allow_recent
            and item_signature in recent_target_signatures
            and len(final_items) < max(0, max_turns - 2)
        ):
            deferred_items.append(normalized_item)
            return False

        if (
            not allow_recent
            and item_angle_signature in recent_angle_signatures
            and len(final_items) < max(0, max_turns - 2)
        ):
            deferred_items.append(normalized_item)
            return False

        if (
            item_angle_signature in seen_angle_signatures
            and category in {"role_fit", "closeout", "learning_growth", "teamwork_pressure"}
            and len(final_items) < max(0, max_turns - 1)
        ):
            deferred_items.append(normalized_item)
            return False

        if (
            len(final_items) >= 2
            and final_items[-1]["category"] == normalized_item["category"] == final_items[-2]["category"]
            and len(final_items) < max(0, max_turns - 1)
        ):
            deferred_items.append(normalized_item)
            return False

        final_items.append(normalized_item)
        seen_target_signatures.add(item_signature)
        seen_angle_signatures.add(item_angle_signature)
        return True

    intro_candidates: list[dict] = []
    for pool in candidate_pools:
        intro_candidates.extend(
            item for item in _coerce_question_plan(pool)
            if _normalize_plan_category(str(item.get("category") or "")) == "introduction"
        )
    for item in intro_candidates:
        if _try_add(item, allow_recent=False):
            break
    if not final_items and intro_candidates:
        _try_add(intro_candidates[0], allow_recent=True)

    for pool in candidate_pools:
        for item in _coerce_question_plan(pool):
            if len(final_items) >= max_turns:
                break
            if _normalize_plan_category(str(item.get("category") or "")) == "introduction":
                continue
            _try_add(item, allow_recent=False)
        if len(final_items) >= max_turns:
            break

    for item in deferred_items:
        if len(final_items) >= max_turns:
            break
        _try_add(item, allow_recent=True)

    if not final_items:
        final_items = current_items[:max_turns]

    final_items = final_items[:max_turns]
    for index, item in enumerate(final_items, start=1):
        item["turn"] = index
    return final_items


# Distinct self-introduction phrasings used to diversify the opening question
# across a student's repeat sessions when the primary (difficulty-adapted)
# opener has already been used recently. Each has different core tokens so they
# produce distinct question signatures.
_OPENING_QUESTION_VARIANTS = (
    "Walk me through your background and the role you are aiming for next.",
    "What is the short version of your story and the kind of work you want now?",
    "Give me a quick snapshot of your strongest area and what you are building toward.",
    "Tell me what makes your background stand out for the role you want next.",
    "Share the highlights of your journey so far and where you want to go from here.",
    "Take me through who you are, your sharpest skill, and the team you want to join.",
)


def _build_opening_question(
    plan: str,
    question_plan,
    difficulty_mode: str,
    recent_question_signatures: set[str] | None,
    recent_questions: list[str] | None,
) -> str:
    """Pick a session opening question that avoids repeating the same opener across interviews."""
    recent_question_signatures = recent_question_signatures or set()
    recent_questions = recent_questions or []

    intro_item = next(
        (
            item for item in _coerce_question_plan(question_plan)
            if _normalize_plan_category(str(item.get("category") or "")) == "introduction"
        ),
        None,
    ) or {"category": "introduction", "target": "self-introduction", "difficulty": "easy", "style_hint": ""}

    style_options = [
        str(intro_item.get("style_hint") or ""),
        "warm and direct",
        "clear and conversational",
        "practical and beginner-friendly",
        "technical and concise",
        "hiring-panel direct",
    ]

    for style_hint in style_options:
        candidate = _render_question_template(
            category="introduction",
            target=str(intro_item.get("target") or "self-introduction"),
            silence_count=0,
            plan=plan,
            style_hint=style_hint,
            planned_difficulty=str(intro_item.get("difficulty") or "easy"),
            difficulty_mode=difficulty_mode,
        )
        if not _is_duplicate_question(candidate, recent_question_signatures, recent_questions):
            return candidate

    # In basic/medium/difficult modes _adapt_question_for_difficulty collapses
    # the introduction template to a single fixed phrasing per (plan, mode), so
    # the style loop above cannot diversify the opener across a student's repeat
    # sessions. Fall back to a pool of distinct self-introduction phrasings and
    # return the first one not used recently — fulfilling this function's
    # "avoid repeating the same opener across interviews" contract.
    for opener_variant in _OPENING_QUESTION_VARIANTS:
        if not _is_duplicate_question(opener_variant, recent_question_signatures, recent_questions):
            return opener_variant

    return _adapt_question_for_difficulty(
        "Tell me about yourself.",
        plan=plan,
        category="introduction",
        difficulty_mode=difficulty_mode,
        planned_difficulty=str(intro_item.get("difficulty") or "easy"),
    )

