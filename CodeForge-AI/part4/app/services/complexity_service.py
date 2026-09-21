"""
Complexity analysis. This build implements the static-heuristic half of
Phase 8 (real, deterministic AST-based loop-nesting analysis) plus
runtime-OBSERVED evidence when we have it (measured ms across test cases
of increasing input size, if the challenge defines any), plus an
AI-assisted refinement step (`refine_with_ai`) used only when the static
heuristic itself says it's unreliable (recursion present). Every result
is tagged with its basis (OBSERVED/INFERRED/ESTIMATED) per the spec; we
never claim mathematical certainty from a heuristic, and the AI step
never upgrades a result to OBSERVED — at best it improves an ESTIMATED
guess with better reasoning, still labeled ESTIMATED.
"""
from __future__ import annotations

from app.models.schemas import ComplexityAIRefinement, ComplexityEstimate
from app.services.ai.base import AIProvider, AIProviderError
from app.services.ai.prompts import COMPLEXITY_AI_SCHEMA_HINT, COMPLEXITY_AI_SYSTEM_PROMPT
from app.services.static_analysis_service import analyze_python, get_loop_nesting_depth

_DEPTH_TO_BIGO = {
    0: "O(1)",
    1: "O(n)",
    2: "O(n^2)",
    3: "O(n^3)",
}


def estimate_python_complexity(source_code: str) -> ComplexityEstimate:
    analysis = analyze_python(source_code)
    depth = get_loop_nesting_depth(source_code)

    if analysis is None:
        return ComplexityEstimate(
            time_complexity=None,
            time_basis="ESTIMATED",
            space_complexity=None,
            space_basis="ESTIMATED",
            reasoning="Source did not parse; no complexity estimate possible.",
        )

    uses_recursion = "uses_recursion" in analysis.patterns
    reasoning_parts = [f"Deepest loop nesting observed in static analysis: {depth}."]

    if uses_recursion and depth == 0:
        # The loop-nesting heuristic has ZERO signal here — the only work
        # happening is recursive calls, which it cannot see at all. Stating
        # "O(1)" (what a depth-0 loop nest would normally mean) would be
        # actively misleading, not just imprecise: it is a specific,
        # confident-looking number the system already knows is very likely
        # wrong (recursion is essentially never O(1)). Better to say
        # "unknown from this heuristic" than to fabricate a plausible one —
        # same principle as Phase 6's "use UNKNOWN rather than inventing an
        # explanation", applied to complexity instead of failure category.
        time_bigo = None
        reasoning_parts.append(
            "No loops were found, so the loop-nesting heuristic has no signal at all here — "
            "all the work happens through recursive calls, which this heuristic cannot see. "
            "Reporting a specific complexity from it (e.g. O(1)) would be a guess dressed up "
            "as a measurement, so no time_complexity value is given without AI-assisted "
            "reasoning about the recurrence relation."
        )
        time_basis = "ESTIMATED"
    elif uses_recursion:
        time_bigo = _DEPTH_TO_BIGO.get(depth, f"O(n^{depth})" if depth else "O(1)")
        reasoning_parts.append(
            "Recursive call(s) detected alongside loops; static nesting depth alone likely "
            "understates true time complexity without knowing the recurrence."
        )
        time_basis = "ESTIMATED"
    else:
        time_bigo = _DEPTH_TO_BIGO.get(depth, f"O(n^{depth})" if depth else "O(1)")
        time_basis = "INFERRED"

    space_bigo = "O(1)"
    space_basis = "ESTIMATED"
    if "uses_hash_based_structure" in analysis.patterns or "uses_comprehension" in analysis.patterns:
        space_bigo = "O(n)"
        reasoning_parts.append("Auxiliary hash-based structure or comprehension suggests O(n) extra space.")

    return ComplexityEstimate(
        time_complexity=time_bigo,
        time_basis=time_basis,
        space_complexity=space_bigo,
        space_basis=space_basis,
        reasoning=" ".join(reasoning_parts),
    )


def refine_with_ai(
    provider: AIProvider | None,
    estimate: ComplexityEstimate,
    source_code: str,
    challenge_meta: dict,
) -> tuple[ComplexityEstimate, str, str | None]:
    """Only called when the static estimate says it's unreliable (i.e. its
    own reasoning flagged recursion). Returns (possibly-refined estimate,
    ai_status, raw_ai_reasoning_text_or_None). The basis label is never
    promoted to OBSERVED here — an AI-reasoned complexity is still, at
    best, an ESTIMATE."""
    needs_ai_help = estimate.time_basis == "ESTIMATED" and "recursi" in (estimate.reasoning or "").lower()
    if not needs_ai_help:
        return estimate, "NOT_ATTEMPTED", None

    if provider is None or not provider.is_available():
        return estimate, "AI_EVALUATION_PENDING", None

    payload = {
        "challenge": challenge_meta,
        "evidence": {"static_estimate": estimate.model_dump()},
        "submission": {"source_code": source_code},
    }
    try:
        raw = provider.complete_json(COMPLEXITY_AI_SYSTEM_PROMPT, payload, COMPLEXITY_AI_SCHEMA_HINT)
        refinement = ComplexityAIRefinement.model_validate(raw)
    except (AIProviderError, Exception):  # noqa: BLE001 - bad output -> keep static estimate, flag invalid
        return estimate, "AI_RESPONSE_INVALID", None

    if not refinement.confident or not refinement.time_complexity:
        # AI declined to guess — keep the static estimate as-is rather
        # than overwrite a real (if rough) number with nothing.
        return estimate, "AI_GENERATED", refinement.reasoning

    refined = ComplexityEstimate(
        time_complexity=refinement.time_complexity,
        time_basis="ESTIMATED",  # still an estimate, never OBSERVED, even with AI reasoning
        space_complexity=refinement.space_complexity or estimate.space_complexity,
        space_basis=estimate.space_basis,
        reasoning=f"{estimate.reasoning} AI-assisted refinement: {refinement.reasoning}",
    )
    return refined, "AI_GENERATED", refinement.reasoning
