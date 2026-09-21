"""
complexity_engine.evidence
============================
Every complexity finding is backed by a structured Finding, not a
vague sentence. Confidence is derived from evidence quality, never
asserted independently of it.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Optional


class EvidenceKind(Enum):
    LOOP_BOUND = "LOOP_BOUND"
    NESTED_LOOP = "NESTED_LOOP"
    DEPENDENT_LOOP = "DEPENDENT_LOOP"
    LOGARITHMIC_LOOP = "LOGARITHMIC_LOOP"
    RECURSIVE_CALL = "RECURSIVE_CALL"
    MEMOIZATION = "MEMOIZATION"
    FUNCTION_CALL = "FUNCTION_CALL"
    DATA_STRUCTURE_OPERATION = "DATA_STRUCTURE_OPERATION"
    LIBRARY_OPERATION = "LIBRARY_OPERATION"
    MEMORY_ALLOCATION = "MEMORY_ALLOCATION"
    EARLY_EXIT = "EARLY_EXIT"
    CONSTRAINT = "CONSTRAINT"
    EXECUTION_OBSERVATION = "EXECUTION_OBSERVATION"
    UNRESOLVED = "UNRESOLVED"


class Confidence(Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


_ORDER = [Confidence.UNKNOWN, Confidence.LOW, Confidence.MEDIUM, Confidence.HIGH]


def weakest(confidences: Iterable[Confidence]) -> Confidence:
    vals = list(confidences)
    if not vals:
        return Confidence.UNKNOWN
    return min(vals, key=_ORDER.index)


@dataclass(frozen=True)
class Finding:
    kind: EvidenceKind
    description: str
    confidence: Confidence
    line: Optional[int] = None
    col: Optional[int] = None
    function: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "kind": self.kind.value,
            "description": self.description,
            "confidence": self.confidence.value,
            "line": self.line,
            "col": self.col,
            "function": self.function,
        }
