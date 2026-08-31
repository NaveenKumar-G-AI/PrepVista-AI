"""
Regression tests for Razorpay webhook signature verification.

These lock in two fixes:
  1. The signature is verified against the EXACT raw request body bytes — not a
     re-serialized parsed dict (which breaks HMAC due to key order / unicode
     escaping / whitespace differences).
  2. The webhook secret (RAZORPAY_WEBHOOK_SECRET) is used, not the API key
     secret.
"""

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import billing
from app.services import razorpay_service


class _RecordingUtility:
    def __init__(self):
        self.body = None
        self.secret = None

    def verify_webhook_signature(self, body, signature, secret):
        # Record exactly what the handler passed in for verification.
        self.body = body
        self.secret = secret
        if signature != "valid-signature":
            raise Exception("signature mismatch")


class _AsyncContext:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, *_args):
        return None


class _WebhookConnection:
    def __init__(self, *, payment_row, replacement=None):
        self.payment_row = payment_row
        self.replacement = replacement
        self.executions = []

    def transaction(self):
        return _AsyncContext(self)

    async def fetchval(self, query, *_args):
        if "SELECT processed" in query:
            return False
        raise AssertionError(f"Unexpected fetchval query: {query}")

    async def fetchrow(self, query, *_args):
        if "WHERE razorpay_order_id = $1 FOR UPDATE" in query:
            return self.payment_row
        if "WHERE razorpay_payment_id = $1 FOR UPDATE" in query:
            return self.payment_row
        if "status = 'verified'" in query:
            return self.replacement
        raise AssertionError(f"Unexpected fetchrow query: {query}")

    async def execute(self, query, *args):
        self.executions.append((query, args))
        return "UPDATE 1"


def _patch(monkeypatch, utility):
    monkeypatch.setattr(
        razorpay_service,
        "_get_client",
        lambda: SimpleNamespace(utility=utility),
    )
    monkeypatch.setattr(
        razorpay_service,
        "get_settings",
        lambda: SimpleNamespace(
            RAZORPAY_WEBHOOK_SECRET="webhook-secret",
            RAZORPAY_KEY_SECRET="key-secret",
        ),
    )


def test_webhook_verifies_against_exact_raw_body(monkeypatch):
    utility = _RecordingUtility()
    _patch(monkeypatch, utility)

    # Raw body with a non-ASCII char and spacing that json.dumps would alter.
    raw_body = '{"event": "payment.captured", "name": "Tendulkar ₹"}'.encode("utf-8")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(razorpay_service.handle_webhook(raw_body, "bad-signature"))

    # Rejected before any DB work because the signature was invalid.
    assert exc.value.status_code == 400
    # The handler must verify the byte-for-byte body it received, unchanged.
    assert utility.body == raw_body.decode("utf-8")
    # And it must use the webhook secret, never the API key secret.
    assert utility.secret == "webhook-secret"


def test_webhook_rejects_missing_signature(monkeypatch):
    utility = _RecordingUtility()
    _patch(monkeypatch, utility)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(razorpay_service.handle_webhook(b'{"event": "x"}', ""))
    assert exc.value.status_code == 400


def _billing_client() -> TestClient:
    app = FastAPI()
    app.include_router(billing.router, prefix="/billing")
    return TestClient(app)


def test_webhook_route_requires_provider_event_id(monkeypatch):
    called = False

    async def fake_handle(*_args):
        nonlocal called
        called = True
        return {"status": "processed"}

    monkeypatch.setattr(billing, "handle_webhook", fake_handle)
    response = _billing_client().post(
        "/billing/webhook",
        content=b'{"event":"payment.captured"}',
        headers={"x-razorpay-signature": "valid-signature"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing or invalid Razorpay event ID header."
    assert called is False


def test_webhook_route_passes_exact_event_id(monkeypatch):
    received = None

    async def fake_handle(raw_body, signature, event_id):
        nonlocal received
        received = (raw_body, signature, event_id)
        return {"status": "processed"}

    monkeypatch.setattr(billing, "handle_webhook", fake_handle)
    raw_body = b'{"event":"payment.captured"}'
    response = _billing_client().post(
        "/billing/webhook",
        content=raw_body,
        headers={
            "x-razorpay-signature": "valid-signature",
            "x-razorpay-event-id": "evt_unique_123",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"status": "processed"}
    assert received == (raw_body, "valid-signature", "evt_unique_123")


def test_webhook_route_requests_retry_on_internal_failure(monkeypatch):
    async def fake_handle(*_args):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(billing, "handle_webhook", fake_handle)
    response = _billing_client().post(
        "/billing/webhook",
        content=b'{"event":"payment.captured"}',
        headers={
            "x-razorpay-signature": "valid-signature",
            "x-razorpay-event-id": "evt_retry_123",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "Webhook processing failed; retry required."


def test_captured_webhook_rejects_amount_mismatch(monkeypatch):
    utility = _RecordingUtility()
    _patch(monkeypatch, utility)
    conn = _WebhookConnection(
        payment_row={
            "user_id": "user-1",
            "plan": "pro",
            "amount_paise": 29900,
            "currency": "INR",
            "status": "created",
            "razorpay_payment_id": None,
            "verified_at": None,
        }
    )
    monkeypatch.setattr(
        razorpay_service,
        "DatabaseConnection",
        lambda: _AsyncContext(conn),
    )
    payload = json.dumps(
        {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_1",
                        "order_id": "order_1",
                        "amount": 1,
                        "currency": "INR",
                    }
                }
            },
        }
    ).encode("utf-8")

    with pytest.raises(RuntimeError, match="amount does not match"):
        asyncio.run(
            razorpay_service.handle_webhook(
                payload,
                "valid-signature",
                "evt_amount_mismatch",
            )
        )


def test_refund_preserves_a_newer_valid_renewal(monkeypatch):
    utility = _RecordingUtility()
    _patch(monkeypatch, utility)
    from datetime import datetime, timezone

    conn = _WebhookConnection(
        payment_row={
            "user_id": "user-1",
            "plan": "pro",
            "razorpay_order_id": "order_old",
        },
        replacement={
            "razorpay_order_id": "order_new",
            "activated_at": datetime.now(timezone.utc),
        },
    )
    monkeypatch.setattr(
        razorpay_service,
        "DatabaseConnection",
        lambda: _AsyncContext(conn),
    )
    entitlement_updates = []

    async def fake_set_entitlement(_conn, user_id, plan, status, **kwargs):
        entitlement_updates.append((user_id, plan, status, kwargs))

    async def fake_sync(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(
        razorpay_service,
        "set_entitlement_status",
        fake_set_entitlement,
    )
    monkeypatch.setattr(
        razorpay_service,
        "sync_profile_plan_state",
        fake_sync,
    )
    payload = json.dumps(
        {
            "event": "refund.processed",
            "payload": {"refund": {"entity": {"payment_id": "pay_old"}}},
        }
    ).encode("utf-8")

    result = asyncio.run(
        razorpay_service.handle_webhook(
            payload,
            "valid-signature",
            "evt_refund_old",
        )
    )

    assert result == {"status": "processed"}
    assert entitlement_updates == [
        (
            "user-1",
            "pro",
            "active",
            {
                "source_order_id": "order_new",
                "activated_at": conn.replacement["activated_at"],
            },
        )
    ]
