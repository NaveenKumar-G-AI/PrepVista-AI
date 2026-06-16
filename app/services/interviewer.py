"""
PrepVista AI - Interviewer Service (Barrel / Orchestration File)
================================================================
Manages interview session lifecycle: setup, greeting, Q&A, finish.

This file was the original monolithic interviewer (6823 lines).  It has been
surgically split into focused sub-modules while preserving every function,
constant, and import path.  All public and internal names are re-exported
here so that existing consumers (`from app.services.interviewer import X`)
continue to work with zero changes.

Sub-modules:
  interviewer_constants.py       — signal terms, phrase sets, pattern defs
  interviewer_helpers.py         — pure utility functions, resume helpers
  interviewer_question_engine.py — question generation, follow-ups, retries
  interviewer_coverage.py        — coverage planning, family sequences
  interviewer_templates.py       — question templates, preamble, rendering
  interviewer_session.py         — create_session, process_answer, finish_session
"""

# ── Re-export: Constants & Signal Terms ──────────────────────────────────────
from app.services.interviewer_constants import (  # noqa: F401
    EXIT_PHRASES,
    REPEAT_REQUEST_PHRASES,
    NO_ANSWER_TOKEN,
    SYSTEM_TIME_UP_TOKEN,
    START_TOKENS,
    TECHNICAL_SIGNAL_TERMS,
    POSITIVE_SIGNAL_TERMS,
    STUDY_SIGNAL_TERMS,
    ROLE_SIGNAL_TERMS,
    STRENGTH_SIGNAL_TERMS,
    OWNERSHIP_SIGNAL_TERMS,
    WORKFLOW_SIGNAL_TERMS,
    VALIDATION_SIGNAL_TERMS,
    DECISION_SIGNAL_TERMS,
    TEAM_SIGNAL_TERMS,
    GROWTH_SIGNAL_TERMS,
    QUESTION_INTRO_PREFIXES,
    QUESTION_CUE_PREFIXES,
    QUESTION_STOP_WORDS,
    QUESTION_SIGNATURE_REPLACEMENTS,
    QUESTION_FAMILIES,
    QUESTION_PLAN_CATEGORY_ALIASES,
    VALID_QUESTION_PLAN_CATEGORIES,
    VALID_QUESTION_PLAN_DIFFICULTIES,
    QUESTION_STYLE_HINTS,
    FIELD_FOCUS_ANGLES,
    _VALID_PROCTORING_MODES,
    _PROMPT_INJECTION_PATTERNS,
    _PROMPT_INJECTION_RE,
    _scan_for_prompt_injection,
)

# ── Re-export: Helpers & Utilities ───────────────────────────────────────────
from app.services.interviewer_helpers import (  # noqa: F401
    _clean_ai_response,
    _coerce_question_plan,
    _resume_highlight,
    _coerce_resume_summary_dict,
    _resume_field_profile,
    _resume_primary_project,
    _resume_primary_skill,
    _resume_target_role,
    _field_focus_angle,
    _get_next_plan_item,
    _normalize_topic_label,
    _contains_any,
    _extract_family_history,
    _trim_family_history,
    _normalize_candidate_name,
    _resume_answer_terms,
    _short_target_role_label,
    _extract_answer_anchor_facts,
    _build_answer_anchor_summary,
    _extract_answer_coverage,
    _derive_redundant_followup_families,
    _build_answer_led_followup,
    _should_force_answer_led_followup,
)

# ── Re-export: Question Engine ───────────────────────────────────────────────
from app.services.interviewer_question_engine import (  # noqa: F401
    _safe_json_dumps,
    _question_signature,
    _question_core_tokens,
    _extract_asked_question_signatures,
    _collect_asked_questions,
    _collect_recent_asked_questions,
    _looks_like_interviewer_question,
    _finalize_interviewer_turn,
    _extract_question_portion,
    _strip_question_intro,
    _load_recent_session_question_memory,
    _is_duplicate_question,
    _dedupe_preserve_order,
    _answer_signal_profile,
    _is_ambiguous_followup_question,
    _is_easy_to_understand_question,
    _select_next_plan_item,
    _plan_target_angle,
    _is_recruiter_language_question,
    _question_family_from_text,
    _recent_question_families,
    _recent_question_angles,
    _extract_skip_topics,
    _trim_skip_topics,
    _question_retry_limit,
    _record_turn_outcome,
    _plan_target_signature,
    _question_angle_from_text,
    _violates_family_repeat_rules,
    _resolve_item_difficulty,
    _normalize_plan_category,
    _normalize_plan_difficulty,
    _sanitize_plan_target,
    _normalize_generated_question_plan,
    _style_variant_index,
    _humanize_question_target,
    _humanize_live_question_text,
    _apply_question_style_hints,
    _build_positive_boost,
    _merge_boost_with_question,
    _get_future_plan_items,
    _get_plan_item_for_turn,
    _infer_free_retry_category,
    _build_free_retry_question,
    _build_repeat_question,
    _build_clarification_question,
    _build_timeout_retry_question,
    _infer_pro_retry_category,
    _build_free_followup_question,
    _build_pro_retry_question,
    _infer_career_retry_category,
    _build_career_retry_question,
    _build_emergency_unique_question,
    _build_emergency_unique_question,
)

# ── Re-export: Coverage & Planning ───────────────────────────────────────────
from app.services.interviewer_coverage import (  # noqa: F401
    _planned_turn_limit,
    _family_base_difficulty,
    _rotate_question_families,
    _pick_target_variant,
    _compose_family_targets,
    _plan_family_sequence,
    _build_fallback_question_plan,
    _apply_cross_session_question_cooldown,
    _build_opening_question,
)

# ── Re-export: Templates & Rendering ────────────────────────────────────────
from app.services.interviewer_templates import (  # noqa: F401
    _question_template_for_category,
    _sjt_template,
    _creative_template,
    _ai_fluency_template,
    _adapt_question_for_difficulty,
    _build_question_preamble,
    _render_question_template,
    _select_live_difficulty_signal,
    _infer_difficulty_signal,
    _build_fallback_ai_response,
    _build_pro_followup_question,
    _build_career_followup_question,
    _build_pro_followup_hint,
    _build_free_followup_hint,
    _build_career_followup_hint,
    _is_probably_followup,
    _should_force_topic_change,
    _is_repeat_request,
)

# ── Re-export: Session Lifecycle (public API) ────────────────────────────────
from app.services.interviewer_session import (  # noqa: F401
    create_session,
    process_answer,
    _ensure_pending_evaluations,
    finish_session,
)