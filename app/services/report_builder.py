"""
PrepVista AI - PDF Report Builder
Professional interview-report PDFs with a polished fpdf2 layout and a content-rich raw fallback.
"""

from __future__ import annotations

import io
import json
import structlog
import unicodedata
from datetime import datetime

from app.config import PLAN_CONFIG

logger = structlog.get_logger("prepvista.report_builder")


# ---------------------------------------------------------------------------
# Safe-value helpers
# ---------------------------------------------------------------------------

def _coerce_json_object(value) -> dict:
    if isinstance(value, dict):
        return value

    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    return {}


def _safe_text(value) -> str:
    if value is None:
        return ""

    if isinstance(value, (list, tuple)):
        return ", ".join(_safe_text(item) for item in value if item is not None)

    return str(value).replace("\r", " ").replace("\n", " ").strip()


def _safe_pdf_text(value) -> str:
    normalized = unicodedata.normalize("NFKD", _safe_text(value))
    normalized = normalized.replace("\u2013", "-").replace("\u2014", "-").replace("\u2022", "-")
    normalized = normalized.replace("\u2018", "'").replace("\u2019", "'")
    normalized = normalized.replace("\u201c", '"').replace("\u201d", '"')
    return normalized.encode("latin-1", "ignore").decode("latin-1")


def _coerce_list(value) -> list[str]:
    if isinstance(value, (list, tuple)):
        return [item for item in (_safe_pdf_text(entry) for entry in value) if item]

    if isinstance(value, str):
        if not value.strip():
            return []
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [item for item in (_safe_pdf_text(entry) for entry in parsed) if item]
        except Exception:
            pass
        text = _safe_pdf_text(value)
        return [text] if text else []

    text = _safe_pdf_text(value)
    return [text] if text else []


def _clamp_score(value, maximum: float = 10.0) -> float:
    try:
        return max(0.0, min(maximum, float(value)))
    except Exception:
        return 0.0


def _score_palette(score: float) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    if score >= 70:
        return (22, 163, 74), (240, 253, 244)
    if score >= 50:
        return (202, 138, 4), (254, 252, 232)
    return (220, 38, 38), (254, 242, 242)


