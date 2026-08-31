"""Regression coverage for the individual-plan checkout path."""

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.config import PLAN_CONFIG
from app.routers import billing
from app.services import razorpay_service


class _DatabaseContext:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *_args):
        return None


class _CreateOrderConnection:
    def __init__(self, *, existing=None):
        self.existing = existing
        self.queries = []

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        if "SELECT plan FROM profiles" in query:
            return {"plan": "free"}
        if "INSERT INTO payments" in query:
            return None if self.existing else {"id": "reservation-1"}
        if "WHERE user_id = $1 AND idempotency_key = $2" in query:
            return self.existing
        raise AssertionError(f"Unexpected fetchrow query: {query}")

    async def execute(self, query, *args):
        self.queries.append((query, args))
        if "UPDATE payments" in query:
            return "UPDATE 1"
        if "DELETE FROM payments" in query:
            return "DELETE 1"
        raise AssertionError(f"Unexpected execute query: {query}")


class _RecordingOrderApi:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def create(self, payload, **kwargs):
        self.calls.append((payload, kwargs))
        return self.response


def _patch_order_dependencies(monkeypatch, conn, order_api):
    monkeypatch.setattr(
        razorpay_service,
        "DatabaseConnection",
        lambda: _DatabaseContext(conn),
    )
    monkeypatch.setattr(
        razorpay_service,
        "_get_client",
        lambda: SimpleNamespace(order=order_api),
    )
    monkeypatch.setattr(
        razorpay_service,
        "get_settings",
        lambda: SimpleNamespace(RAZORPAY_KEY_ID="rzp_test_public"),
    )

    async def fake_sync(*_args, **_kwargs):
        return {"owned_plans": ["free"]}

    monkeypatch.setattr(razorpay_service, "sync_profile_plan_state", fake_sync)


def test_create_order_route_forwards_idempotency_key(monkeypatch):
    received = None

    async def fake_create_order(*args, **kwargs):
        nonlocal received
        received = (args, kwargs)
        return {"order_id": "order_route"}

    monkeypatch.setattr(billing, "create_order", fake_create_order)
    request = billing.CreateOrderRequest(
        plan="pro",
        idempotency_key="checkout_12345678",
    )
    user = SimpleNamespace(id="user-1", email="buyer@example.com")

    result = asyncio.run(billing.create_razorpay_order(request, user))

    assert result == {"order_id": "order_route"}
    assert received == (
        ("user-1", "buyer@example.com", "pro"),
        {"idempotency_key": "checkout_12345678"},
    )


def test_create_order_request_rejects_malformed_idempotency_key():
    with pytest.raises(ValidationError):
        billing.CreateOrderRequest(plan="pro", idempotency_key="bad key")


def test_create_order_persists_reservation_and_uses_unique_receipt(monkeypatch):
    amount = int(PLAN_CONFIG["pro"]["price_paise"])
    conn = _CreateOrderConnection()
    order_api = _RecordingOrderApi(
        {"id": "order_new", "amount": amount, "currency": "INR"}
    )
    _patch_order_dependencies(monkeypatch, conn, order_api)

    result = asyncio.run(
        razorpay_service.create_order(
            "12345678-1234-1234-1234-123456789012",
            "buyer@example.com",
            "pro",
            idempotency_key="checkout_12345678",
        )
    )

    assert result["order_id"] == "order_new"
    assert result["amount"] == amount
    assert len(order_api.calls) == 1
    payload, options = order_api.calls[0]
    assert payload["amount"] == amount
    assert payload["currency"] == "INR"
    assert payload["receipt"].startswith("pv_12345678_pro_")
    assert len(payload["receipt"]) <= 40
    assert options == {"timeout": 20}
    assert any("idempotency_key" in query for query, _args in conn.queries)


def test_create_order_retry_reuses_existing_provider_order(monkeypatch):
    amount = int(PLAN_CONFIG["career"]["price_paise"])
    conn = _CreateOrderConnection(
        existing={
            "razorpay_order_id": "order_existing",
            "plan": "career",
            "amount_paise": amount,
            "currency": "INR",
            "status": "created",
        }
    )
    order_api = _RecordingOrderApi(None)
    _patch_order_dependencies(monkeypatch, conn, order_api)

    result = asyncio.run(
        razorpay_service.create_order(
            "12345678-1234-1234-1234-123456789012",
            "buyer@example.com",
            "career",
            idempotency_key="checkout_existing_123",
        )
    )

    assert result["order_id"] == "order_existing"
    assert result["amount"] == amount
    assert order_api.calls == []


def test_payment_idempotency_migration_is_additive():
    migration = razorpay_service.__file__
    sql = (
        Path(migration).parents[1]
        / "database"
        / "migrations"
        / "034_payment_order_idempotency.sql"
    ).read_text(encoding="utf-8")
    assert "ADD COLUMN IF NOT EXISTS idempotency_key" in sql
    assert "ON payments (user_id, idempotency_key)" in sql
    assert "ON payments (razorpay_payment_id)" in sql


def test_frontend_sends_checkout_idempotency_key():
    api_source = (
        Path(razorpay_service.__file__).parents[2]
        / "frontend"
        / "src"
        / "lib"
        / "api.ts"
    ).read_text(encoding="utf-8")
    assert "crypto.randomUUID" in api_source
    assert "body: { plan, idempotency_key: idempotencyKey }" in api_source
