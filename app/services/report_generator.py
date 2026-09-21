"""
PrepVista AI - Report Generator
Extracted from report_builder.py - Main report builder and async wrapper.

Re-exported by report_builder.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import io
import json
import structlog

from app.config import PLAN_CONFIG

from app.services.report_helpers import (
    _build_improved_answer,
    _build_improvement_points,
    _build_overall_summary,
    _classification_palette,
    _coerce_json_object,
    _coerce_list,
    _escape_pdf_literal,
    _format_duration,
    _format_timestamp,
    _minimal_pdf_report,
    _response_time_summary,
    _safe_pdf_text,
    _safe_text,
    _score_palette,
    _summary_dimension_labels,
    _ensure_page_capacity,
)
from app.services.report_render import (
    _render_bullets,
    _render_career_summary,
    _render_empty_state,
    _render_info_card,
    _render_labeled_box,
    _render_pro_summary,
    _render_question_block,
    _render_question_header,
    _render_rubric_row,
    _section_heading,
)

logger = structlog.get_logger("prepvista.report_builder")

# ---------------------------------------------------------------------------
# Main report builder
# ---------------------------------------------------------------------------

def _build_professional_fpdf_report(
    score: float,
    rubric_scores: dict,
    strengths: list[str],
    weaknesses: list[str],
    evaluations: list[dict],
    email: str,
    date: str,
    plan: str,
    duration_seconds: int | None,
    finished_at,
    question_plan=None,
    session_summary: dict | None = None,
    pro_summary: dict | None = None,
    career_summary: dict | None = None,
) -> bytes:
    from fpdf import FPDF

    # Closure-captured values for footer
    _footer_email = _safe_pdf_text(email)
    _footer_plan = _safe_pdf_text(plan).upper()

    class ReportPDF(FPDF):
        def footer(self):
            self.set_y(-15)
            self.set_draw_color(226, 232, 240)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(1.5)
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(148, 163, 184)
            self.cell(
                0, 5,
                f"PrepVista AI  |  {_footer_email}  |  Plan: {_footer_plan}  |  Page {self.page_no()}",
                align="C",
            )

    pdf = ReportPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(15, 16, 15)
    pdf.set_title("PrepVista Interview Report")
    pdf.set_author("PrepVista AI")
    pdf.set_creator("PrepVista AI")
    pdf.set_subject("Interview Performance Report")
    pdf.set_line_width(0.2)
    pdf.add_page()

    accent_rgb, score_bg_rgb = _score_palette(score)
    summary_text = _build_overall_summary(plan, score, strengths, weaknesses, evaluations)
    completed_label = _format_timestamp(finished_at or date)
    duration_label = _format_duration(duration_seconds)
    summary = session_summary if isinstance(session_summary, dict) else {}

    planned_items = []
    if isinstance(question_plan, list):
        planned_items = [item for item in question_plan if isinstance(item, dict)]
    elif isinstance(question_plan, str):
        try:
            parsed_plan = json.loads(question_plan)
            if isinstance(parsed_plan, list):
                planned_items = [item for item in parsed_plan if isinstance(item, dict)]
        except Exception:
            planned_items = []

    expected_questions = int(
        summary.get("planned_questions")
        or len(planned_items)
        or (PLAN_CONFIG.get(plan, PLAN_CONFIG["free"]).get("max_turns") or len(evaluations) or 0)
    )
    closed_questions = int(summary.get("closed_questions") or len(evaluations))
    response_time_summary = _response_time_summary(evaluations)

    completion_label = (
        f"{closed_questions} of {expected_questions} questions reviewed"
        if expected_questions
        else f"{closed_questions} questions reviewed"
    )
    response_pace_label = (
        f"Avg {response_time_summary['avg']} sec  |  Fastest {response_time_summary['min']} sec  |  Slowest {response_time_summary['max']} sec"
        if response_time_summary
        else "Per-question response pace was not recorded for this session."
    )

    # -----------------------------------------------------------------------
    # PAGE 1 HEADER
    # -----------------------------------------------------------------------
    # Dynamically calculate score badge position so text never overlaps it.
    _SCORE_BOX_W = 56
    _score_box_x = pdf.w - pdf.r_margin - _SCORE_BOX_W   # A4: 210 - 15 - 56 = 139 mm

    # Constrain header text to the region left of the score badge
    _text_max_w = _score_box_x - pdf.l_margin - 4         # 139 - 15 - 4 = 120 mm

    # Header background
    pdf.set_fill_color(7, 18, 38)
    pdf.rect(0, 0, pdf.w, 46, style="F")
    # Lighter base strip
    pdf.set_fill_color(24, 38, 66)
    pdf.rect(0, 40, pdf.w, 6, style="F")
    # Blue accent bottom line
    pdf.set_fill_color(37, 99, 235)
    pdf.rect(0, 43, pdf.w, 3, style="F")

    # Report title — limited to left column width
    pdf.set_xy(pdf.l_margin, 10)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(_text_max_w, 8, "PrepVista Interview Report")

    # Subtitle — multi_cell wraps within the same constrained width
    pdf.set_xy(pdf.l_margin, 21)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(191, 219, 254)
    pdf.multi_cell(
        _text_max_w, 4.5,
        "Industry-style interview feedback with answer review, coaching signals, and upgraded example responses.",
    )

    # Score badge — right-aligned inside the dark header
    _score_badge_y = 8
    _score_badge_h = 30
    pdf.set_fill_color(*score_bg_rgb)
    pdf.set_draw_color(*accent_rgb)
    pdf.rect(_score_box_x, _score_badge_y, _SCORE_BOX_W, _score_badge_h, style="DF")

    pdf.set_xy(_score_box_x, _score_badge_y + 3)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(_SCORE_BOX_W, 4, "OVERALL SCORE", align="C", ln=1)

    pdf.set_x(_score_box_x)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*accent_rgb)
    pdf.cell(_SCORE_BOX_W, 12, f"{int(round(score))}/100", align="C", ln=1)

    interp_short = "EXCELLENT" if score >= 80 else "SOLID" if score >= 60 else "DEVELOPING"
    pdf.set_x(_score_box_x)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(*accent_rgb)
    pdf.cell(_SCORE_BOX_W, 3.5, interp_short, align="C")

    # Content starts below the header
    pdf.set_y(52)

    # -----------------------------------------------------------------------
    # EXECUTIVE SUMMARY
    # -----------------------------------------------------------------------
    _section_heading(
        pdf,
        "Executive Summary",
        "A clean recruiter-style view of interview performance, strongest patterns, and the next coaching focus.",
        fill_rgb=(15, 23, 42),
    )
    summary_y = pdf.get_y()
    summary_h = _render_labeled_box(
        pdf,
        pdf.l_margin, summary_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Overall Assessment", summary_text,
        accent_rgb, (247, 250, 255),
    )
    pdf.set_y(summary_y + summary_h + 5)

    # -----------------------------------------------------------------------
    # INTERVIEW SNAPSHOT
    # -----------------------------------------------------------------------
    _section_heading(
        pdf,
        "Interview Snapshot",
        "Key session metadata and report context.",
        fill_rgb=(17, 24, 39),
    )
    # Ensure room for both rows of cards before drawing
    _ensure_page_capacity(pdf, 66)
    grid_x = pdf.l_margin
    grid_y = pdf.get_y()
    gap = 4
    card_w = (pdf.w - pdf.l_margin - pdf.r_margin - gap) / 2

    card_1 = _render_info_card(
        pdf, grid_x, grid_y, card_w,
        "Candidate", _safe_pdf_text(email) or "Not specified",
        "Report generated for the signed-in user.",
    )
    card_2 = _render_info_card(
        pdf, grid_x + card_w + gap, grid_y, card_w,
        "Interview Plan", plan.upper() if plan else "—",
        "The active plan used for this interview.",
    )
    row_1_h = max(card_1, card_2)
    row_2_y = grid_y + row_1_h + gap

    card_3 = _render_info_card(
        pdf, grid_x, row_2_y, card_w,
        "Completed On", completed_label,
        "Session completion time.",
    )
    card_4 = _render_info_card(
        pdf, grid_x + card_w + gap, row_2_y, card_w,
        "Duration & Completion",
        f"{duration_label}  |  {completion_label}",
        response_pace_label,
    )
    pdf.set_y(row_2_y + max(card_3, card_4) + 5)

    # -----------------------------------------------------------------------
    # PERFORMANCE BREAKDOWN
    # -----------------------------------------------------------------------
    _section_heading(
        pdf,
        "Performance Breakdown",
        "Rubric performance by category and overall interview result.",
        fill_rgb=(30, 41, 59),
    )

    interpretation = (
        "Excellent readiness" if score >= 80 else
        "Solid progress with targeted coaching needed" if score >= 60 else
        "Development-focused session with clear next steps"
    )
    _ensure_page_capacity(pdf, 28)
    result_y = pdf.get_y()
    score_card_h = _render_info_card(
        pdf,
        pdf.l_margin, result_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Result Snapshot", interpretation,
        f"Overall score: {int(round(score))}/100",
        fill_rgb=(248, 250, 252),
    )
    pdf.set_y(result_y + score_card_h + 3)

    if rubric_scores:
        for idx, (category, value) in enumerate(rubric_scores.items()):
            _render_rubric_row(pdf, str(category), value, alternate=(idx % 2 == 0))
    else:
        _render_empty_state(pdf, "No rubric breakdown was available for this interview.")
    pdf.ln(3)

    # -----------------------------------------------------------------------
    # STRENGTHS
    # -----------------------------------------------------------------------
    _section_heading(
        pdf,
        "Strengths",
        "Signals that should be repeated in future interviews.",
        fill_rgb=(20, 83, 45),
    )
    if strengths:
        _render_bullets(pdf, strengths, "")
    else:
        _render_empty_state(pdf, "Complete more interviews to reveal stronger patterns.")
    pdf.ln(2)

    # -----------------------------------------------------------------------
    # PRIORITY IMPROVEMENTS
    # -----------------------------------------------------------------------
    _section_heading(
        pdf,
        "Priority Improvements",
        "The main areas to fix to improve score quality in the next session.",
        fill_rgb=(146, 64, 14),
    )
    if weaknesses:
        _render_bullets(pdf, weaknesses, "")
    else:
        _render_empty_state(pdf, "Keep practicing to uncover clearer improvement areas.")
    pdf.ln(2)

    # -----------------------------------------------------------------------
    # PLAN-SPECIFIC COACHING SUMMARIES
    # -----------------------------------------------------------------------
    if plan == "pro" and pro_summary:
        _render_pro_summary(pdf, pro_summary)
    if plan == "career" and career_summary:
        _render_career_summary(pdf, career_summary)

    # -----------------------------------------------------------------------
    # QUESTION-BY-QUESTION REVIEW
    # -----------------------------------------------------------------------
    _section_heading(
        pdf,
        "Question-by-Question Review",
        "Each question includes the interview prompt, the user answer, evaluator insight, improvement guidance, and an upgraded example answer.",
        fill_rgb=(15, 23, 42),
    )

    if evaluations:
        for index, evaluation in enumerate(evaluations, start=1):
            _render_question_block(pdf, index, evaluation)
    else:
        _render_empty_state(pdf, "No question evaluations were available for this report.")

    # Flush and return bytes
    result = pdf.output()
    if isinstance(result, (bytes, bytearray)):
        return bytes(result)
    if isinstance(result, str):
        return result.encode("latin-1", "ignore")
    return io.BytesIO(bytes(result)).getvalue()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def generate_pdf_report(
    session: dict,
    evaluations: list[dict],
    user_email: str,
    session_summary: dict | None = None,
) -> bytes:
    """Generate a PDF report from session data and evaluations."""
    score = float(session.get("final_score", 0) or 0)
    rubric_scores = _coerce_json_object(session.get("rubric_scores"))
    strengths = _coerce_list(session.get("strengths", []) or [])
    weaknesses = _coerce_list(session.get("weaknesses", []) or [])
    plan = _safe_pdf_text(session.get("plan", "pro") or "pro").lower() or "pro"
    created = session.get("created_at")
    finished_at = session.get("finished_at")
    date_label = _format_timestamp(finished_at or created)

    safe_evaluations = [
        {
            "turn_number": evaluation.get("turn_number", index + 1),
            "rubric_category": evaluation.get("rubric_category", "general"),
            "question_text": evaluation.get("question_text", ""),
            "raw_answer": evaluation.get("raw_answer", ""),
            "normalized_answer": evaluation.get("normalized_answer", ""),
            "classification": evaluation.get("classification", "vague"),
            "score": evaluation.get("score", 0),
            "scoring_rationale": evaluation.get("scoring_rationale", ""),
            "missing_elements": evaluation.get("missing_elements", []),
            "ideal_answer": evaluation.get("ideal_answer", ""),
            "communication_notes": evaluation.get("communication_notes", ""),
            "relevance_score": evaluation.get("relevance_score"),
            "clarity_score": evaluation.get("clarity_score"),
            "specificity_score": evaluation.get("specificity_score"),
            "structure_score": evaluation.get("structure_score"),
            "communication_score": evaluation.get("communication_score"),
            "answer_status": evaluation.get("answer_status", ""),
            "content_understanding": evaluation.get("content_understanding", ""),
            "depth_quality": evaluation.get("depth_quality", ""),
            "communication_clarity": evaluation.get("communication_clarity", ""),
            "what_worked": evaluation.get("what_worked", ""),
            "what_was_missing": evaluation.get("what_was_missing", ""),
            "how_to_improve": evaluation.get("how_to_improve", ""),
            "answer_blueprint": evaluation.get("answer_blueprint", ""),
            "corrected_intent": evaluation.get("corrected_intent", ""),
            "answer_duration_seconds": evaluation.get("answer_duration_seconds"),
            "plan": plan,
        }
        for index, evaluation in enumerate(evaluations)
    ]

    try:
        return _build_professional_fpdf_report(
            score=score,
            rubric_scores=rubric_scores,
            strengths=strengths,
            weaknesses=weaknesses,
            evaluations=safe_evaluations,
            email=user_email,
            date=date_label,
            plan=plan,
            duration_seconds=session.get("duration_actual_seconds"),
            finished_at=finished_at,
            question_plan=session.get("question_plan"),
            session_summary=(
                session_summary
                if isinstance(session_summary, dict)
                else session.get("session_summary")
                if isinstance(session.get("session_summary"), dict)
                else None
            ),
            pro_summary=session.get("pro_summary") if isinstance(session.get("pro_summary"), dict) else None,
            career_summary=session.get("career_summary") if isinstance(session.get("career_summary"), dict) else None,
        )
    except Exception as exc:
        logger.error(
            "styled_pdf_generation_failed",
            error=str(exc),
            plan=plan,
            score=score,
            eval_count=len(safe_evaluations),
        )
        return _minimal_pdf_report(
            score=score,
            plan=plan,
            email=user_email,
            evaluations=safe_evaluations,
        )