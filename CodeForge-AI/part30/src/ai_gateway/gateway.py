"""
Central AI Gateway (Feature 4).

This is the one controlled path every CodeForge AI operation is meant to
go through:

  Feature -> Gateway -> Validate -> Policy -> Rate Limit -> Cache Check
  -> Route -> [Circuit Breaker -> Retry -> Provider] x (primary + fallbacks)
  -> Output Validation -> Cost -> Budget -> Telemetry -> Response

Implementation note on ordering (documenting a deliberate deviation, as
Feature 4 itself asks for when something can't be built exactly as
diagrammed): the spec's pipeline diagram lists "Cache Check" before "Model
Selection", but Feature 32 requires the cache key to include the model ID.
Those two requirements are in tension — you cannot key a cache lookup by
model before a model has been chosen. This implementation resolves it by
computing the routing decision first (a pure, local, in-memory operation
with no provider call), using it to build the cache key, and only then
checking the cache — so no provider is ever called before a cache check
happens, which is what actually matters for Feature 4's intent, even
though the *routing computation* now precedes the *cache lookup*.

Coalescing (Feature 34) is real, not cosmetic: for cacheable operations,
the actual provider call is wrapped inside `cache.get_or_compute`, so N
concurrent identical requests share exactly one in-flight computation —
see tests/test_gateway_end_to_end.py::test_concurrent_identical_requests_are_coalesced_at_gateway_level.
Only the caller that actually triggers the computation ("the owner") pays
the provider-call latency and gets its own request lifecycle walked
through MODEL_SELECTED -> PROVIDER_SELECTED -> STARTED; every other
caller sharing that in-flight result short-circuits CACHE_CHECKED ->
COMPLETED, identically to a plain cache hit, and is not charged again
against any budget (Feature 20's spend accounting must reflect real
provider calls, not the number of callers who happened to ask at once).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Callable, Optional, Type

from pydantic import BaseModel

from .caching.cache import InMemoryAICache
from .caching.cache_key import build_cache_key
from .cost.budget_engine import BudgetEngine
from .cost.cost_engine import CostEngine, CostResult, TokenUsage
from .enums import BudgetScope, RequestStatus
from .errors import (
    BudgetExceededError,
    CircuitOpenError,
    NoEligibleModelError,
    PermanentProviderError,
    RateLimitExceededError,
    TransientProviderError,
    UnknownOperationError,
)
from .models.registry import ModelRegistry
from .policy.policy import PolicyRegistry
from .providers.base import AIProvider, ProviderMessage, ProviderRequest, ProviderResponse
from .request.context import RequestContext
from .request.lifecycle import RequestLifecycle
from .resilience.circuit_breaker import CircuitBreakerRegistry
from .resilience.idempotency import InMemoryIdempotencyStore
from .resilience.rate_limiter import InMemoryRateLimiterRegistry
from .resilience.retry import RetryPolicy, retry_with_backoff
from .routing.router import ModelRouter, RoutingRequest
from .telemetry.events import CostEvent, EventSink, PerformanceEvent, QualityEvent, UsageEvent
from .validation.schema import validate_structured_output


@dataclass(frozen=True)
class GatewayResult:
    request_id: str
    status: RequestStatus
    text: str
    parsed: Optional[BaseModel]
    provider: str
    model_id: str
    usage: TokenUsage
    cost_usd: Decimal
    pricing_version: str
    cache_hit: bool
    used_fallback: bool
    retry_count: int
    latency_ms: float


@dataclass(frozen=True)
class _FreshResult:
    """What one real provider call (with retry/fallback already resolved)
    produced. This is the value cached by `AICache.get_or_compute` — every
    caller sharing an in-flight or already-cached computation gets this
    same object back."""

    text: str
    parsed: Optional[BaseModel]
    provider: str
    model_id: str
    usage: TokenUsage
    cost_result: CostResult
    used_fallback: bool
    retry_count: int


class AIGateway:
    def __init__(
        self,
        *,
        model_registry: ModelRegistry,
        policy_registry: PolicyRegistry,
        router: ModelRouter,
        cost_engine: CostEngine,
        budget_engine: BudgetEngine,
        providers: dict[str, AIProvider],
        event_sink: EventSink,
        cache: Optional[InMemoryAICache] = None,
        circuit_breakers: Optional[CircuitBreakerRegistry] = None,
        rate_limiter: Optional[InMemoryRateLimiterRegistry] = None,
        idempotency_store: Optional[InMemoryIdempotencyStore] = None,
        config_version: str = "v1",
        default_cache_ttl_s: float = 3600.0,
    ) -> None:
        self._registry = model_registry
        self._policies = policy_registry
        self._router = router
        self._cost_engine = cost_engine
        self._budget_engine = budget_engine
        self._providers = providers
        self._events = event_sink
        self._cache = cache or InMemoryAICache()
        self._circuit_breakers = circuit_breakers or CircuitBreakerRegistry()
        self._rate_limiter = rate_limiter
        self._idempotency = idempotency_store or InMemoryIdempotencyStore()
        self._config_version = config_version
        self._default_cache_ttl_s = default_cache_ttl_s

    async def execute(
        self,
        context: RequestContext,
        *,
        messages: tuple[ProviderMessage, ...],
        input_payload: dict,
        response_schema: Optional[Type[BaseModel]] = None,
        semantic_check: Optional[Callable[[BaseModel], Optional[str]]] = None,
    ) -> GatewayResult:
        started_at = time.monotonic()

        # ---- Idempotency short-circuit (Feature 35) ------------------------
        if context.idempotency_key is not None:
            existing, _waiter = await self._idempotency.get_or_lock(context.idempotency_key)
            if existing is not None:
                return existing

        lifecycle = RequestLifecycle()
        try:
            result = await self._execute_inner(
                context, lifecycle, messages=messages, input_payload=input_payload,
                response_schema=response_schema, semantic_check=semantic_check, started_at=started_at,
            )
            if context.idempotency_key is not None:
                self._idempotency.complete(context.idempotency_key, result)
            return result
        except Exception as e:
            if context.idempotency_key is not None:
                self._idempotency.fail(context.idempotency_key, e)
            raise

    async def _execute_inner(
        self,
        context: RequestContext,
        lifecycle: RequestLifecycle,
        *,
        messages: tuple[ProviderMessage, ...],
        input_payload: dict,
        response_schema: Optional[Type[BaseModel]],
        semantic_check,
        started_at: float,
    ) -> GatewayResult:
        # ---- VALIDATED: does this operation even have a policy? ------------
        try:
            policy = self._policies.get(context.operation)
        except UnknownOperationError:
            lifecycle.transition(RequestStatus.REJECTED)
            raise
        lifecycle.transition(RequestStatus.VALIDATED)

        # ---- POLICY_EVALUATED: budgets --------------------------------------
        budget_checks = [(BudgetScope.PLATFORM, "platform"), (BudgetScope.FEATURE, context.feature)]
        if context.organization_id:
            budget_checks.append((BudgetScope.ORGANIZATION, context.organization_id))
        if context.user_id:
            budget_checks.append((BudgetScope.USER, context.user_id))
        worst_budget_status = self._budget_engine.worst_status(budget_checks)
        degradation_actions = self._budget_engine.degradation_actions(worst_budget_status)

        is_critical = policy.default_priority.value == "CRITICAL"
        if "preserve_critical_only" in degradation_actions and not is_critical:
            lifecycle.transition(RequestStatus.REJECTED)
            raise BudgetExceededError(
                f"Budget exhausted; non-critical operation '{context.operation}' deferred "
                f"to preserve critical functionality (Feature 58/59)."
            )
        lifecycle.transition(RequestStatus.POLICY_EVALUATED)

        # ---- Rate limiting (per user/org/feature scope) ----------------------
        if self._rate_limiter is not None:
            for scope_key in filter(None, [
                f"user:{context.user_id}" if context.user_id else None,
                f"org:{context.organization_id}" if context.organization_id else None,
                f"feature:{context.feature}",
            ]):
                if not self._rate_limiter.try_acquire(scope_key):
                    lifecycle.transition(RequestStatus.RATE_LIMITED)
                    lifecycle.transition(RequestStatus.FAILED)
                    raise RateLimitExceededError(f"Rate limit exceeded for {scope_key}")

        # ---- Route (pure/local — no provider call yet) -----------------------
        routing_req = RoutingRequest(
            operation=context.operation,
            required_capabilities=frozenset(policy.required_capabilities),
            quality_floor=policy.minimum_quality,
            min_context_tokens=policy.max_input_tokens,
            candidate_keys=policy.allowed_models + policy.fallback_models,
            prefer_cheaper=True,
        )
        try:
            decision = self._router.route(routing_req)
        except NoEligibleModelError:
            lifecycle.transition(RequestStatus.REJECTED)
            raise

        # ---- CACHE_CHECKED ------------------------------------------------------
        cache_key = None
        if policy.cacheable:
            cache_key = build_cache_key(
                operation=context.operation, provider=decision.primary.provider,
                model_id=decision.primary.model_id, prompt_version=policy.prompt_version,
                config_version=self._config_version, input_payload=input_payload,
            )
        lifecycle.transition(RequestStatus.CACHE_CHECKED)

        async def _compute() -> _FreshResult:
            return await self._run_provider_chain(
                context, policy, decision, lifecycle, messages=messages,
                response_schema=response_schema, semantic_check=semantic_check,
            )

        if policy.cacheable and cache_key is not None:
            fresh, cache_hit = await self._cache.get_or_compute(cache_key, self._default_cache_ttl_s, _compute)
        else:
            fresh, cache_hit = await _compute(), False

        if cache_hit:
            # Either a genuine prior cache hit, or this call joined another
            # in-flight computation (Feature 34) — either way, THIS request
            # never itself drove a provider call, so it short-circuits
            # exactly like a cache hit and is not charged against any budget.
            lifecycle.transition(RequestStatus.COMPLETED)
            cost_usd = Decimal("0")
            used_fallback, retry_count = False, 0
        else:
            for scope, key in budget_checks:
                if self._budget_engine.has_budget(scope, key):
                    self._budget_engine.record_spend(scope, key, fresh.cost_result.amount_usd)
            lifecycle.transition(RequestStatus.COMPLETED)
            cost_usd = fresh.cost_result.amount_usd
            used_fallback, retry_count = fresh.used_fallback, fresh.retry_count

        latency_ms = (time.monotonic() - started_at) * 1000
        self._emit_telemetry(
            context, fresh.provider, fresh.model_id, usage=fresh.usage, cost_usd=cost_usd,
            pricing_version=fresh.cost_result.pricing_version, cache_hit=cache_hit, used_fallback=used_fallback,
            retry_count=retry_count, latency_ms=latency_ms, status=RequestStatus.COMPLETED,
            validation_passed=True, retry_triggered=retry_count > 0,
        )

        return GatewayResult(
            request_id=context.request_id, status=RequestStatus.COMPLETED, text=fresh.text, parsed=fresh.parsed,
            provider=fresh.provider, model_id=fresh.model_id, usage=fresh.usage, cost_usd=cost_usd,
            pricing_version=fresh.cost_result.pricing_version, cache_hit=cache_hit, used_fallback=used_fallback,
            retry_count=retry_count, latency_ms=latency_ms,
        )

    async def _run_provider_chain(
        self, context: RequestContext, policy, decision, lifecycle: RequestLifecycle, *,
        messages: tuple[ProviderMessage, ...], response_schema: Optional[Type[BaseModel]], semantic_check,
    ) -> _FreshResult:
        """Runs ONLY when there is genuinely no cached/in-flight answer to
        reuse. Owns the MODEL_SELECTED -> ... -> STARTED lifecycle
        transitions, the circuit-breaker/retry/fallback loop, output
        validation, and cost calculation."""
        lifecycle.transition(RequestStatus.MODEL_SELECTED)

        candidates = [decision.primary, *decision.fallbacks]
        last_error: Optional[Exception] = None
        used_fallback = False
        total_retry_count = 0
        response: Optional[ProviderResponse] = None
        chosen = None

        for idx, model in enumerate(candidates):
            provider = self._providers.get(model.provider)
            if provider is None:
                last_error = NoEligibleModelError(f"No provider implementation registered for '{model.provider}'")
                continue

            cb = self._circuit_breakers.get(model.key)
            if not cb.allow_request():
                last_error = CircuitOpenError(f"Circuit open for {model.key}")
                continue

            lifecycle.transition(RequestStatus.PROVIDER_SELECTED)
            lifecycle.transition(RequestStatus.STARTED)

            provider_request = ProviderRequest(
                model_id=model.model_id, messages=messages, max_output_tokens=policy.max_output_tokens,
                response_format_json=response_schema is not None,
            )

            attempt_counter = {"n": 0}

            async def _attempt() -> ProviderResponse:
                attempt_counter["n"] += 1
                return await provider.complete(provider_request)

            try:
                response = await retry_with_backoff(_attempt, RetryPolicy(max_retries=policy.max_retries))
                cb.record_success()
                chosen = model
                used_fallback = idx > 0
                total_retry_count += attempt_counter["n"] - 1
                break
            except TransientProviderError as e:
                cb.record_failure()
                total_retry_count += attempt_counter["n"] - 1
                last_error = e
                if idx + 1 < len(candidates):
                    lifecycle.transition(RequestStatus.FALLBACK)
                continue
            except PermanentProviderError as e:
                cb.record_failure()
                last_error = e
                if idx + 1 < len(candidates):
                    lifecycle.transition(RequestStatus.FALLBACK)
                continue

        if response is None or chosen is None:
            lifecycle.transition(RequestStatus.FAILED)
            raise last_error or NoEligibleModelError("All candidate models failed or were unavailable")

        parsed = None
        if response_schema is not None:
            parsed = validate_structured_output(response.text, response_schema, semantic_check=semantic_check)

        usage = TokenUsage(
            input_tokens=response.usage.input_tokens, output_tokens=response.usage.output_tokens,
            cached_tokens=response.usage.cached_tokens, estimated=response.usage.estimated,
        )
        cost_result = self._cost_engine.calculate(provider=chosen.provider, model_id=chosen.model_id, usage=usage)

        return _FreshResult(
            text=response.text, parsed=parsed, provider=chosen.provider, model_id=chosen.model_id,
            usage=usage, cost_result=cost_result, used_fallback=used_fallback, retry_count=total_retry_count,
        )

    def _emit_telemetry(
        self, context: RequestContext, provider: str, model_id: str, *, usage: TokenUsage, cost_usd: Decimal,
        pricing_version: str, cache_hit: bool, used_fallback: bool, retry_count: int, latency_ms: float,
        status: RequestStatus, validation_passed: bool, retry_triggered: bool,
    ) -> None:
        common = dict(
            request_id=context.request_id, feature=context.feature, operation=context.operation,
            provider=provider, model_id=model_id,
        )
        self._events.emit_usage(UsageEvent(
            **common, input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
            cached_tokens=usage.cached_tokens, estimated=usage.estimated, user_id=context.user_id,
            organization_id=context.organization_id, environment=context.environment.value,
        ))
        if not cache_hit:
            self._events.emit_cost(CostEvent(
                **common, amount_usd=cost_usd, pricing_version=pricing_version, estimated=usage.estimated,
                user_id=context.user_id, organization_id=context.organization_id,
                environment=context.environment.value,
            ))
        self._events.emit_performance(PerformanceEvent(
            **common, latency_ms=latency_ms, retry_count=retry_count, used_fallback=used_fallback,
            cache_hit=cache_hit, status=status.value, environment=context.environment.value,
        ))
        self._events.emit_quality(QualityEvent(
            **common, validation_passed=validation_passed, retry_triggered=retry_triggered,
            used_fallback=used_fallback, user_id=context.user_id, organization_id=context.organization_id,
            environment=context.environment.value,
        ))
