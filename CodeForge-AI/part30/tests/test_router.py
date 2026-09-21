from decimal import Decimal

import pytest

from ai_gateway.enums import LatencyClass, QualityClass
from ai_gateway.errors import NoEligibleModelError
from ai_gateway.models.registry import ModelConfig, ModelRegistry
from ai_gateway.routing.router import ModelRouter, RoutingRequest


def build_registry():
    reg = ModelRegistry()
    reg.register(ModelConfig(
        provider="groq", model_id="cheap-low-quality",
        capabilities=frozenset({"chat"}), context_limit=8000,
        quality_class=QualityClass.BASIC, latency_class=LatencyClass.FAST,
        output_price_per_1k=Decimal("0.01"),  # cheapest of all
    ))
    reg.register(ModelConfig(
        provider="groq", model_id="mid-quality",
        capabilities=frozenset({"chat"}), context_limit=8000,
        quality_class=QualityClass.STANDARD, latency_class=LatencyClass.FAST,
        output_price_per_1k=Decimal("0.50"),
    ))
    reg.register(ModelConfig(
        provider="gemini", model_id="expensive-high-quality",
        capabilities=frozenset({"chat"}), context_limit=8000,
        quality_class=QualityClass.ADVANCED, latency_class=LatencyClass.STANDARD,
        output_price_per_1k=Decimal("10.00"),  # most expensive of all
    ))
    return reg


def test_never_cost_only_routing_rejects_cheap_model_below_quality_floor():
    """The cheapest model in the registry is BASIC quality. Requiring
    ADVANCED must never select it, no matter how cheap it is."""
    router = ModelRouter(build_registry())
    decision = router.route(RoutingRequest(
        operation="test.op", required_capabilities=frozenset({"chat"}),
        quality_floor=QualityClass.ADVANCED, min_context_tokens=1000,
    ))
    assert decision.primary.model_id == "expensive-high-quality"
    rejected_ids = {r.model_key for r in decision.rejected}
    assert "groq:cheap-low-quality" in rejected_ids
    assert "groq:mid-quality" in rejected_ids
    reasons = {r.model_key: r.reason for r in decision.rejected}
    assert reasons["groq:cheap-low-quality"] == "below_quality_floor"


def test_cost_optimization_only_applies_among_already_eligible_models():
    """With a BASIC floor, all three models are eligible on quality — NOW
    cost should decide, and it should pick the cheapest of the eligible set."""
    router = ModelRouter(build_registry())
    decision = router.route(RoutingRequest(
        operation="test.op", required_capabilities=frozenset({"chat"}),
        quality_floor=QualityClass.BASIC, min_context_tokens=1000,
    ))
    assert decision.primary.model_id == "cheap-low-quality"
    assert [m.model_id for m in decision.fallbacks] == ["mid-quality", "expensive-high-quality"]


def test_capability_mismatch_is_rejected_before_cost_is_considered():
    """None of the seeded models declare 'vision' -> nothing should be
    eligible, and the rejection reason should say why."""
    router = ModelRouter(build_registry())
    with pytest.raises(NoEligibleModelError) as exc_info:
        router.route(RoutingRequest(
            operation="test.op", required_capabilities=frozenset({"chat", "vision"}),
            quality_floor=QualityClass.BASIC, min_context_tokens=1000,
        ))
    assert "capability_mismatch" in str(exc_info.value)


def test_no_eligible_model_raises_with_reasons():
    router = ModelRouter(build_registry())
    with pytest.raises(NoEligibleModelError):
        router.route(RoutingRequest(
            operation="test.op", required_capabilities=frozenset({"vision"}),
            quality_floor=QualityClass.BASIC, min_context_tokens=1000,
        ))


def test_context_limit_filter_raises_when_nothing_qualifies():
    router = ModelRouter(build_registry())
    with pytest.raises(NoEligibleModelError):
        router.route(RoutingRequest(
            operation="test.op", required_capabilities=frozenset({"chat"}),
            quality_floor=QualityClass.BASIC, min_context_tokens=100_000,
        ))


def test_disabled_model_is_excluded():
    reg = build_registry()
    reg.set_enabled("groq", "cheap-low-quality", False)
    router = ModelRouter(reg)
    decision = router.route(RoutingRequest(
        operation="test.op", required_capabilities=frozenset({"chat"}),
        quality_floor=QualityClass.BASIC, min_context_tokens=1000,
    ))
    assert decision.primary.model_id != "cheap-low-quality"


def test_unavailable_model_is_excluded():
    reg = build_registry()
    reg.set_available("groq", "cheap-low-quality", False)
    router = ModelRouter(reg)
    decision = router.route(RoutingRequest(
        operation="test.op", required_capabilities=frozenset({"chat"}),
        quality_floor=QualityClass.BASIC, min_context_tokens=1000,
    ))
    assert decision.primary.model_id != "cheap-low-quality"
