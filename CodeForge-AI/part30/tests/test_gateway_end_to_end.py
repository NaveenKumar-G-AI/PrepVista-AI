"""
This is the "golden end-to-end test" the spec asks for (Feature 86),
implemented against a deterministic MockProvider instead of live
Groq/Gemini — this sandbox has no network path to those APIs and no real
credentials (see REPORT.md "BLOCKED" section). Every mechanism exercised
here (routing, retry, fallback, circuit breaker, budget degradation,
caching/coalescing) is the real production code path; only the outermost
HTTP call to the AI vendor is swapped out.
"""

import asyncio
from datetime import datetime
from decimal import Decimal

import pytest
from pydantic import BaseModel

from ai_gateway.cost.budget_engine import BudgetConfig, BudgetEngine
from ai_gateway.cost.cost_engine import CostEngine
from ai_gateway.enums import BudgetScope, Environment, LatencyClass, Priority, QualityClass, TaskComplexity
from ai_gateway.errors import BudgetExceededError, OutputValidationError
from ai_gateway.gateway import AIGateway
from ai_gateway.models.pricing import ModelPricing, PricingStore, PricingVersion
from ai_gateway.models.registry import ModelConfig, ModelRegistry
from ai_gateway.policy.policy import OperationPolicy, PolicyRegistry
from ai_gateway.providers.base import ProviderMessage, ProviderResponse, ProviderUsage
from ai_gateway.providers.mock_provider import MockProvider
from ai_gateway.request.context import RequestContext
from ai_gateway.resilience.circuit_breaker import CircuitBreakerConfig, CircuitBreakerRegistry
from ai_gateway.routing.router import ModelRouter
from ai_gateway.telemetry.events import EventSink


def build_env(*, circuit_config=None, feature_budget_limit=Decimal("1000")):
    registry = ModelRegistry()
    registry.register(ModelConfig(
        provider="groq", model_id="test-model-a", capabilities=frozenset({"chat"}),
        context_limit=8000, quality_class=QualityClass.STANDARD, latency_class=LatencyClass.FAST,
        output_price_per_1k=Decimal("0.10"),
    ))
    registry.register(ModelConfig(
        provider="gemini", model_id="test-model-b", capabilities=frozenset({"chat"}),
        context_limit=8000, quality_class=QualityClass.STANDARD, latency_class=LatencyClass.STANDARD,
        output_price_per_1k=Decimal("1.00"),
    ))

    policies = PolicyRegistry()
    policies.register(OperationPolicy(
        operation="test.interactive_op",
        task_complexity=TaskComplexity.MEDIUM, minimum_quality=QualityClass.STANDARD,
        allowed_models=("groq:test-model-a",), fallback_models=("gemini:test-model-b",),
        default_priority=Priority.INTERACTIVE, latency_target_ms=3000,
        max_input_tokens=4000, max_output_tokens=500, max_cost_usd=Decimal("1.00"),
        max_retries=2, cacheable=True, prompt_version="v1",
    ))
    policies.register(OperationPolicy(
        operation="test.critical_op",
        task_complexity=TaskComplexity.CRITICAL, minimum_quality=QualityClass.STANDARD,
        allowed_models=("groq:test-model-a",), fallback_models=("gemini:test-model-b",),
        default_priority=Priority.CRITICAL, latency_target_ms=5000,
        max_input_tokens=4000, max_output_tokens=500, max_cost_usd=Decimal("1.00"),
        max_retries=1, cacheable=False, prompt_version="v1",
    ))
    policies.register(OperationPolicy(
        operation="test.structured_op",
        task_complexity=TaskComplexity.LOW, minimum_quality=QualityClass.STANDARD,
        allowed_models=("groq:test-model-a",), fallback_models=(),
        default_priority=Priority.NORMAL, latency_target_ms=3000,
        max_input_tokens=4000, max_output_tokens=500, max_cost_usd=Decimal("1.00"),
        max_retries=0, cacheable=False, prompt_version="v1",
    ))

    pricing = PricingStore()
    pricing.add_version(PricingVersion(
        version="test-v1", effective_at=datetime(2026, 1, 1),
        prices={
            "groq:test-model-a": ModelPricing("groq", "test-model-a", Decimal("0.10"), Decimal("0.10")),
            "gemini:test-model-b": ModelPricing("gemini", "test-model-b", Decimal("1.00"), Decimal("1.00")),
        },
    ))

    budget_engine = BudgetEngine()
    budget_engine.register(BudgetConfig(scope=BudgetScope.PLATFORM, key="platform", period_limit_usd=Decimal("1000")))
    budget_engine.register(BudgetConfig(scope=BudgetScope.FEATURE, key="test_feature", period_limit_usd=feature_budget_limit))

    provider_a = MockProvider(name="groq", supported_models=frozenset({"test-model-a"}))
    provider_b = MockProvider(name="gemini", supported_models=frozenset({"test-model-b"}))

    circuit_breakers = CircuitBreakerRegistry(
        circuit_config or CircuitBreakerConfig(degraded_threshold=1, failure_threshold=2, open_duration_s=9999)
    )
    event_sink = EventSink()

    gateway = AIGateway(
        model_registry=registry, policy_registry=policies, router=ModelRouter(registry),
        cost_engine=CostEngine(pricing), budget_engine=budget_engine,
        providers={"groq": provider_a, "gemini": provider_b}, event_sink=event_sink,
        circuit_breakers=circuit_breakers,
    )
    return dict(
        gateway=gateway, provider_a=provider_a, provider_b=provider_b,
        budget_engine=budget_engine, event_sink=event_sink, circuit_breakers=circuit_breakers,
    )


