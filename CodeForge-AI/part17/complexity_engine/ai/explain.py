"""
complexity_engine.ai.explain
===============================
The only function that should be called from outside this package:
`explain(report, call_fn=None) -> Optional[AIExplanationResponse]`.

FAILURE ISOLATION IS THE POINT: any exception from the network call,
the provider, or output validation results in `None`, never a raised
exception and never a fabricated explanation. The deterministic
ComplexityReport this is explaining is complete and usable on its own
before this function is ever called — this only adds a plain-language
layer on top when it's available.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional

from .contract import AIExplanationRequest, AIExplanationResponse, InvalidAIResponse, parse_and_validate
from .providers import NoProviderConfigured, resolve_provider
from ..report import ComplexityReport

logger = logging.getLogger("complexity_engine.ai")


def build_request(report: ComplexityReport, source: str, problem_statement: Optional[str] = None,
                   constraints_text: Optional[str] = None, max_source_chars: int = 4000) -> AIExplanationRequest:
    return AIExplanationRequest(
        problem_statement=problem_statement,
        constraints_text=constraints_text,
        source_excerpt=source[:max_source_chars],
        time_complexity=report.time_complexity.render(),
        space_complexity=report.space_complexity.render(),
        dominant_cost=report.dominant_cost,
        findings=[f.description for f in report.findings],
        confidence=report.confidence.value,
        constraint_risk=report.constraint_assessment.risk.value if report.constraint_assessment else None,
    )


def explain(report: ComplexityReport, source: str, call_fn: Optional[Callable[[str], str]] = None,
            problem_statement: Optional[str] = None, constraints_text: Optional[str] = None
            ) -> Optional[AIExplanationResponse]:
    """`call_fn` defaults to whichever real provider has a key configured
    (see providers.resolve_provider). Pass a different callable — e.g. one
    wired to your existing AI provider abstraction — to override it
    entirely without touching this function."""
    request = build_request(report, source, problem_statement, constraints_text)
    try:
        fn = call_fn or resolve_provider()
    except NoProviderConfigured as e:
        logger.info("AI explanation skipped: %s", e)
        return None

    try:
        raw = fn(request.to_prompt())
    except Exception as e:  # noqa: BLE001 - any provider/network failure must not break the deterministic result
        logger.warning("AI explanation call failed, continuing without it: %s", e)
        return None

    try:
        return parse_and_validate(raw)
    except InvalidAIResponse as e:
        logger.warning("AI explanation response rejected by validator: %s", e)
        return None
