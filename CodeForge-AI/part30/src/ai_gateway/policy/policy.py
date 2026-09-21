"""
Operation policy (Features 11-14, 36).

An OperationPolicy is the single source of truth for "what does this
specific AI operation need": its task complexity, minimum acceptable
quality, which models may serve it, its performance priority, its resource
budget, whether it's safe to cache, and which prompt version is current.

IMPORTANT — Feature 11 is explicit: "Do not automatically classify
operations using arbitrary assumptions. Inspect the actual product
behavior first." This module has NO access to the real CodeForge Code
Coach / Hint Ladder / Debugging Coach / etc. implementations, so the seed
policies below (`build_example_policy_registry`) are clearly-labeled
EXAMPLES using plausible names, not real classifications. Whoever wires
this into the real CodeForge repo must review and correct every
`OperationPolicy` against what that operation actually does before
trusting the router's decisions.

The registry raises UnknownOperationError for anything not explicitly
registered — the gateway must never invent a default policy for an
operation nobody has classified.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from ..enums import Priority, QualityClass, TaskComplexity
from ..errors import UnknownOperationError


@dataclass(frozen=True)
class OperationPolicy:
    operation: str
    task_complexity: TaskComplexity
    minimum_quality: QualityClass
    allowed_models: tuple[str, ...]     # "provider:model_id" keys, in preference order
    fallback_models: tuple[str, ...]    # additional "provider:model_id" keys, tried after allowed_models
    default_priority: Priority
    latency_target_ms: int
    max_input_tokens: int
    max_output_tokens: int
    max_cost_usd: Decimal
    max_retries: int = 2
    cacheable: bool = False
    prompt_version: str = "v1"
    required_capabilities: tuple[str, ...] = ()


class PolicyRegistry:
    def __init__(self) -> None:
        self._policies: dict[str, OperationPolicy] = {}

    def register(self, policy: OperationPolicy) -> None:
        self._policies[policy.operation] = policy

    def get(self, operation: str) -> OperationPolicy:
        if operation not in self._policies:
            raise UnknownOperationError(
                f"No OperationPolicy registered for operation='{operation}'. "
                f"Every AI operation must be explicitly classified before it can run "
                f"through the gateway — see policy/policy.py."
            )
        return self._policies[operation]

    def all(self) -> list[OperationPolicy]:
        return list(self._policies.values())


def build_example_policy_registry() -> PolicyRegistry:
    """
    EXAMPLE policies only — operation names and thresholds are illustrative
    stand-ins for CodeForge features named in the spec (AI Code Coach, Hint
    Ladder, Debugging Coach, Code Review Mode, Adaptive Challenge Engine,
    Technical Reports). Replace every value here after inspecting the real
    feature.
    """
    reg = PolicyRegistry()

    reg.register(OperationPolicy(
        operation="hint_ladder.next_hint",
        task_complexity=TaskComplexity.LOW,
        minimum_quality=QualityClass.BASIC,
        allowed_models=("groq:llama-3.1-8b-instant",),
        fallback_models=("groq:llama-3.3-70b-versatile",),
        default_priority=Priority.INTERACTIVE,
        latency_target_ms=1500,
        max_input_tokens=2000,
        max_output_tokens=300,
        max_cost_usd=Decimal("0.01"),
        cacheable=False,  # personalized to the student's current code — do not cache
        prompt_version="v1",
    ))

    reg.register(OperationPolicy(
        operation="code_coach.explain_error",
        task_complexity=TaskComplexity.MEDIUM,
        minimum_quality=QualityClass.STANDARD,
        allowed_models=("groq:llama-3.3-70b-versatile", "gemini:gemini-2.0-flash"),
        fallback_models=("gemini:gemini-2.5-pro",),
        default_priority=Priority.INTERACTIVE,
        latency_target_ms=3000,
        max_input_tokens=6000,
        max_output_tokens=800,
        max_cost_usd=Decimal("0.05"),
        cacheable=False,
        prompt_version="v3",
    ))

    reg.register(OperationPolicy(
        operation="challenge_generation.classify_topic",
        task_complexity=TaskComplexity.LOW,
        minimum_quality=QualityClass.BASIC,
        allowed_models=("groq:llama-3.1-8b-instant",),
        fallback_models=("groq:llama-3.3-70b-versatile",),
        default_priority=Priority.BACKGROUND,
        latency_target_ms=5000,
        max_input_tokens=1500,
        max_output_tokens=100,
        max_cost_usd=Decimal("0.005"),
        cacheable=True,  # pure classification of static input -> safe to cache
        prompt_version="v1",
        required_capabilities=("json_mode",),
    ))

    reg.register(OperationPolicy(
        operation="technical_reports.generate_growth_report",
        task_complexity=TaskComplexity.HIGH,
        minimum_quality=QualityClass.ADVANCED,
        allowed_models=("gemini:gemini-2.5-pro",),
        fallback_models=("groq:llama-3.3-70b-versatile",),
        default_priority=Priority.BACKGROUND,
        latency_target_ms=60000,
        max_input_tokens=40000,
        max_output_tokens=4000,
        max_cost_usd=Decimal("0.75"),
        cacheable=False,  # per-student report, not reusable across users
        prompt_version="v2",
    ))

    reg.register(OperationPolicy(
        operation="assessment.reasoning_verification",
        task_complexity=TaskComplexity.CRITICAL,
        minimum_quality=QualityClass.ADVANCED,
        allowed_models=("gemini:gemini-2.5-pro",),
        fallback_models=(),  # CRITICAL + no fallback on purpose: see gateway.py degraded-mode handling —
                              # assessment integrity must never silently downgrade quality (Feature 58).
        default_priority=Priority.CRITICAL,
        latency_target_ms=15000,
        max_input_tokens=20000,
        max_output_tokens=1500,
        max_cost_usd=Decimal("0.50"),
        max_retries=3,
        cacheable=False,
        prompt_version="v1",
    ))

    return reg
