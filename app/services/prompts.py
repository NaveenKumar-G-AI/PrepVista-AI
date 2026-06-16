"""
PrepVista AI — Prompt Templates (Barrel / Orchestration File)
=============================================================
All system prompts for the interview engine.
Clean separation of prompting logic from application code.

This file was the original monolithic prompts file (1890 lines). It has been
surgically split into focused sub-modules while preserving every function,
constant, and import path. All public and internal names are re-exported
here so that existing consumers (`from app.services.prompts import X`)
continue to work with zero changes.

Sub-modules:
  prompts_helpers.py   — tone variants, session progression, difficulty blocks
  prompts_interview.py — question plan, master prompt, greeting, follow-up
  prompts_eval.py      — per-question evaluation, resume extraction
"""

from __future__ import annotations

# ── Re-export: Helpers & Constants ───────────────────────────────────────────
from app.services.prompts_helpers import (  # noqa: F401
    _select_tone_variant,
    _session_progression_block,
    _select_greeting_structure,
    _coerce_resume_summary,
    _normalize_candidate_name,
    _build_resume_highlight_text,
    _difficulty_prompt_block,
)

# ── Re-export: Interview Prompt Builders ─────────────────────────────────────
from app.services.prompts_interview import (  # noqa: F401
    build_master_prompt,
    build_greeting_prompt,
    build_followup_prompt,
    build_question_plan_prompt,
)

# ── Re-export: Evaluation & Resume Prompts ───────────────────────────────────
from app.services.prompts_eval import (  # noqa: F401
    _category_eval_criteria,
    _red_flag_json_fields,
    build_per_question_eval_prompt,
    build_resume_extraction_prompt,
    QUESTION_PREAMBLE_TEMPLATES,
)