"""
PrepVista AI — PDF Report Builder (Barrel / Orchestration File)
=============================================================
Professional interview-report PDFs with a polished fpdf2 layout and a content-rich raw fallback.

This file was the original monolithic report builder file (1431 lines). It has been
surgically split into focused sub-modules while preserving every function,
constant, and import path. All public and internal names are re-exported
here so that existing consumers (`from app.services.report_builder import X`)
continue to work with zero changes.

Sub-modules:
  report_helpers.py   — safe accessors, formatters, and minimal PDF fallback
  report_render.py    — FPDF premium component renderers
  report_generator.py — Main report builder and async wrapper
"""

from __future__ import annotations

# ── Re-export: Report Helpers ────────────────────────────────────────────────
from app.services.report_helpers import (  # noqa: F401
    _coerce_json_object,
    _safe_text,
    _safe_pdf_text,
    _coerce_list,
    _clamp_score,
    _score_palette,
    _classification_palette,
    _format_duration,
    _format_timestamp,
    _response_time_summary,
    _count_wrapped_lines,
    _estimate_block_height,
    _ensure_page_capacity,
    _build_improvement_points,
    _build_improved_answer,
    _summary_dimension_labels,
    _build_overall_summary,
    _escape_pdf_literal,
    _wrap_raw_lines,
    _minimal_pdf_report,
)

# ── Re-export: Report Render ─────────────────────────────────────────────────
from app.services.report_render import (  # noqa: F401
    _section_heading,
    _draw_chip,
    _render_info_card,
    _render_bullets,
    _render_empty_state,
    _render_career_summary,
    _render_pro_summary,
    _measure_labeled_box_height,
    _render_labeled_box,
    _render_question_header,
    _render_rubric_row,
    _render_question_block,
)

# ── Re-export: Report Generator ──────────────────────────────────────────────
from app.services.report_generator import (  # noqa: F401
    _build_professional_fpdf_report,
    generate_pdf_report,
)
