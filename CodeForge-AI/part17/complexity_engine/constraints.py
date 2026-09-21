"""
complexity_engine.constraints
================================
Parses simple competitive-programming-style constraint text and
evaluates whether a derived complexity is likely to fit within it,
using an explicit, explainable operations-per-second heuristic rather
than an AI-generated score.

Assumption (documented, adjustable): a typical online judge / sandbox
can execute on the order of 1e8 simple operations per second within a
~1-2s time limit. This is a standard competitive-programming rule of
thumb, not a guarantee.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

from .expressions import ComplexityClass, TermKind


OPS_PER_SECOND = 1e8


class Risk(Enum):
    LOW = "LOW RISK"
    MODERATE = "MODERATE RISK"
    HIGH = "HIGH RISK"
    LIKELY_INFEASIBLE = "LIKELY INFEASIBLE"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class ConstraintSet:
    bounds: Dict[str, float]  # variable name -> max value
    raw_text: str

    def to_dict(self) -> dict:
        return {"bounds": self.bounds, "raw_text": self.raw_text}


_NUM = r"(\d+\s*\^\s*\d+|\d+(?:\.\d+)?(?:\s*[eE×x\*]\s*10\^?\d+)?)"
_BOUND_RE = re.compile(
    rf"([A-Za-z][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)*)\s*(?:<=|≤|<)\s*{_NUM}"
)


def _parse_number(raw: str) -> Optional[float]:
    raw = raw.strip().replace(" ", "")
    try:
        if "^" in raw and ("e" not in raw.lower() and "x" not in raw.lower() and "×" not in raw.lower()
                            and "*" not in raw):
            base, exp = raw.split("^")
            return float(base) ** float(exp)
        m = re.match(r"^(\d+(?:\.\d+)?)[×x\*]10\^?(\d+)$", raw, re.IGNORECASE)
        if m:
            return float(m.group(1)) * (10 ** float(m.group(2)))
        m = re.match(r"^(\d+(?:\.\d+)?)e(\d+)$", raw, re.IGNORECASE)
        if m:
            return float(m.group(1)) * (10 ** float(m.group(2)))
        return float(raw)
    except (ValueError, ZeroDivisionError):
        return None


def parse_constraints(text: Optional[str]) -> Optional[ConstraintSet]:
    """Extracts `var <= number` style bounds from free-form constraint
    text (e.g. "1 <= n, m <= 10^5"). Returns None if nothing recognizable
    is found — UNKNOWN is preferred over a guessed bound."""
    if not text or not text.strip():
        return None
    bounds: Dict[str, float] = {}
    for match in _BOUND_RE.finditer(text):
        names_part, num_part = match.group(1), match.group(2)
        value = _parse_number(num_part)
        if value is None:
            continue
        for name in [n.strip() for n in names_part.split(",")]:
            if name.lower() in ("i", "j", "k"):  # loop counters, not size params
                continue
            bounds[name] = max(bounds.get(name, 0), value)
    if not bounds:
        return None
    return ConstraintSet(bounds=bounds, raw_text=text)


def _estimate_ops(cc: ComplexityClass, bounds: Dict[str, float]) -> Optional[float]:
    known = [t for t in cc.terms if t.kind is not TermKind.UNKNOWN]
    if not known:
        return None
    # Use the single dominant term (there is normally exactly one after
    # simplify(), except for genuinely incomparable multi-variable terms —
    # in that case, sum their individual estimates).
    total = 0.0
    for t in known:
        if t.kind is TermKind.CONSTANT:
            total += 1
        elif t.kind is TermKind.EXPONENTIAL:
            n = bounds.get(t.exp_var)
            if n is None:
                return None
            if n > 60:  # would overflow / is astronomically infeasible regardless
                return float("inf")
            total += t.exp_base ** n
        elif t.kind is TermKind.POLY_LOG:
            if not t.var_set:
                value = 1.0
            else:
                value = 1.0
                for v, p in t.powers:
                    n = bounds.get(v)
                    if n is None:
                        return None
                    value *= n ** p
            for v, p in t.log_powers:
                n = bounds.get(v)
                if n is None:
                    return None
                value *= max(math_log2(n), 1) ** p
            total += value
        else:
            return None
    return total


def math_log2(x: float) -> float:
    import math
    return math.log2(x) if x > 0 else 0.0


def assess_constraint_fit(cc: ComplexityClass, constraints: Optional[ConstraintSet]) -> "ConstraintAssessment":
    if constraints is None:
        return ConstraintAssessment(Risk.UNKNOWN, None, "no parseable constraints supplied")
    if cc.has_unknown and len([t for t in cc.terms if t.kind is not TermKind.UNKNOWN]) == 0:
        return ConstraintAssessment(Risk.UNKNOWN, None, "complexity itself is unresolved")

    ops = _estimate_ops(cc, constraints.bounds)
    if ops is None:
        return ConstraintAssessment(Risk.UNKNOWN, None,
                                     "complexity involves a variable with no matching constraint bound")
    if ops == float("inf") or ops > 1e10:
        return ConstraintAssessment(Risk.LIKELY_INFEASIBLE, ops,
                                     f"~{ops:.2e} operations at the given bounds — far beyond a typical judge's budget")
    if ops <= 1e7:
        return ConstraintAssessment(Risk.LOW, ops, f"~{ops:.2e} operations at the given bounds — comfortable")
    if ops <= OPS_PER_SECOND:
        return ConstraintAssessment(Risk.MODERATE, ops, f"~{ops:.2e} operations — likely fine within a ~1s budget")
    if ops <= 1e9:
        return ConstraintAssessment(Risk.HIGH, ops,
                                     f"~{ops:.2e} operations — tight; a ~1s limit would likely be exceeded")
    return ConstraintAssessment(Risk.LIKELY_INFEASIBLE, ops,
                                 f"~{ops:.2e} operations — very likely to exceed typical time limits")


@dataclass(frozen=True)
class ConstraintAssessment:
    risk: Risk
    estimated_ops: Optional[float]
    explanation: str

    def to_dict(self) -> dict:
        return {"risk": self.risk.value, "estimated_ops": self.estimated_ops, "explanation": self.explanation}
