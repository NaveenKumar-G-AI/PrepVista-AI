"""
Intelligent model routing (Features 23-25).

The funnel is deliberately ordered: capability -> quality -> context ->
availability -> THEN cost. Feature 24 is explicit that the cheapest model
is not automatically the correct model, so cost sorting only ever happens
across models that have already survived every other filter — a cheap
model that fails the quality floor is rejected before cost is ever
consulted, not merely deprioritized. See tests/test_router.py for a test
that proves this with a cheap-but-low-quality model that must never be
selected even though it's cheapest overall.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional

from ..enums import QualityClass
from ..errors import NoEligibleModelError
from ..models.registry import ModelConfig, ModelRegistry

_QUALITY_ORDER = [QualityClass.BASIC, QualityClass.STANDARD, QualityClass.ADVANCED, QualityClass.FRONTIER]


def _meets_quality_floor(model: ModelConfig, floor: QualityClass) -> bool:
    return _QUALITY_ORDER.index(model.quality_class) >= _QUALITY_ORDER.index(floor)


@dataclass(frozen=True)
class RoutingRequest:
    operation: str
    required_capabilities: frozenset[str]
    quality_floor: QualityClass
    min_context_tokens: int
    candidate_keys: tuple[str, ...] = ()  # "provider:model_id" — if empty, consider the whole registry
    prefer_cheaper: bool = True           # cost optimization is the LAST tiebreaker, never the first filter


@dataclass(frozen=True)
class RejectedModel:
    model_key: str
    reason: str


@dataclass(frozen=True)
class RoutingDecision:
    primary: ModelConfig
    fallbacks: tuple[ModelConfig, ...]
    rejected: tuple[RejectedModel, ...]


class ModelRouter:
    def __init__(self, registry: ModelRegistry):
        self._registry = registry

    def route(self, req: RoutingRequest) -> RoutingDecision:
        if req.candidate_keys:
            candidates = [self._registry.get(*key.split(":", 1)) for key in req.candidate_keys]
        else:
            candidates = self._registry.all_enabled()

        rejected: list[RejectedModel] = []

        def _filter(models: list[ModelConfig], predicate, reason: str) -> list[ModelConfig]:
            kept = []
            for m in models:
                if predicate(m):
                    kept.append(m)
                else:
                    rejected.append(RejectedModel(m.key, reason))
            return kept

        candidates = _filter(candidates, lambda m: m.enabled, "disabled")
        candidates = _filter(
            candidates,
            lambda m: req.required_capabilities.issubset(m.capabilities),
            "capability_mismatch",
        )
        # Quality floor is enforced HERE, before cost is ever looked at (Feature 24).
        candidates = _filter(
            candidates,
            lambda m: _meets_quality_floor(m, req.quality_floor),
            "below_quality_floor",
        )
        candidates = _filter(
            candidates,
            lambda m: m.context_limit >= req.min_context_tokens,
            "insufficient_context",
        )
        candidates = _filter(candidates, lambda m: m.available, "unavailable")

        if not candidates:
            raise NoEligibleModelError(
                f"No model satisfies policy for operation='{req.operation}' "
                f"(quality_floor={req.quality_floor.value}, "
                f"required_capabilities={sorted(req.required_capabilities)}, "
                f"min_context_tokens={req.min_context_tokens}). "
                f"Rejected: {[(r.model_key, r.reason) for r in rejected]}"
            )

        # Cost optimization is the LAST step, and only ranks models that already passed
        # every quality/capability/context/availability gate.
        if req.prefer_cheaper:
            candidates.sort(key=lambda m: m.output_price_per_1k)

        primary, *fallbacks = candidates
        return RoutingDecision(primary=primary, fallbacks=tuple(fallbacks), rejected=tuple(rejected))