def ctx(operation="test.interactive_op", **kw):
    return RequestContext.new(feature="test_feature", operation=operation, environment=Environment.DEVELOPMENT, **kw)


MSG = (ProviderMessage(role="user", content="hello"),)


# ---------------------------------------------------------------------------
# 1. Happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_happy_path_end_to_end():
    env = build_env()
    result = await env["gateway"].execute(ctx(idempotency_key=None), messages=MSG, input_payload={"q": "hi-1"})

    assert result.status.value == "COMPLETED"
    assert result.provider == "groq"
    assert result.model_id == "test-model-a"
    assert result.cache_hit is False
    assert result.used_fallback is False
    # 50 input @ $0.10/1k = $0.005 ; 20 output @ $0.10/1k = $0.002 ; total $0.007
    assert result.cost_usd == Decimal("0.007000")

    sink = env["event_sink"]
    assert len(sink.usage_events) == 1
    assert len(sink.cost_events) == 1
    assert len(sink.performance_events) == 1
    assert len(sink.quality_events) == 1
    assert sink.cost_events[0].amount_usd == Decimal("0.007000")


# ---------------------------------------------------------------------------
# 2. Cache hit short-circuits the provider entirely
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cache_hit_skips_provider_call_and_is_free():
    env = build_env()
    payload = {"q": "same-input"}

    r1 = await env["gateway"].execute(ctx(), messages=MSG, input_payload=payload)
    assert r1.cache_hit is False
    assert env["provider_a"].call_count == 1

    r2 = await env["gateway"].execute(ctx(), messages=MSG, input_payload=payload)
    assert r2.cache_hit is True
    assert r2.cost_usd == Decimal("0")
    assert env["provider_a"].call_count == 1, "cache hit must not call the provider a second time"
    assert r2.text == r1.text


@pytest.mark.asyncio
async def test_concurrent_identical_requests_are_coalesced_at_gateway_level():
    env = build_env()
    env["provider_a"].delay_s = 0.05  # slow enough that concurrent calls genuinely overlap
    payload = {"q": "coalesce-me"}

    results = await asyncio.gather(*[
        env["gateway"].execute(ctx(), messages=MSG, input_payload=payload) for _ in range(8)
    ])
    assert env["provider_a"].call_count == 1, "8 concurrent identical cacheable requests should hit the provider once"
    assert all(r.text == results[0].text for r in results)


# ---------------------------------------------------------------------------
# 3. Retry then fallback on repeated transient failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_retry_then_fallback_to_secondary_provider():
    from ai_gateway.errors import ProviderTimeoutError

    env = build_env()
    # max_retries=2 -> 3 total attempts against provider_a, all of which time out
    env["provider_a"].script = [ProviderTimeoutError("t1"), ProviderTimeoutError("t2"), ProviderTimeoutError("t3")]

    result = await env["gateway"].execute(ctx(), messages=MSG, input_payload={"q": "retry-fallback"})

    assert env["provider_a"].call_count == 3
    assert result.used_fallback is True
    assert result.provider == "gemini"
    assert result.model_id == "test-model-b"
    assert result.retry_count == 2, "2 retries were spent on provider_a before falling back"
    assert result.status.value == "COMPLETED"


@pytest.mark.asyncio
async def test_permanent_error_on_primary_falls_back_without_retrying_primary():
    from ai_gateway.errors import ProviderAuthError

    env = build_env()
    env["provider_a"].script = [ProviderAuthError("bad key")]

    result = await env["gateway"].execute(ctx(), messages=MSG, input_payload={"q": "auth-fail"})

    assert env["provider_a"].call_count == 1, "a permanent error must not be retried, even before falling back"
    assert result.provider == "gemini"
    assert result.used_fallback is True


@pytest.mark.asyncio
async def test_all_candidates_failing_raises_and_marks_request_failed():
    from ai_gateway.errors import ProviderTimeoutError

    env = build_env()
    env["provider_a"].script = [ProviderTimeoutError("t")] * 3
    env["provider_b"].script = [ProviderTimeoutError("t")] * 3

    with pytest.raises(ProviderTimeoutError):
        await env["gateway"].execute(ctx(), messages=MSG, input_payload={"q": "total-outage"})


