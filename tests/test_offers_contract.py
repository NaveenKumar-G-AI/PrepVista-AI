"""Offer and joining workflow validation contracts."""

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.routers.offers import CreateOfferRequest, UpdateJoiningRequest


def _valid_offer_values() -> dict:
    return {
        "season_id": uuid4(),
        "student_id": uuid4(),
        "drive_id": uuid4(),
        "company_id": uuid4(),
        "role_title": "Software Engineer",
        "employment_type": "FULL_TIME",
        "work_mode": "HYBRID",
        "location": "Bengaluru",
        "offer_date": date(2026, 8, 1),
        "acceptance_deadline": datetime(2026, 8, 15, tzinfo=timezone.utc),
        "joining_date": date(2026, 9, 1),
        "ctc_total_minor": 1_200_000,
        "ctc_fixed_minor": 1_000_000,
    }


def test_offer_routes_are_mounted_and_require_authentication() -> None:
    application = create_app()
    client = TestClient(application)

    assert client.get("/org/my/offers").status_code == 401
    assert client.post(f"/org/my/offers/{uuid4()}/status", json={"to_status": "VERIFIED"}).status_code == 401


def test_offer_request_validates_dates_currency_and_compensation() -> None:
    request = CreateOfferRequest(**_valid_offer_values(), currency="usd")
    assert request.currency == "USD"

    invalid = _valid_offer_values()
    invalid["ctc_fixed_minor"] = invalid["ctc_total_minor"] + 1
    with pytest.raises(ValidationError, match="cannot exceed"):
        CreateOfferRequest(**invalid)

    invalid = _valid_offer_values()
    invalid["joining_date"] = date(2026, 7, 31)
    with pytest.raises(ValidationError, match="joining_date"):
        CreateOfferRequest(**invalid)


def test_did_not_join_requires_a_reason() -> None:
    with pytest.raises(ValidationError, match="reason is required"):
        UpdateJoiningRequest(to_status="DID_NOT_JOIN")

    request = UpdateJoiningRequest(to_status="DID_NOT_JOIN", reason="Candidate chose another role")
    assert request.reason == "Candidate chose another role"
