"""
complexity_engine.resolver
=============================
The single entrypoint most callers need:

    from complexity_engine.resolver import analyze
    report = analyze(source_code, language="python", constraints_text="1 <= n <= 10^5")

Deterministic analysis only — no AI call happens here. See
complexity_engine/ai/explain.py for the separate, optional explanation
layer, which never runs before this and never overrides its result.
"""
from __future__ import annotations

from typing import List, Optional

from .constraints import assess_constraint_fit, parse_constraints
from .evidence import Confidence, EvidenceKind, Finding
from .python_adapter import FunctionResult, NoFunctionFound, PythonSyntaxError, analyze_python_function
from .report import ComplexityReport, source_identity

SUPPORTED_LANGUAGES = {"python"}


class UnsupportedLanguage(Exception):
    pass


class AnalysisFailure(Exception):
    """One exception type with a `.kind` tag covering the documented
    production failure modes (SyntaxError, NoFunctionFound, ...) so a
    caller's error handling doesn't need a growing except-chain."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


_DOMINANT_PRIORITY = [
    EvidenceKind.RECURSIVE_CALL, EvidenceKind.DEPENDENT_LOOP, EvidenceKind.NESTED_LOOP,
    EvidenceKind.LOGARITHMIC_LOOP, EvidenceKind.LIBRARY_OPERATION, EvidenceKind.LOOP_BOUND,
    EvidenceKind.DATA_STRUCTURE_OPERATION,
]


def _pick_dominant_cost(findings: tuple) -> str:
    for kind in _DOMINANT_PRIORITY:
        matches = [f for f in findings if f.kind is kind and f.confidence in (Confidence.HIGH, Confidence.MEDIUM)]
        if matches:
            return matches[-1].description
    return "no single dominant operation identified from static analysis"


def analyze(source: str, language: str = "python", function_name: Optional[str] = None,
            constraints_text: Optional[str] = None) -> ComplexityReport:
    language = (language or "python").lower().strip()
    if language not in SUPPORTED_LANGUAGES:
        raise UnsupportedLanguage(
            f"language '{language}' is not supported yet — only {sorted(SUPPORTED_LANGUAGES)} "
            f"are implemented in this reference build. Add a new adapter module following "
            f"python_adapter.py's FunctionResult contract to extend it."
        )

    try:
        result: FunctionResult = analyze_python_function(source, function_name)
    except PythonSyntaxError as e:
        raise AnalysisFailure("SyntaxError", str(e)) from e
    except NoFunctionFound as e:
        raise AnalysisFailure("NoFunctionFound", str(e)) from e

    constraint_set = parse_constraints(constraints_text)
    assessment = assess_constraint_fit(result.time, constraint_set) if constraints_text else None

    return ComplexityReport(
        language=language,
        function_name=result.name,
        time_complexity=result.time,
        space_complexity=result.space,
        best_case=result.best_case,
        dominant_cost=_pick_dominant_cost(result.findings),
        confidence=result.confidence,
        findings=result.findings,
        constraint_assessment=assessment,
        recursive=result.recursive,
        source_hash=source_identity(source, language, result.name),
    )