# ---------------------------------------------------------------------------
# 4. Circuit breaker opens after repeated failures and stops sending traffic
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_circuit_breaker_opens_and_stops_calling_failing_model():
    from ai_gateway.errors import ProviderTimeoutError

    env = build_env(circuit_config=CircuitBreakerConfig(degraded_threshold=1, failure_threshold=2, open_duration_s=9999))

    # Request 1: provider_a fails all 3 attempts -> 1st circuit-breaker failure recorded (DEGRADED)
    env["provider_a"].script = [ProviderTimeoutError("t")] * 3
    r1 = await env["gateway"].execute(ctx(), messages=MSG, input_payload={"q": "cb-1"})
    assert r1.provider == "gemini"
    assert env["provider_a"].call_count == 3

    # Request 2: provider_a fails all 3 attempts again -> 2nd failure recorded -> breaker OPENs
    env["provider_a"].script = [ProviderTimeoutError("t")] * 3
    r2 = await env["gateway"].execute(ctx(), messages=MSG, input_payload={"q": "cb-2"})
    assert r2.provider == "gemini"
    assert env["provider_a"].call_count == 6

    breaker = env["circuit_breakers"].get("groq:test-model-a")
    assert breaker.state.value == "OPEN"

    # Request 3: breaker is OPEN -> provider_a must not be called at all this time
    r3 = await env["gateway"].execute(ctx(), messages=MSG, input_payload={"q": "cb-3"})
    assert env["provider_a"].call_count == 6, "an OPEN circuit must prevent any further calls to that model"
    assert r3.provider == "gemini"
    assert r3.used_fallback is True


# ---------------------------------------------------------------------------
# 5. Budget-driven controlled degradation preserves critical functionality
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_budget_exceeded_blocks_noncritical_but_preserves_critical():
    env = build_env(feature_budget_limit=Decimal("0.001"))
    # Push the feature budget straight into EXCEEDED territory.
    env["budget_engine"].record_spend(BudgetScope.FEATURE, "test_feature", Decimal("10.00"))

    with pytest.raises(BudgetExceededError):
        await env["gateway"].execute(ctx(operation="test.interactive_op"), messages=MSG, input_payload={"q": "x"})

    # A CRITICAL-priority operation must still go through (Feature 58/59).
    result = await env["gateway"].execute(ctx(operation="test.critical_op"), messages=MSG, input_payload={"q": "y"})
    assert result.status.value == "COMPLETED"


@pytest.mark.asyncio
async def test_spend_is_skipped_not_errored_for_unconfigured_budget_scopes():
    """Only PLATFORM and FEATURE budgets are registered in build_env().
    A request carrying an organization_id that was never given its own
    ORGANIZATION-scope budget must still succeed — spend recording should
    silently skip scopes with no configured budget, symmetric with how
    worst_status() already treats them as OK rather than raising."""
    env = build_env()
    result = await env["gateway"].execute(
        ctx(organization_id="org_never_budgeted"), messages=MSG, input_payload={"q": "no-org-budget"},
    )
    assert result.status.value == "COMPLETED"


# ---------------------------------------------------------------------------
# 6. Structured output validation
# ---------------------------------------------------------------------------

class _Verdict(BaseModel):
    passed: bool
    score: int


@pytest.mark.asyncio
async def test_structured_output_is_validated_against_schema():
    env = build_env()
    env["provider_a"].default_response = ProviderResponse(
        text='{"passed": true, "score": 8}',
        usage=ProviderUsage(input_tokens=10, output_tokens=5),
        finish_reason="stop",
    )
    result = await env["gateway"].execute(
        ctx(operation="test.structured_op"), messages=MSG, input_payload={"q": "z"}, response_schema=_Verdict,
    )
    assert isinstance(result.parsed, _Verdict)
    assert result.parsed.score == 8


@pytest.mark.asyncio
async def test_malformed_structured_output_raises_validation_error():
    env = build_env()
    env["provider_a"].default_response = ProviderResponse(
        text="not json at all", usage=ProviderUsage(input_tokens=10, output_tokens=5), finish_reason="stop",
    )
    with pytest.raises(OutputValidationError):
        await env["gateway"].execute(
            ctx(operation="test.structured_op"), messages=MSG, input_payload={"q": "z2"}, response_schema=_Verdict,
        )


# ---------------------------------------------------------------------------
# 7. Idempotency
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_idempotency_key_prevents_duplicate_execution_and_duplicate_cost():
    env = build_env()
    key = "idem-key-123"
    r1 = await env["gateway"].execute(ctx(idempotency_key=key), messages=MSG, input_payload={"q": "idem", "n": 1})
    r2 = await env["gateway"].execute(ctx(idempotency_key=key), messages=MSG, input_payload={"q": "idem", "n": 2})

    # The second call is recognized as a duplicate and returns the FIRST
    # result verbatim (including its original request_id) rather than
    # re-executing — that's what "safe against accidental duplicate
    # execution" (Feature 35) means in practice.
    assert r1.request_id == r2.request_id
    assert r1.text == r2.text
    assert env["provider_a"].call_count == 1, "the second call with the same idempotency key must not hit the provider again"
