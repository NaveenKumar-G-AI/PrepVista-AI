"""
Shared FastAPI dependency wiring for api.py and admin_api.py.

Both routers need the same running AIGateway instance. Keeping the
construction here (instead of in api.py) is what lets admin_api.py depend
on it without api.py and admin_api.py importing each other.

`build_default_gateway()` wires the gateway using the EXAMPLE registry,
policy set, and pricing seeded in models/registry.py, policy/policy.py,
and models/pricing.py — clearly marked there as illustrative placeholders
(Feature 11 requires real classification of actual CodeForge operations
before this is production-correct). A real deployment replaces this
function's body with loads from the database (db/repository.py) at
process startup.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from .config import settings
from .cost.budget_engine import BudgetConfig, BudgetEngine
from .cost.cost_engine import CostEngine
from .enums import BudgetScope
from .gateway import AIGateway
from .models.pricing import build_example_pricing_store
from .models.registry import build_example_registry
from .policy.policy import build_example_policy_registry
from .providers.gemini_provider import GeminiProvider
from .providers.groq_provider import GroqProvider
from .resilience.circuit_breaker import CircuitBreakerRegistry
from .resilience.rate_limiter import InMemoryRateLimiterRegistry, RateLimitConfig
from .routing.router import ModelRouter
from .telemetry.events import EventSink


def build_default_gateway() -> AIGateway:
    registry = build_example_registry()
    policies = build_example_policy_registry()
    pricing = build_example_pricing_store()

    groq_models = frozenset(m.model_id for m in registry.all() if m.provider == "groq")
    gemini_models = frozenset(m.model_id for m in registry.all() if m.provider == "gemini")

    budget_engine = BudgetEngine()
    budget_engine.register(
        BudgetConfig(scope=BudgetScope.PLATFORM, key="platform", period_limit_usd=Decimal("1000000"))
    )

    return AIGateway(
        model_registry=registry,
        policy_registry=policies,
        router=ModelRouter(registry),
        cost_engine=CostEngine(pricing),
        budget_engine=budget_engine,
        providers={
            "groq": GroqProvider(settings, groq_models),
            "gemini": GeminiProvider(settings, gemini_models),
        },
        event_sink=EventSink(),
        circuit_breakers=CircuitBreakerRegistry(),
        rate_limiter=InMemoryRateLimiterRegistry(RateLimitConfig(capacity=20, refill_per_second=2.0)),
    )


_gateway: Optional[AIGateway] = None


def get_gateway() -> AIGateway:
    global _gateway
    if _gateway is None:
        _gateway = build_default_gateway()
    return _gateway


def reset_gateway_for_testing(gateway: Optional[AIGateway] = None) -> None:
    """Test-only hook so API tests can inject a gateway wired with
    MockProviders instead of the real Groq/Gemini adapters."""
    global _gateway
    _gateway = gateway
