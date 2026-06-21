"""
PrepVista AI - Report Render
Extracted from report_builder.py - FPDF premium component renderers.

Re-exported by report_builder.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

from app.services.report_helpers import (
    _safe_text,
    _safe_pdf_text,
    _wrap_raw_lines,
    _count_wrapped_lines,
    _ensure_page_capacity,
    _estimate_block_height,
    _coerce_list,
    _classification_palette,
    _clamp_score,
    _build_improvement_points,
    _build_improved_answer,
)

# ---------------------------------------------------------------------------
# Premium fpdf2 component renderers
# ---------------------------------------------------------------------------

def _section_heading(
    pdf,
    title: str,
    subtitle: str | None = None,
    fill_rgb: tuple[int, int, int] = (15, 23, 42),
) -> None:
    """
    Draw a full-width section heading bar.

    FIX: Pre-measures subtitle line-wrap height so the background rectangle
    always fully contains the subtitle text (original used a fixed +6 mm that
    overflowed for longer subtitles).
    """
    safe_title = _safe_pdf_text(title)
    safe_subtitle = _safe_pdf_text(subtitle or "")
    x = pdf.l_margin
    width = pdf.w - pdf.l_margin - pdf.r_margin

    # --- Measure subtitle height BEFORE drawing the rectangle ---
    subtitle_line_count = 0
    if safe_subtitle:
        pdf.set_font("Helvetica", "", 8)
        subtitle_line_count = _count_wrapped_lines(pdf, safe_subtitle, width - 14)

    title_area_h: float = 11.0                                             # top-pad(3) + cell(5) + gap(3)
    subtitle_area_h: float = (subtitle_line_count * 4.0 + 3.0) if subtitle_line_count else 0.0
    block_height = max(title_area_h + subtitle_area_h, 11.0)

    _ensure_page_capacity(pdf, block_height + 6)
    y = pdf.get_y()

    # Background
    pdf.set_fill_color(*fill_rgb)
    pdf.set_draw_color(37, 99, 235)
    pdf.rect(x, y, width, block_height, style="DF")

    # Left accent stripe — 3.5 mm, contrasting blue
    pdf.set_fill_color(37, 99, 235)
    pdf.rect(x, y, 3.5, block_height, style="F")

    # Title text
    pdf.set_xy(x + 7, y + 3)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(width - 12, 5, safe_title)

    # Subtitle text (multi_cell wraps correctly within measured bounds)
    if safe_subtitle:
        pdf.set_xy(x + 7, y + title_area_h)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(219, 234, 254)
        pdf.multi_cell(width - 12, 4.0, safe_subtitle)

    pdf.set_y(y + block_height + 4)


def _draw_chip(
    pdf,
    x: float,
    y: float,
    text: str,
    fill_rgb: tuple[int, int, int],
    text_rgb: tuple[int, int, int],
) -> float:
    safe_text = _safe_pdf_text(text)
    chip_width = pdf.get_string_width(safe_text) + 8
    pdf.set_fill_color(*fill_rgb)
    pdf.set_draw_color(*fill_rgb)
    pdf.rect(x, y, chip_width, 6, style="DF")
    pdf.set_xy(x, y + 1.3)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*text_rgb)
    pdf.cell(chip_width, 3.5, safe_text, align="C")
    return chip_width


def _render_info_card(
    pdf,
    x: float,
    y: float,
    width: float,
    title: str,
    value: str,
    subtitle: str | None = None,
    fill_rgb: tuple[int, int, int] = (248, 250, 252),
) -> float:
    safe_title = _safe_pdf_text(title)
    safe_value = _safe_pdf_text(value) or "—"
    safe_subtitle = _safe_pdf_text(subtitle or "")

    pdf.set_font("Helvetica", "B", 11)
    value_height = _estimate_block_height(pdf, safe_value, width - 10, 5.2)
    pdf.set_font("Helvetica", "", 8)
    subtitle_height = _estimate_block_height(pdf, safe_subtitle, width - 10, 4.2) if safe_subtitle else 0
    card_height = max(24.0, 10 + value_height + subtitle_height + 2)

    pdf.set_fill_color(*fill_rgb)
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(x, y, width, card_height, style="DF")

    # Top accent bar
    pdf.set_fill_color(37, 99, 235)
    pdf.rect(x, y, width, 1.5, style="F")

    pdf.set_xy(x + 4, y + 4)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(width - 8, 4, safe_title.upper(), ln=1)

    pdf.set_x(x + 4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.multi_cell(width - 8, 5.2, safe_value)

    if safe_subtitle:
        pdf.set_x(x + 4)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(100, 116, 139)
        pdf.multi_cell(width - 8, 4.2, safe_subtitle)

    return card_height


def _render_bullets(pdf, items: list[str], empty_text: str) -> None:
    bullet_items = items or [_safe_pdf_text(empty_text)]
    text_width = pdf.w - pdf.l_margin - pdf.r_margin - 8
    pdf.set_font("Helvetica", "", 10)
    for item in bullet_items:
        safe_item = _safe_pdf_text(item)
        if not safe_item:
            continue
        needed = _estimate_block_height(pdf, safe_item, text_width, 5.0) + 3
        _ensure_page_capacity(pdf, needed)
        x = pdf.l_margin
        y = pdf.get_y()
        # Bullet square
        pdf.set_fill_color(37, 99, 235)
        pdf.rect(x + 2, y + 2.2, 1.6, 1.6, style="F")
        pdf.set_xy(x + 7, y)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(30, 41, 59)
        pdf.multi_cell(text_width, 5.0, safe_item)
        pdf.ln(1.0)


def _render_empty_state(pdf, message: str) -> None:
    """Styled empty-state block — used when a section has no data."""
    _ensure_page_capacity(pdf, 16)
    x = pdf.l_margin
    y = pdf.get_y()
    width = pdf.w - pdf.l_margin - pdf.r_margin
    pdf.set_fill_color(248, 250, 252)
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(x, y, width, 13, style="DF")
    pdf.set_xy(x + 5, y + 4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(width - 10, 5, _safe_pdf_text(message))
    pdf.set_y(y + 15)


def _render_career_summary(pdf, summary: dict) -> None:
    if not isinstance(summary, dict) or not summary:
        return

    recruiter_impression = _safe_pdf_text(summary.get("recruiter_impression") or summary.get("interview_impression") or "Not available")
    technical_readiness = _safe_pdf_text(summary.get("technical_readiness") or summary.get("current_readiness") or "Not available")
    role_fit = _safe_pdf_text(summary.get("role_fit") or summary.get("best_fit_role") or "Not available")
    main_blocker = _safe_pdf_text(summary.get("main_blocker") or summary.get("main_hiring_blocker") or "Not available")
    round_1_likelihood = _safe_pdf_text(summary.get("round_1_likelihood") or summary.get("shortlist_signal") or "Not available")
    fastest_next = _safe_pdf_text(summary.get("fastest_next_improvement") or summary.get("fastest_improvement") or "Not available")

    _section_heading(
        pdf,
        "Hiring-Panel Readiness",
        "Premium placement-oriented coaching summary for recruiter confidence, role fit, and next practice goals.",
        fill_rgb=(23, 37, 84),
    )

    # Ensure enough room for both card rows before drawing the grid
    _ensure_page_capacity(pdf, 62)
    grid_x = pdf.l_margin
    grid_y = pdf.get_y()
    gap = 4
    card_w = (pdf.w - pdf.l_margin - pdf.r_margin - gap) / 2

    card_1 = _render_info_card(pdf, grid_x, grid_y, card_w, "Technical Readiness", technical_readiness)
    card_2 = _render_info_card(pdf, grid_x + card_w + gap, grid_y, card_w, "Role Fit", role_fit)
    row_1_h = max(card_1, card_2)
    row_2_y = grid_y + row_1_h + gap

    card_3 = _render_info_card(pdf, grid_x, row_2_y, card_w, "Round 1 Likelihood", round_1_likelihood)
    card_4 = _render_info_card(pdf, grid_x + card_w + gap, row_2_y, card_w, "Main Blocker", main_blocker)
    pdf.set_y(row_2_y + max(card_3, card_4) + 4)

    box_width = pdf.w - pdf.l_margin - pdf.r_margin

    # Each labeled box must fit as one unit. Pre-measure and move the whole box
    # to the next page if it would otherwise split (label on one page, body on
    # the next) — the original cause of the large blank gaps in the report.
    impression_y = _place_labeled_box(pdf, recruiter_impression, box_width)
    impression_h = _render_labeled_box(
        pdf, pdf.l_margin, impression_y, box_width,
        "Recruiter Impression", recruiter_impression,
        (23, 37, 84), (238, 242, 255),
    )
    pdf.set_y(impression_y + impression_h + 3)

    risk_y = _place_labeled_box(pdf, fastest_next, box_width)
    top_risk_h = _render_labeled_box(
        pdf, pdf.l_margin, risk_y, box_width,
        "Fastest Next Improvement", fastest_next,
        (153, 27, 27), (254, 242, 242),
    )
    pdf.set_y(risk_y + top_risk_h + 3)

    best_sample_style = _safe_pdf_text(summary.get("best_sample_answer_style", ""))
    improvement_y = _place_labeled_box(pdf, best_sample_style, box_width)
    improvement_h = _render_labeled_box(
        pdf, pdf.l_margin, improvement_y, box_width,
        "Best Sample Answer Style",
        best_sample_style,
        (180, 83, 9), (255, 251, 235),
    )
    pdf.set_y(improvement_y + improvement_h + 3)
    pdf.ln(1)

    _section_heading(
        pdf,
        "Top 3 Next Practice Goals",
        "The fastest actions to improve the next career-round interview.",
        fill_rgb=(20, 83, 45),
    )
    _render_bullets(pdf, _coerce_list(summary.get("next_practice_goals", [])), "Keep practicing to surface the next improvement goals.")
    pdf.ln(2)


def _render_pro_summary(pdf, summary: dict) -> None:
    if not isinstance(summary, dict) or not summary:
        return

    _section_heading(
        pdf,
        "Technical Readiness",
        "Pro-plan coaching summary for technical readiness, the main blocker, and the fastest next improvement.",
        fill_rgb=(23, 37, 84),
    )

    # Ensure enough room for the card row before drawing
    _ensure_page_capacity(pdf, 34)
    grid_x = pdf.l_margin
    grid_y = pdf.get_y()
    gap = 4
    card_w = (pdf.w - pdf.l_margin - pdf.r_margin - gap) / 2

    card_1 = _render_info_card(
        pdf, grid_x, grid_y, card_w,
        "Current Technical Readiness",
        _safe_pdf_text(summary.get("current_technical_readiness", "Not available")),
    )
    card_2 = _render_info_card(
        pdf, grid_x + card_w + gap, grid_y, card_w,
        "Fastest Next Improvement",
        _safe_pdf_text(summary.get("fastest_next_improvement", "Not available")),
    )
    pdf.set_y(grid_y + max(card_1, card_2) + 4)

    box_width = pdf.w - pdf.l_margin - pdf.r_margin

    main_blocker = _safe_pdf_text(summary.get("main_blocker", ""))
    blocker_y = _place_labeled_box(pdf, main_blocker, box_width)
    blocker_h = _render_labeled_box(
        pdf, pdf.l_margin, blocker_y, box_width,
        "Main Blocker",
        main_blocker,
        (153, 27, 27), (254, 242, 242),
    )
    pdf.set_y(blocker_y + blocker_h + 3)

    tech_impression = _safe_pdf_text(summary.get("technical_interview_impression", ""))
    impression_y = _place_labeled_box(pdf, tech_impression, box_width)
    impression_h = _render_labeled_box(
        pdf, pdf.l_margin, impression_y, box_width,
        "Technical Interview Impression",
        tech_impression,
        (37, 99, 235), (239, 246, 255),
    )
    pdf.set_y(impression_y + impression_h + 4)


def _measure_labeled_box_height(pdf, text: str, width: float, line_height: float = 4.8) -> float:
    pdf.set_font("Helvetica", "", 10)
    return max(18.0, _estimate_block_height(pdf, text, width - 8, line_height) + 9.5)


def _place_labeled_box(pdf, text: str, width: float, gap: float = 3.0) -> float:
    """Pre-measure a labeled box and ensure the whole block fits on the current
    page before it is drawn. Returns the y at which the caller should draw it.

    Without this, a box whose label fits at the bottom of a page but whose body
    does not would split across two pages — fpdf's auto page-break fires mid
    multi_cell, stranding the coloured label alone and leaving a large blank
    gap. Keeping the box intact removes that wasted whitespace.
    """
    needed = _measure_labeled_box_height(pdf, _safe_pdf_text(text) or "Not available.", width)
    _ensure_page_capacity(pdf, needed + gap)
    return pdf.get_y()


def _render_labeled_box(
    pdf,
    x: float,
    y: float,
    width: float,
    label: str,
    text: str,
    label_fill_rgb: tuple[int, int, int],
    box_fill_rgb: tuple[int, int, int],
    body_text_rgb: tuple[int, int, int] = (30, 41, 59),
) -> float:
    safe_label = _safe_pdf_text(label)
    safe_text = _safe_pdf_text(text) or "Not available."
    box_height = _measure_labeled_box_height(pdf, safe_text, width)

    pdf.set_fill_color(*box_fill_rgb)
    pdf.set_draw_color(226, 232, 240)
    pdf.rect(x, y, width, box_height, style="DF")

    label_width = min(max(pdf.get_string_width(safe_label) + 8, 28), width - 8)
    pdf.set_fill_color(*label_fill_rgb)
    pdf.rect(x + 3, y + 2.5, label_width, 5.4, style="F")
    pdf.set_xy(x + 3, y + 3.6)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(label_width, 3, safe_label, align="C")

    pdf.set_xy(x + 4, y + 9.2)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*body_text_rgb)
    pdf.multi_cell(width - 8, 4.8, safe_text)
    return box_height


def _render_question_header(
    pdf,
    index: int,
    category: str,
    classification: str,
    score_text: str,
    continued: bool = False,
) -> None:
    header_h = 10
    _ensure_page_capacity(pdf, header_h + 2)

    left = pdf.l_margin
    width = pdf.w - pdf.l_margin - pdf.r_margin
    top = pdf.get_y()

    pdf.set_fill_color(11, 22, 43)
    pdf.rect(left, top, width, header_h, style="F")

    # Left accent stripe on question header
    pdf.set_fill_color(37, 99, 235)
    pdf.rect(left, top, 3, header_h, style="F")

    pdf.set_xy(left + 5, top + 2.7)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(255, 255, 255)
    title = f"Q{index}" + (" (continued)" if continued else "")
    pdf.cell(28, 5, title)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(191, 219, 254)
    pdf.cell(68, 5, _safe_pdf_text(category))

    score_w = pdf.get_string_width(score_text) + 8
    class_w = pdf.get_string_width(classification) + 8
    class_fg, _ = _classification_palette(classification)
    score_x = left + width - score_w - 4
    class_x = score_x - class_w - 3
    _draw_chip(pdf, class_x, top + 2.2, classification, class_fg, (255, 255, 255))
    _draw_chip(pdf, score_x, top + 2.2, score_text, (37, 99, 235), (255, 255, 255))

    # Restore Y to below the header bar
    pdf.set_y(top + header_h + 2)


def _render_rubric_row(pdf, category: str, score: float, alternate: bool = False) -> None:
    """
    Draw a single rubric score bar row.
    IMPROVED: alternating row backgrounds, long category name truncation,
    score label always visible, minimum row height enforced.
    """
    _ensure_page_capacity(pdf, 9)

    row_h = 7.5
    start_x = pdf.l_margin
    start_y = pdf.get_y()
    row_width = pdf.w - pdf.l_margin - pdf.r_margin

    # Alternating light background
    if alternate:
        pdf.set_fill_color(248, 250, 252)
        pdf.rect(start_x, start_y, row_width, row_h, style="F")

    # Truncate long category name to fit the 48mm label column
    pdf.set_font("Helvetica", "B", 9)
    safe_category = _safe_pdf_text(str(category).replace("_", " ").title())
    max_label_w = 46.0
    if pdf.get_string_width(safe_category) > max_label_w:
        while safe_category and pdf.get_string_width(safe_category + "...") > max_label_w:
            safe_category = safe_category[:-1]
        safe_category = safe_category.rstrip() + "..."

    safe_score = _clamp_score(score)
    ratio = safe_score / 10.0
    bar_rgb = (22, 163, 74) if ratio >= 0.7 else (202, 138, 4) if ratio >= 0.5 else (220, 38, 38)

    pdf.set_text_color(51, 65, 85)
    pdf.set_xy(start_x + 2, start_y + 1.3)
    pdf.cell(48, 5, safe_category)

    bar_x = start_x + 52
    bar_y = start_y + 2.0
    bar_w = 96.0
    bar_h = 3.5

    pdf.set_fill_color(226, 232, 240)
    pdf.rect(bar_x, bar_y, bar_w, bar_h, style="F")
    pdf.set_fill_color(*bar_rgb)
    pdf.rect(bar_x, bar_y, max(3.5, bar_w * ratio), bar_h, style="F")

    pdf.set_xy(bar_x + bar_w + 4, start_y + 1.3)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(16, 5, f"{safe_score:.1f}/10", ln=1)

    pdf.set_y(start_y + row_h)


def _render_question_block(pdf, index: int, evaluation: dict) -> None:
    question = _safe_pdf_text(evaluation.get("question_text", "") or "Question unavailable.")
    answer = _safe_pdf_text(evaluation.get("normalized_answer", "") or evaluation.get("raw_answer", "") or "No answer provided.")
    corrected_intent = _safe_pdf_text(evaluation.get("corrected_intent", ""))
    what_worked = _safe_pdf_text(evaluation.get("what_worked", ""))
    evaluator_note = _safe_pdf_text(evaluation.get("scoring_rationale", "") or "A detailed evaluator note was not available for this answer.")
    improvements = " | ".join(_build_improvement_points(evaluation))
    improved_answer = _build_improved_answer(evaluation)
    category = _safe_pdf_text(str(evaluation.get("rubric_category", "general") or "general").replace("_", " ").title())
    classification = _safe_pdf_text((evaluation.get("classification", "vague") or "vague").upper())
    score_text = f"{_clamp_score(evaluation.get('score', 0)):.1f}/10"
    answer_status = _safe_pdf_text(evaluation.get("answer_status", ""))
    technical_understanding = _safe_pdf_text(evaluation.get("content_understanding", ""))
    depth_quality = _safe_pdf_text(evaluation.get("depth_quality", ""))
    communication_clarity = _safe_pdf_text(evaluation.get("communication_clarity", ""))
    answer_blueprint = _safe_pdf_text(evaluation.get("answer_blueprint", ""))
    answer_duration_seconds = evaluation.get("answer_duration_seconds")
    plan = _safe_pdf_text(evaluation.get("plan", ""))

    show_signal_breakdown = any(
        [
            answer_status,
            corrected_intent,
            technical_understanding,
            communication_clarity,
            _clamp_score(evaluation.get("relevance_score", 0), 2.0) > 0,
            _clamp_score(evaluation.get("clarity_score", 0), 2.0) > 0,
            _clamp_score(evaluation.get("specificity_score", 0), 2.0) > 0,
            _clamp_score(evaluation.get("structure_score", 0), 2.0) > 0,
            _clamp_score((evaluation.get("communication_score", 0) or 0) / 5, 2.0) > 0,
        ]
    )

    score_parts: list[str] = []
    if show_signal_breakdown:
        if plan == "free":
            if evaluation.get("relevance_score") is not None:
                score_parts.append(f"Question match: {_clamp_score(evaluation.get('relevance_score', 0), 2.0):.1f}")
            if evaluation.get("clarity_score") is not None:
                score_parts.append(f"Basic accuracy: {_clamp_score(evaluation.get('clarity_score', 0), 2.0):.1f}")
            if evaluation.get("specificity_score") is not None:
                score_parts.append(f"Specificity: {_clamp_score(evaluation.get('specificity_score', 0), 2.0):.1f}")
            if evaluation.get("structure_score") is not None:
                score_parts.append(f"Structure: {_clamp_score(evaluation.get('structure_score', 0), 2.0):.1f}")
            if evaluation.get("communication_score") is not None:
                score_parts.append(f"Communication: {_clamp_score((evaluation.get('communication_score', 0) or 0) / 5, 2.0):.1f}")
        else:
            if evaluation.get("relevance_score") is not None:
                score_parts.append(f"Question match: {_clamp_score(evaluation.get('relevance_score', 0), 2.0):.1f}")
            if evaluation.get("clarity_score") is not None:
                score_parts.append(f"Technical accuracy: {_clamp_score(evaluation.get('clarity_score', 0), 2.0):.1f}")
            if evaluation.get("specificity_score") is not None:
                score_parts.append(f"Specificity: {_clamp_score(evaluation.get('specificity_score', 0), 2.0):.1f}")
            if evaluation.get("structure_score") is not None:
                score_parts.append(f"Structure: {_clamp_score(evaluation.get('structure_score', 0), 2.0):.1f}")
            if evaluation.get("communication_score") is not None:
                score_parts.append(f"Communication: {_clamp_score((evaluation.get('communication_score', 0) or 0) / 5, 2.0):.1f}")

    signal_lines = []
    if answer_duration_seconds is not None:
        try:
            duration_value = int(answer_duration_seconds)
        except (TypeError, ValueError):
            duration_value = None
        if duration_value is not None:
            signal_lines.append(f"Response time: {duration_value}s")
    if answer_status:
        signal_lines.append(f"{'Answer label' if plan in {'free', 'career', 'pro'} else 'Answer status'}: {answer_status}")
    if plan == "career":
        if technical_understanding or depth_quality or communication_clarity:
            signal_lines.append(
                f"Content quality: {technical_understanding or 'Not available'} | Depth quality: {depth_quality or 'Not available'} | Answer delivery: {communication_clarity or 'Not available'}"
            )
    elif plan == "free":
        if technical_understanding:
            signal_lines.append(f"Idea quality: {technical_understanding}")
        if communication_clarity:
            signal_lines.append(f"Speaking clarity: {communication_clarity}")
    elif plan == "pro":
        if technical_understanding:
            signal_lines.append(f"Technical understanding: {technical_understanding}")
        if communication_clarity:
            signal_lines.append(f"Answer delivery: {communication_clarity}")
    elif technical_understanding or communication_clarity:
        signal_lines.append(
            f"Technical understanding: {technical_understanding or 'Not available'} | Communication clarity: {communication_clarity or 'Not available'}"
        )
    if score_parts:
        signal_lines.append("Score parts: " + " | ".join(score_parts))
    signal_text = "\n".join(signal_lines)

    if plan == "free":
        insight_lines: list[str] = []
        if what_worked:
            insight_lines.append(f"What worked: {what_worked}")
        if evaluator_note:
            insight_lines.append(f"Score summary: {evaluator_note}")
        if _safe_pdf_text(evaluation.get("what_was_missing", "")):
            insight_lines.append(f"Why the score is not higher: {_safe_pdf_text(evaluation.get('what_was_missing', ''))}")
        evaluator_note = "\n".join(insight_lines) or evaluator_note
        improvements = _safe_pdf_text(evaluation.get("how_to_improve", "")) or "Speak in 2-3 short sentences and include one clear example."
    elif plan == "pro":
        insight_lines = []
        if what_worked:
            insight_lines.append(f"What you got right: {what_worked}")
        if evaluator_note:
            insight_lines.append(f"Score summary: {evaluator_note}")
        if _safe_pdf_text(evaluation.get("what_was_missing", "")):
            insight_lines.append(f"Main technical gap: {_safe_pdf_text(evaluation.get('what_was_missing', ''))}")
        evaluator_note = "\n".join(insight_lines) or evaluator_note
        improvements = _safe_pdf_text(evaluation.get("how_to_improve", "")) or "Answer technical questions in the order: method -> reason -> result."
    elif plan == "career":
        insight_lines = []
        if what_worked:
            insight_lines.append(f"What you did well: {what_worked}")
        if evaluator_note:
            insight_lines.append(f"Score summary: {evaluator_note}")
        if _safe_pdf_text(evaluation.get("what_was_missing", "")):
            insight_lines.append(f"Main gap: {_safe_pdf_text(evaluation.get('what_was_missing', ''))}")
        evaluator_note = "\n".join(insight_lines) or evaluator_note
    elif what_worked:
        evaluator_note = f"What you got right: {what_worked}\nWhy this score: {evaluator_note}"

    display_chip = answer_status if answer_status else classification

    left = pdf.l_margin
    width = pdf.w - pdf.l_margin - pdf.r_margin
    continued = False
    gap = 2

    _render_question_header(pdf, index, category, _safe_pdf_text(display_chip), score_text, continued=False)

    sections: list[tuple[str, str, tuple[int, int, int], tuple[int, int, int]]] = [
        ("Interview Question", question, (15, 23, 42), (248, 250, 252)),
        ("User Answer", answer, (30, 64, 175), (247, 250, 255)),
    ]

    if corrected_intent:
        sections.append(("Corrected Intent", corrected_intent, (67, 56, 202), (245, 243, 255)))
    if signal_text:
        sections.append(("Evaluation Signals", signal_text, (30, 41, 59), (248, 250, 252)))

    sections.append(("Evaluator Insight", evaluator_note, (71, 85, 105), (248, 250, 252)))

    if plan == "career":
        why_this_matters = _safe_pdf_text(evaluation.get("communication_notes", ""))
        if why_this_matters:
            sections.append(("Why This Matters In A Real Interview", why_this_matters, (153, 27, 27), (254, 242, 242)))
    else:
        sections.append(
            (
                "Next Time Do This" if plan == "free" else "How To Answer This Better" if plan == "pro" else "How To Improve",
                improvements,
                (180, 83, 9),
                (255, 251, 235),
            )
        )

    if answer_blueprint:
        sections.append(("Best Answer Structure", answer_blueprint, (6, 95, 70), (236, 253, 245)))

    sections.append((("Better Answer" if plan in {"free", "career"} else "Improved Answer"), improved_answer, (37, 99, 235), (239, 246, 255)))

    for label, body, label_fill_rgb, box_fill_rgb in sections:
        needed_height = _measure_labeled_box_height(pdf, body, width) + gap
        if pdf.get_y() + needed_height > pdf.page_break_trigger:
            pdf.add_page()
            continued = True
            _render_question_header(pdf, index, category, _safe_pdf_text(display_chip), score_text, continued=continued)

        top = pdf.get_y()
        box_height = _render_labeled_box(pdf, left, top, width, label, body, label_fill_rgb, box_fill_rgb)
        pdf.set_y(top + box_height + gap)

    pdf.ln(1.5)

