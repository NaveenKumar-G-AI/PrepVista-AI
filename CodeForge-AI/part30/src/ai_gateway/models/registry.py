"""
Centralized model registry (Feature 9).

Every model CodeForge is allowed to call is declared exactly once, here (or,
in production, in the `ai_model_registry` table this mirrors — see
db/migrations/0001_init.sql). Nothing else in the codebase should hardcode
a model identifier's capabilities, context limit, or quality class.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, List, Optional

from ..enums import LatencyClass, QualityClass


@dataclass(frozen=True)
class ModelConfig:
    provider: str
    model_id: str
    capabilities: frozenset[str]         # e.g. {"chat", "json_mode", "long_context"}
    context_limit: int                    # tokens
    quality_class: QualityClass
    latency_class: LatencyClass
    output_price_per_1k: Decimal          # duplicated from pricing.py for fast routing-time
                                           # sort without a pricing-store lookup on the hot path;
                                           # the authoritative, versioned number for billing still
                                           # comes from PricingStore at cost-calculation time.
    enabled: bool = True
    available: bool = True                # live health signal; distinct from `enabled` (admin toggle)

    @property
    def key(self) -> str:
        return f"{self.provider}:{self.model_id}"


class ModelRegistry:
    def __init__(self) -> None:
        self._models: dict[str, ModelConfig] = {}

    def register(self, model: ModelConfig) -> None:
        self._models[model.key] = model

    def get(self, provider: str, model_id: str) -> ModelConfig:
        key = f"{provider}:{model_id}"
        if key not in self._models:
            raise KeyError(f"Model '{key}' is not in the registry")
        return self._models[key]

    def set_enabled(self, provider: str, model_id: str, enabled: bool) -> None:
        m = self.get(provider, model_id)
        self._models[m.key] = _replace_enabled(m, enabled)

    def set_available(self, provider: str, model_id: str, available: bool) -> None:
        """Called by provider-health monitoring (telemetry/anomaly.py,
        resilience/circuit_breaker.py) — distinct from the admin `enabled`
        flag so a transient outage doesn't require an admin action to
        recover from."""
        m = self.get(provider, model_id)
        self._models[m.key] = _replace_available(m, available)

    def all_enabled(self) -> List[ModelConfig]:
        return [m for m in self._models.values() if m.enabled]

    def all(self) -> List[ModelConfig]:
        return list(self._models.values())


def _replace_enabled(m: ModelConfig, enabled: bool) -> ModelConfig:
    return ModelConfig(
        provider=m.provider, model_id=m.model_id, capabilities=m.capabilities,
        context_limit=m.context_limit, quality_class=m.quality_class,
        latency_class=m.latency_class, output_price_per_1k=m.output_price_per_1k,
        enabled=enabled, available=m.available,
    )


def _replace_available(m: ModelConfig, available: bool) -> ModelConfig:
    return ModelConfig(
        provider=m.provider, model_id=m.model_id, capabilities=m.capabilities,
        context_limit=m.context_limit, quality_class=m.quality_class,
        latency_class=m.latency_class, output_price_per_1k=m.output_price_per_1k,
        enabled=m.enabled, available=available,
    )


def build_example_registry() -> ModelRegistry:
    """
    Illustrative seed data for local dev/tests only.

    The exact model identifiers, quality classifications, and context
    limits below are EXAMPLES. Real classification requires inspecting how
    CodeForge actually uses each model (Feature 11 explicitly warns against
    guessing this) — review and replace before production use.
    """
    reg = ModelRegistry()
    reg.register(ModelConfig(
        provider="groq", model_id="llama-3.1-8b-instant",
        capabilities=frozenset({"chat", "json_mode"}),
        context_limit=131072, quality_class=QualityClass.BASIC,
        latency_class=LatencyClass.FAST, output_price_per_1k=Decimal("0.08"),
    ))
    reg.register(ModelConfig(
        provider="groq", model_id="llama-3.3-70b-versatile",
        capabilities=frozenset({"chat", "json_mode", "reasoning"}),
        context_limit=131072, quality_class=QualityClass.STANDARD,
        latency_class=LatencyClass.FAST, output_price_per_1k=Decimal("0.79"),
    ))
    reg.register(ModelConfig(
        provider="gemini", model_id="gemini-2.0-flash",
        capabilities=frozenset({"chat", "json_mode", "long_context"}),
        context_limit=1_000_000, quality_class=QualityClass.STANDARD,
        latency_class=LatencyClass.FAST, output_price_per_1k=Decimal("0.40"),
    ))
    reg.register(ModelConfig(
        provider="gemini", model_id="gemini-2.5-pro",
        capabilities=frozenset({"chat", "json_mode", "long_context", "reasoning"}),
        context_limit=2_000_000, quality_class=QualityClass.ADVANCED,
        latency_class=LatencyClass.STANDARD, output_price_per_1k=Decimal("10.00"),
    ))
    return reg
