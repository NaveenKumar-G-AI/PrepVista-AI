from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.dependencies import get_current_user
from app.routers import coding


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(coding.router, prefix="/coding")
    settings = SimpleNamespace(CODING_WORKSPACE_ENABLED=False, CODING_PILOT_PROFILE_IDS="")
    identity = SimpleNamespace(id="profile-a", is_admin=False, premium_override=False)
    app.dependency_overrides[get_current_user] = lambda: identity
    monkeypatch.setattr(coding, "get_settings", lambda: settings)
    with TestClient(app) as client:
        yield client, settings, identity, app


def test_default_is_off():
    assert Settings.model_fields["CODING_WORKSPACE_ENABLED"].default is False
    assert Settings.model_fields["CODING_PILOT_PROFILE_IDS"].default == ""


@pytest.mark.parametrize("enabled,allowlist,allowed", [
    (False, "profile-a", False), (True, "", False), (True, "*", False),
    (True, "profile-b", False), (True, " profile-b, profile-a ", True),
])
def test_server_flag_and_exact_canonical_identity_required(client, enabled, allowlist, allowed):
    http, settings, identity, _ = client
    settings.CODING_WORKSPACE_ENABLED = enabled
    settings.CODING_PILOT_PROFILE_IDS = allowlist
    identity.is_admin = identity.premium_override = True  # no implicit override
    response = http.get('/coding/access?student_profile_id=profile-b&organization_id=tenant-b')
    assert response.status_code == 200
    assert response.json()["enabled"] is allowed
    assert response.json()["student_profile_id"] == "profile-a"
    assert response.headers["cache-control"] == "private, no-store"


def test_access_is_not_evidence_or_a_paid_grant(client):
    http, settings, _, _ = client
    settings.CODING_WORKSPACE_ENABLED = True
    settings.CODING_PILOT_PROFILE_IDS = "profile-a"
    data = http.get('/coding/access').json()
    assert data["result_authority"] == "CLIENT_REPORTED"
    assert data["persistence"] == "BROWSER_TAB"
    assert not any(data[key] for key in ("server_sync", "ai_mentoring", "readiness_updates", "interview_credits_consumed"))
    assert http.post('/coding/attempts', json={"authority": "VERIFIED"}).status_code == 404


def test_identity_change_and_revocation_do_not_reuse_access(client):
    http, settings, identity, _ = client
    settings.CODING_WORKSPACE_ENABLED = True
    settings.CODING_PILOT_PROFILE_IDS = "profile-a"
    assert http.get('/coding/access').json()["enabled"]
    identity.id = "profile-b"
    assert not http.get('/coding/access').json()["enabled"]
    identity.id = "profile-a"
    settings.CODING_WORKSPACE_ENABLED = False
    assert not http.get('/coding/access').json()["enabled"]


def test_anonymous_access_rejected_before_configuration(client, monkeypatch):
    http, _, _, app = client
    def anonymous():
        raise HTTPException(status_code=401)
    def unexpected_config():
        raise AssertionError('Anonymous request reached access configuration')
    app.dependency_overrides[get_current_user] = anonymous
    monkeypatch.setattr(coding, 'get_settings', unexpected_config)
    assert http.get('/coding/access').status_code == 401