def _classification_palette(classification: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    normalized = _safe_pdf_text(classification).lower()
    if normalized == "answered clearly":
        return (22, 163, 74), (240, 253, 244)
    if normalized == "answered partly":
        return (202, 138, 4), (254, 252, 232)
    if normalized == "answered briefly":
        return (2, 132, 199), (240, 249, 255)
    if normalized == "no answer":
        return (71, 85, 105), (241, 245, 249)
    if normalized == "strong":
        return (22, 163, 74), (240, 253, 244)
    if normalized == "partial":
        return (202, 138, 4), (254, 252, 232)
    if normalized == "wrong":
        return (220, 38, 38), (254, 242, 242)
    if normalized == "silent":
        return (71, 85, 105), (241, 245, 249)
    return (2, 132, 199), (240, 249, 255)


def _format_duration(seconds) -> str:
    try:
        total = max(0, int(seconds or 0))
    except Exception:
        return "Not recorded"

    minutes, remainder = divmod(total, 60)
    if minutes and remainder:
        return f"{minutes} min {remainder} sec"
    if minutes:
        return f"{minutes} min"
    return f"{remainder} sec"


def _format_timestamp(value) -> str:
    if not value:
        return datetime.utcnow().strftime("%d %b %Y")

    text = str(value).strip()
    for raw in (text, text.replace("Z", "+00:00")):
        try:
            return datetime.fromisoformat(raw).strftime("%d %b %Y, %I:%M %p")
        except Exception:
            continue
    return text


def _response_time_summary(evaluations: list[dict]) -> dict | None:
    timings: list[float] = []
    for evaluation in evaluations:
        value = evaluation.get("answer_duration_seconds")
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if numeric <= 0:
            continue
        timings.append(numeric)

    if not timings:
        return None

    average = sum(timings) / len(timings)
    return {
        "avg": round(average, 1),
        "min": round(min(timings), 1),
        "max": round(max(timings), 1),
    }


# ---------------------------------------------------------------------------
# Layout measurement helpers
# ---------------------------------------------------------------------------

def _count_wrapped_lines(pdf, text: str, width_mm: float) -> int:
    safe_text = _safe_pdf_text(text)
    if not safe_text:
        return 1

    usable_width = max(width_mm, 12.0)
    total_lines = 0

    for paragraph in safe_text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            total_lines += 1
            continue

        words = paragraph.split()
        if not words:
            total_lines += 1
            continue

        line_text = ""
        line_count = 1
        for word in words:
            candidate = f"{line_text} {word}".strip()
            if not line_text or pdf.get_string_width(candidate) <= usable_width:
                line_text = candidate
                continue

            if pdf.get_string_width(word) > usable_width:
                word_width = max(pdf.get_string_width(word), usable_width)
                line_count += max(1, int(word_width // usable_width))
                line_text = ""
                continue

            line_count += 1
            line_text = word

        total_lines += max(1, line_count)

    return max(1, total_lines)


def _estimate_block_height(pdf, text: str, width_mm: float, line_height: float) -> float:
    return max(line_height, _count_wrapped_lines(pdf, text, width_mm) * line_height)


def _ensure_page_capacity(pdf, needed_height: float) -> None:
    if pdf.get_y() + needed_height <= pdf.page_break_trigger:
        return
    pdf.add_page()


# ---------------------------------------------------------------------------
# Content builders
# ---------------------------------------------------------------------------

def _build_improvement_points(evaluation: dict) -> list[str]:
    points: list[str] = []

    what_was_missing = _safe_pdf_text(evaluation.get("what_was_missing", ""))
    if what_was_missing:
        points.append(what_was_missing)

    how_to_improve = _safe_pdf_text(evaluation.get("how_to_improve", ""))
    if how_to_improve:
        points.append(how_to_improve)

    rationale = _safe_pdf_text(evaluation.get("scoring_rationale", ""))
    if rationale:
        points.append(rationale)

    missing_items = _coerce_list(evaluation.get("missing_elements"))
    if missing_items:
        points.append(f"Add stronger coverage for: {', '.join(missing_items)}.")

    communication_notes = _safe_pdf_text(evaluation.get("communication_notes", ""))
    if communication_notes:
        points.append(f"Delivery refinement: {communication_notes}")

    if not points:
        points.append("Keep the answer structured, specific, and outcome-focused.")

    return points


def _build_improved_answer(evaluation: dict) -> str:
    ideal_answer = _safe_pdf_text(evaluation.get("ideal_answer", ""))
    if ideal_answer:
        return ideal_answer

    category = _safe_pdf_text(evaluation.get("rubric_category", "general")).lower()
    if "behavioral" in category:
        return "I would explain the situation clearly, the action I personally took, and the result it created. That keeps the answer specific and easier for the interviewer to trust."
    if "communication" in category:
        return "I would define the concept first, explain it in clear steps, and close with the practical takeaway. That makes the answer sound more controlled and interview-ready."
    if "problem" in category:
        return "I would define the problem first, explain the debugging or decision path, and then describe the fix and final improvement. That gives the interviewer a clearer technical story."
    return "I would explain the context first, then the technical decision or trade-off, and finish with the final impact. That makes the answer more concrete and easier to evaluate."


def _summary_dimension_labels(evaluations: list[dict]) -> tuple[list[str], list[str]]:
    category_scores: dict[str, list[float]] = {}
    labels = {
        "introduction": "background framing",
        "project_ownership": "ownership",
        "technical_depth": "technical depth",
        "problem_solving": "problem-solving",
        "behavioral": "behavioral examples",
        "communication": "role-fit communication",
    }
    for evaluation in evaluations:
        category = _safe_pdf_text(evaluation.get("rubric_category", "")).lower()
        if not category:
            continue
        try:
            score = float(evaluation.get("score", 0) or 0)
        except Exception:
            score = 0.0
        category_scores.setdefault(category, []).append(score)

    averaged = [
        (sum(scores) / max(len(scores), 1), labels.get(category, category.replace("_", " ")))
        for category, scores in category_scores.items()
        if scores
    ]
    averaged.sort(key=lambda item: item[0], reverse=True)
    strongest = [label for _, label in averaged[:2]]
    weakest = [label for _, label in averaged[-2:] if averaged and label not in strongest]
    return strongest, weakest


def _build_overall_summary(plan: str, score: float, strengths: list[str], weaknesses: list[str], evaluations: list[dict]) -> str:
    strong_count = sum(1 for item in evaluations if _safe_pdf_text(item.get("classification", "")).lower() == "strong")
    weak_count = sum(1 for item in evaluations if _safe_pdf_text(item.get("classification", "")).lower() in {"vague", "wrong", "silent"})
    plan_key = _safe_text(plan).lower() or "free"
    strongest_dims, weakest_dims = _summary_dimension_labels(evaluations)

    if score >= 80:
        if plan_key == "career":
            opener = "This career-round interview showed strong hiring signals, with good ownership, judgment, and role-fit readiness across most of the session."
        elif plan_key == "pro":
            opener = "This technical interview showed strong practical readiness, with clear evidence of ownership, method, and useful decision-making."
        else:
            opener = "This interview showed strong readiness with consistent answer quality across most of the session."
    elif score >= 60:
        if plan_key == "career":
            opener = "This career-round interview showed useful hiring signals, with clear potential to improve through sharper proof points, structure, and follow-through."
        elif plan_key == "pro":
            opener = "This technical interview showed a solid foundation, with clear potential to improve through sharper structure, fuller examples, and better technical proof."
        else:
            opener = "This interview showed a solid foundation, with clear potential to improve through sharper structure and fuller examples."
    else:
        if plan_key == "career":
            opener = "This career-round interview highlighted key hiring-readiness gaps, and focused practice should be used to improve clarity, proof, structure, and confidence."
        elif plan_key == "pro":
            opener = "This technical interview highlighted key growth areas, and focused practice should be used to improve clarity, structure, and method detail."
        else:
            opener = "This interview highlighted key growth areas, and focused practice should be used to improve clarity, structure, and confidence."

    evidence_bits: list[str] = []
    if strong_count:
        evidence_bits.append(f"{strong_count} answers were classified as strong")
    if weak_count:
        evidence_bits.append(f"{weak_count} answers need stronger follow-through")
    if strongest_dims:
        evidence_bits.append(f"the clearest signals came from {', '.join(strongest_dims)}")
    if strengths:
        evidence_bits.append(f"top strengths include {', '.join(strengths[:2])}")
    if weakest_dims and not weaknesses:
        evidence_bits.append(f"the next gains will come from {', '.join(weakest_dims[:1])}")
    if weaknesses:
        evidence_bits.append(f"priority improvement areas include {', '.join(weaknesses[:2])}")

    if evidence_bits:
        return f"{opener} In this session, {'; '.join(evidence_bits)}."
    return opener


# ---------------------------------------------------------------------------
# Raw PDF fallback helpers
# ---------------------------------------------------------------------------

def _escape_pdf_literal(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap_raw_lines(text: str, max_chars: int = 92) -> list[str]:
    clean = _safe_pdf_text(text)
    if not clean:
        return [""]

    words = clean.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [clean[:max_chars]]


def _minimal_pdf_report(score: float, plan: str, email: str, evaluations: list[dict]) -> bytes:
    lines = [
        "PrepVista Interview Report",
        f"Plan: {plan.upper()}",
        f"Score: {int(round(score))}/100",
        f"Candidate: {_safe_pdf_text(email)}",
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        "",
    ]

    for index, evaluation in enumerate(evaluations[:4], start=1):
        lines.append(f"Q{index}: {_safe_pdf_text(evaluation.get('question_text', 'Question unavailable'))}")
        lines.extend(_wrap_raw_lines(f"User answer: {_safe_pdf_text(evaluation.get('normalized_answer') or evaluation.get('raw_answer') or 'No answer provided.')}", 88))
        lines.extend(_wrap_raw_lines(f"Improve: {' | '.join(_build_improvement_points(evaluation))}", 88))
        lines.extend(_wrap_raw_lines(f"Improved answer: {_build_improved_answer(evaluation)}", 88))
        lines.append("")

    if len(evaluations) > 4:
        lines.append("Additional question details were omitted from this emergency fallback PDF.")

    y_position = 800
    content_lines = ["BT", "/F1 11 Tf"]
    first_line = True
    for line in lines:
        safe_line = _escape_pdf_literal(_safe_pdf_text(line))
        if first_line:
            content_lines.append(f"42 {y_position} Td ({safe_line}) Tj")
            first_line = False
        else:
            content_lines.append(f"0 -16 Td ({safe_line}) Tj")
    content_lines.append("ET")
    content_stream = "\n".join(content_lines).encode("latin-1", "ignore")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(content_stream), content_stream),
    ]

    buffer = io.BytesIO()
    buffer.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(buffer.tell())
        buffer.write(f"{index} 0 obj\n".encode("latin-1"))
        buffer.write(obj)
        buffer.write(b"\nendobj\n")

    xref_start = buffer.tell()
    buffer.write(f"xref\n0 {len(offsets)}\n".encode("latin-1"))
    buffer.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        buffer.write(f"{offset:010d} 00000 n \n".encode("latin-1"))
    buffer.write(
        (
            f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("latin-1")
    )
    return buffer.getvalue()


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

    impression_y = pdf.get_y()
    impression_h = _render_labeled_box(
        pdf, pdf.l_margin, impression_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Recruiter Impression", recruiter_impression,
        (23, 37, 84), (238, 242, 255),
    )
    pdf.set_y(impression_y + impression_h + 3)

    risk_y = pdf.get_y()
    top_risk_h = _render_labeled_box(
        pdf, pdf.l_margin, risk_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Fastest Next Improvement", fastest_next,
        (153, 27, 27), (254, 242, 242),
    )
    pdf.set_y(risk_y + top_risk_h + 3)

    improvement_y = pdf.get_y()
    improvement_h = _render_labeled_box(
        pdf, pdf.l_margin, improvement_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Best Sample Answer Style",
        _safe_pdf_text(summary.get("best_sample_answer_style", "")),
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

    blocker_y = pdf.get_y()
    blocker_h = _render_labeled_box(
        pdf, pdf.l_margin, blocker_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Main Blocker",
        _safe_pdf_text(summary.get("main_blocker", "")),
        (153, 27, 27), (254, 242, 242),
    )
    pdf.set_y(blocker_y + blocker_h + 3)

    impression_y = pdf.get_y()
    impression_h = _render_labeled_box(
        pdf, pdf.l_margin, impression_y,
        pdf.w - pdf.l_margin - pdf.r_margin,
        "Technical Interview Impression",
        _safe_pdf_text(summary.get("technical_interview_impression", "")),
        (37, 99, 235), (239, 246, 255),
    )
    pdf.set_y(impression_y + impression_h + 4)


def _measure_labeled_box_height(pdf, text: str, width: float, line_height: float = 4.8) -> float:
    pdf.set_font("Helvetica", "", 10)
    return max(18.0, _estimate_block_height(pdf, text, width - 8, line_height) + 9.5)


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
