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
