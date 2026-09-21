"""
complexity_engine.report
===========================
The final structured result. Every field is derived from real analysis
— nothing here is free-text from an LLM. `source_identity()` gives a
stable cache/idempotency key (submission content + language + function
+ analysis engine version): the same immutable submission always gets
the same key, and bumping ANALYSIS_VERSION invalidates old cached
results instead of silently reinterpreting them.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from .constraints import ConstraintAssessment
from .evidence import Confidence, Finding
from .expressions import ComplexityClass

ANALYSIS_VERSION = "1.0.0"


@dataclass(frozen=True)
class ComplexityReport:
    language: str
    function_name: str
    time_complexity: ComplexityClass
    space_complexity: ComplexityClass
    best_case: Optional[ComplexityClass]
    dominant_cost: str
    confidence: Confidence
    findings: Tuple[Finding, ...]
    constraint_assessment: Optional[ConstraintAssessment]
    recursive: bool
    source_hash: str
    analysis_version: str = ANALYSIS_VERSION
    ai_explanation: Optional[dict] = None

    def with_ai_explanation(self, explanation: Optional[dict]) -> "ComplexityReport":
        return ComplexityReport(**{**self.__dict__, "ai_explanation": explanation})

    def to_dict(self) -> Dict[str, Any]:
        return {
            "language": self.language,
            "function_name": self.function_name,
            "time_complexity": self.time_complexity.to_dict(),
            "space_complexity": self.space_complexity.to_dict(),
            "best_case": self.best_case.to_dict() if self.best_case else None,
            "dominant_cost": self.dominant_cost,
            "confidence": self.confidence.value,
            "findings": [f.to_dict() for f in self.findings],
            "constraint_assessment": self.constraint_assessment.to_dict() if self.constraint_assessment else None,
            "recursive": self.recursive,
            "source_hash": self.source_hash,
            "analysis_version": self.analysis_version,
            "ai_explanation": self.ai_explanation,
        }


def source_identity(source: str, language: str, function_name: str) -> str:
    h = hashlib.sha256()
    for part in (language, "::", function_name, "::", source, "::", ANALYSIS_VERSION):
        h.update(part.encode("utf-8"))
    return h.hexdigest()
