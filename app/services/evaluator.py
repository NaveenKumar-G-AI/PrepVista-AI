"""
PrepVista AI - Evaluator Service (Barrel / Orchestration File)
==============================================================
Per-question rubric evaluation plus deterministic final score aggregation.
Free plan uses a simpler, fairer beginner rubric without changing the higher tiers.

This file was the original monolithic evaluator (3363 lines).  It has been
surgically split into focused sub-modules while preserving every function,
constant, and import path.  All public and internal names are re-exported
here so that existing consumers (`from app.services.evaluator import X`)
continue to work with zero changes.

Sub-modules:
  evaluator_grounding.py  — constants, helpers, grounding facts, signal gen
  evaluator_feedback.py   — score normalization, plan-specific fallbacks
  evaluator_scoring.py    — evaluate_single_question, compute_final_score
"""

# ── Re-export: Grounding & Signal Extraction ─────────────────────────────────
from app.services.evaluator_grounding import (  # noqa: F401
    STOPWORDS,
    DETAIL_HINTS,
    PRO_TECH_HINTS,
    CAREER_TECH_HINTS,
    _join_phrases_natural,
    _safe_text,
    _coerce_list,
    _coerce_resume_summary_dict,
    _resume_field_profile,
    _best_resume_project,
    _best_resume_tool,
    _question_family,
    _is_low_value_strength,
    _fallback_strength_from_evaluation,
    _field_label_for_feedback,
    _contains_any,
    _extract_grounding_facts,
    _worked_signal_for_family,
    _missing_signal_for_family,
    _improvement_for_family,
    _score_summary_for_family,
)

# ── Re-export: Feedback & Classification ─────────────────────────────────────
from app.services.evaluator_feedback import (  # noqa: F401
    _tokenize,
    _extract_resume_terms,
    _clamp_score,
    _sentence,
    _trim_to_sentence_count,
    _looks_like_placeholder_rewrite,
    _looks_too_generic_for_question,
    _normalize_user_facing_feedback,
    _normalize_content_label,
    _normalize_communication_label,
    normalize_rubric_category,
    _normalize_pro_answer_status,
    _pro_classification,
    _build_pro_communication_note,
    _build_career_interview_note,
    _fallback_corrected_intent,
    _timeout_status_from_raw,
    _has_answer_marker,
    _fallback_pro_better_answer,
    _normalize_career_answer_status,
    _career_classification,
    _heuristic_pro_components,
    _answer_blueprint_for_family,
    _grounded_better_answer,
    _career_answer_blueprint,
    _fallback_career_better_answer,
    _heuristic_career_components,
    _free_status_from_metrics,
    _normalize_free_answer_status,
    _free_classification,
    _fallback_better_answer,
    _heuristic_free_components,
    _fallback_free_evaluation,
    _normalize_free_result,
    _fallback_pro_evaluation,
    _normalize_pro_result,
    _career_marker_response,
    _fallback_career_evaluation,
    _normalize_career_result,
    _fallback_evaluation,
)

# ── Re-export: Scoring Engine (public API) ───────────────────────────────────
from app.services.evaluator_scoring import (  # noqa: F401
    _is_valid_career_strength,
    evaluate_single_question,
    _response_time_stats,
    _apply_response_time_guidance,
    _resolve_expected_questions,
    _top_readiness_dimensions,
    _best_answer_style_for_evaluations,
    _derive_free_strengths_and_improvements,
    _derive_pro_strengths_and_improvements,
    build_pro_readiness_summary,
    _derive_career_strengths_and_improvements,
    _infer_best_fit_role,
    build_career_readiness_summary,
    compute_final_score,
    get_score_interpretation,
)
