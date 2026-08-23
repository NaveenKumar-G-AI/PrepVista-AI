"""
PrepVista — Negative-Marking Engine (Feature #01, M2)
=====================================================
Applies a round's ``negative_marking`` rule to a raw right/wrong tally and
returns the *adjusted* marks. Three models (mirrors ``NegativeMarking.model`` in
``models.py`` — the schema's authoritative vocabulary):

  * ``none``      — no penalty (TCS cognitive, Cognizant, Capgemini, …).
  * ``fixed``     — deduct ``penalty`` marks per wrong answer (legacy TCS 0.33).
  * ``threshold`` — the first ``threshold`` mistakes are free; every mistake
                    *beyond* the threshold is penalised (Wipro essay: ~5-mistake
                    rule → negative marking past the threshold).

Every number comes from the blueprint (``NegativeMarking``); nothing is
hardcoded. Pure stdlib, deterministic, no LLM. The engine is intentionally
*correct-only-scoring aware*: skipped/unattempted items are never penalised (all
three models penalise **wrong**, never blank), matching how these tests actually
score.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.company_sim.models import NegativeMarking


@dataclass
class MarkingResult:
    """Outcome of applying negative marking to one section/round tally."""

    raw_marks: float          # marks from correct answers only (correct * per_item)
    penalty_marks: float      # total deducted (>= 0)
    adjusted_marks: float     # max(raw - penalty, floor)
    max_marks: float          # total attainable (total_items * per_item)
    penalised_count: int      # how many wrongs actually incurred a penalty
    model: str                # which model was applied
    note: str = ""

    @property
    def adjusted_fraction(self) -> float:
        """Adjusted marks as a 0..1 fraction of the maximum (0 if no items)."""
        return (self.adjusted_marks / self.max_marks) if self.max_marks > 0 else 0.0


def apply_negative_marking(
    nm: NegativeMarking,
    *,
    correct: int,
    wrong: int,
    unanswered: int = 0,
    per_item_marks: float = 1.0,
    floor_at_zero: bool = True,
) -> MarkingResult:
    """
    Apply ``nm`` to a tally of correct/wrong/unanswered items.

    Args:
        nm: the round's negative-marking rule (from the blueprint).
        correct/wrong/unanswered: item counts for the section or round.
        per_item_marks: marks awarded per correct item (usually 1).
        floor_at_zero: clamp the adjusted score at 0 (real tests never go negative
            on a section total). Set False to inspect the raw signed value.

    Returns:
        A ``MarkingResult`` with raw/penalty/adjusted marks and how many wrongs
        were actually penalised (useful for coaching, e.g. Wipro filler/mistake
        counts).
    """
    correct = max(int(correct), 0)
    wrong = max(int(wrong), 0)
    unanswered = max(int(unanswered), 0)
    total_items = correct + wrong + unanswered
    max_marks = total_items * per_item_marks
    raw_marks = correct * per_item_marks

    penalised_count = 0
    penalty_marks = 0.0
    model = nm.model if nm else "none"

    if nm and nm.enabled and model == "fixed":
        penalised_count = wrong
        penalty_marks = wrong * max(nm.penalty, 0.0)
    elif nm and nm.enabled and model == "threshold":
        # First `threshold` mistakes are free; the rest are penalised. When no
        # explicit penalty is given, one mark per over-threshold mistake.
        over = max(wrong - max(nm.threshold, 0), 0)
        penalised_count = over
        per_mistake = nm.penalty if nm.penalty > 0 else per_item_marks
        penalty_marks = over * per_mistake
    # model == "none" (or disabled): no penalty.

    adjusted = raw_marks - penalty_marks
    if floor_at_zero:
        adjusted = max(adjusted, 0.0)

    return MarkingResult(
        raw_marks=round(raw_marks, 4),
        penalty_marks=round(penalty_marks, 4),
        adjusted_marks=round(adjusted, 4),
        max_marks=round(max_marks, 4),
        penalised_count=penalised_count,
        model=model,
        note=(nm.note if nm else ""),
    )
