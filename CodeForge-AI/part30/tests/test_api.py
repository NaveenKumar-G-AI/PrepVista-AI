import os
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ADMIN_API_TOKEN", "test-admin-token-do-not-use-in-prod")

from ai_gateway import deps
from ai_gateway.api import app
from ai_gateway.cost.budget_engine import BudgetConfig, BudgetEngine
from ai_gateway.cost.cost_engine import CostEngine
from ai_gateway.enums import BudgetScope
from ai_gateway.gateway import AIGateway
from ai_gateway.models.pricing import build_example_pricing_store
from ai_gateway.models.registry import build_example_registry
from ai_gateway.policy.policy import build_example_policy_registry
from ai_gateway.providers.mock_provider import MockProvider
from ai_gateway.resilience.circuit_breaker import CircuitBreakerRegistry
from ai_gateway.routing.router import ModelRouter
from ai_gateway.telemetry.events import EventSink


@pytest.fixture(autouse=True)
def wire_mock_gateway():
    registry = build_example_registry()
    policies = build_example_policy_registry()
    pricing = build_example_pricing_store()

    budget_engine = BudgetEngine()
    budget_engine.register(BudgetConfig(scope=BudgetScope.PLATFORM, key="platform", period_limit_usd=Decimal("1000000")))

    groq_models = frozenset(m.model_id for m in registry.all() if m.provider == "groq")
    gemini_models = frozenset(m.model_id for m in registry.all() if m.provider == "gemini")

    gateway = AIGateway(
        model_registry=registry, policy_registry=policies, router=ModelRouter(registry),
        cost_engine=CostEngine(pricing), budget_engine=budget_engine,
        providers={
            "groq": MockProvider(name="groq", supported_models=groq_models),
            "gemini": MockProvider(name="gemini", supported_models=gemini_models),
        },
        event_sink=EventSink(), circuit_breakers=CircuitBreakerRegistry(),
    )
    deps.reset_gateway_for_testing(gateway)
    yield gateway
    deps.reset_gateway_for_testing(None)


@pytest.fixture
def client():
    return TestClient(app)


def test_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_execute_happy_path(client):
    resp = client.post("/v1/ai/execute", json={
        "feature": "hint_ladder", "operation": "hint_ladder.next_hint",
        "messages": [{"role": "user", "content": "help"}],
        "input_payload": {"code": "print(1)"},
        "user_id": "student_1",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "COMPLETED"
    assert body["provider"] == "groq"
    assert Decimal(body["cost_usd"]) > 0


def test_execute_unknown_operation_returns_400(client):
    resp = client.post("/v1/ai/execute", json={
        "feature": "x", "operation": "nobody_registered_this_operation",
        "messages": [{"role": "user", "content": "hi"}],
    })
    assert resp.status_code == 400


def test_execute_missing_required_field_returns_422(client):
    resp = client.post("/v1/ai/execute", json={"feature": "x"})
    assert resp.status_code == 422


def test_execute_against_real_provider_without_api_key_returns_clean_503():
    """Wires a REAL GroqProvider (not the MockProvider the other tests use)
    with an explicitly empty API key, to prove a missing credential
    surfaces as a clean 503 rather than an unhandled 500 traceback."""
    from ai_gateway.config import Settings
    from ai_gateway.providers.groq_provider import GroqProvider

    registry = build_example_registry()
    policies = build_example_policy_registry()
    pricing = build_example_pricing_store()
    budget_engine = BudgetEngine()
    budget_engine.register(BudgetConfig(scope=BudgetScope.PLATFORM, key="platform", period_limit_usd=Decimal("1000000")))

    empty_key_settings = Settings(groq_api_key="", gemini_api_key="")
    real_groq = GroqProvider(empty_key_settings, frozenset({"llama-3.1-8b-instant", "llama-3.3-70b-versatile"}))

    gateway = AIGateway(
        model_registry=registry, policy_registry=policies, router=ModelRouter(registry),
        cost_engine=CostEngine(pricing), budget_engine=budget_engine,
        providers={"groq": real_groq, "gemini": real_groq}, event_sink=EventSink(),
        circuit_breakers=CircuitBreakerRegistry(),
    )
    deps.reset_gateway_for_testing(gateway)
    fresh_client = TestClient(app)
    resp = fresh_client.post("/v1/ai/execute", json={
        "feature": "hint_ladder", "operation": "hint_ladder.next_hint",
        "messages": [{"role": "user", "content": "help"}], "input_payload": {"code": "x=1"},
    })
    assert resp.status_code == 503
    assert "GROQ_API_KEY" in resp.json()["detail"]


def test_admin_endpoint_requires_auth(client):
    resp = client.get("/v1/admin/models")
    assert resp.status_code == 401


def test_admin_endpoint_rejects_wrong_token(client):
    resp = client.get("/v1/admin/models", headers={"Authorization": "Bearer wrong-token"})
    assert resp.status_code == 401


def test_admin_endpoint_accepts_correct_token(client):
    resp = client.get("/v1/admin/models", headers={"Authorization": "Bearer test-admin-token-do-not-use-in-prod"})
    assert resp.status_code == 200
    models = resp.json()
    assert len(models) > 0
    assert {"provider", "model_id", "enabled"}.issubset(models[0].keys())


def test_admin_can_disable_a_model_and_it_is_audited(client):
    headers = {"Authorization": "Bearer test-admin-token-do-not-use-in-prod"}
    resp = client.post("/v1/admin/models/groq/llama-3.1-8b-instant/enabled?enabled=false", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False

    audit = client.get("/v1/admin/audit-log", headers=headers).json()
    assert any(a["action"] == "set_model_enabled" for a in audit)


def test_admin_budget_status_roundtrip(client):
    headers = {"Authorization": "Bearer test-admin-token-do-not-use-in-prod"}
    resp = client.post("/v1/admin/budgets", headers=headers, json={
        "scope": "FEATURE", "key": "hint_ladder", "period_limit_usd": "50.00",
    })
    assert resp.status_code == 200

    status = client.get("/v1/admin/budgets/FEATURE/hint_ladder", headers=headers).json()
    assert status["limit_usd"] == "50.00"
    assert status["status"] == "OK"


def test_circuit_breaker_snapshot_endpoint(client):
    headers = {"Authorization": "Bearer test-admin-token-do-not-use-in-prod"}
    resp = client.get("/v1/admin/health/circuit-breakers", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)
