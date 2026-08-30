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
