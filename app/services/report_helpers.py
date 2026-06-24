"""
PrepVista AI - Report Helpers
Extracted from report_builder.py - safe accessors, formatters, and minimal PDF fallback.

Re-exported by report_builder.py (barrel file) for backward compatibility.
"""

from __future__ import annotations

import io
import json
import unicodedata
from datetime import datetime

from app.config import PLAN_CONFIG


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
        "situational_judgment": "situational judgment",
        "creative_thinking": "creative thinking",
        "ai_tool_fluency": "AI tool fluency",
        "programming_language": "programming language depth",
        "skill_verification": "skill verification",
        "certification": "certification depth",
        "self_assessment": "self-assessment",
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

