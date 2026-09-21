from datetime import datetime
from decimal import Decimal

import pytest

from ai_gateway.cost.cost_engine import CostEngine, TokenUsage
from ai_gateway.models.pricing import ModelPricing, PricingStore, PricingVersion


def make_store():
    store = PricingStore()
    store.add_version(PricingVersion(
        version="v1", effective_at=datetime(2026, 1, 1),
        prices={"groq:test-model": ModelPricing("groq", "test-model", Decimal("1.00"), Decimal("2.00"))},
    ))
    return store


def test_cost_calculation_is_exact_decimal():
    engine = CostEngine(make_store())
    usage = TokenUsage(input_tokens=1000, output_tokens=500)
    result = engine.calculate(provider="groq", model_id="test-model", usage=usage)
    # 1000 input tokens @ $1.00/1k = $1.00 ; 500 output tokens @ $2.00/1k = $1.00 ; total $2.00
    assert result.amount_usd == Decimal("2.000000")
    assert result.pricing_version == "v1"
    assert result.estimated is False


def test_cost_calculation_fractional_tokens():
    engine = CostEngine(make_store())
    usage = TokenUsage(input_tokens=123, output_tokens=45)
    result = engine.calculate(provider="groq", model_id="test-model", usage=usage)
    expected = (Decimal(123) / 1000 * Decimal("1.00")) + (Decimal(45) / 1000 * Decimal("2.00"))
    assert result.amount_usd == expected.quantize(Decimal("0.000001"))


def test_estimated_usage_flag_propagates_to_cost_result():
    engine = CostEngine(make_store())
    usage = TokenUsage(input_tokens=100, output_tokens=100, estimated=True)
    result = engine.calculate(provider="groq", model_id="test-model", usage=usage)
    assert result.estimated is True, "an estimated-usage cost must never be silently presented as exact"


def test_negative_token_counts_rejected():
    with pytest.raises(ValueError):
        TokenUsage(input_tokens=-1, output_tokens=0)


def test_unknown_model_raises_keyerror():
    engine = CostEngine(make_store())
    with pytest.raises(KeyError):
        engine.calculate(provider="groq", model_id="nonexistent", usage=TokenUsage(10, 10))


def test_pricing_versions_are_append_only_and_immutable():
    store = make_store()
    with pytest.raises(ValueError):
        store.add_version(PricingVersion(version="v1", effective_at=datetime(2026, 2, 1), prices={}))


def test_historical_cost_uses_the_version_it_was_calculated_under():
    store = make_store()
    store.add_version(PricingVersion(
        version="v2", effective_at=datetime(2026, 6, 1),
        prices={"groq:test-model": ModelPricing("groq", "test-model", Decimal("5.00"), Decimal("5.00"))},
    ))
    engine = CostEngine(store)
    usage = TokenUsage(input_tokens=1000, output_tokens=0)

    old = engine.calculate(provider="groq", model_id="test-model", usage=usage, pricing_version="v1")
    new = engine.calculate(provider="groq", model_id="test-model", usage=usage)  # latest = v2

    assert old.amount_usd == Decimal("1.000000")
    assert old.pricing_version == "v1"
    assert new.amount_usd == Decimal("5.000000")
    assert new.pricing_version == "v2"
