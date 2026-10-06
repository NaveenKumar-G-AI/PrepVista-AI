"""Offline auth boundary tests: real dependencies/routes, mocked infrastructure."""

import asyncio
import json
import sqlite3
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import asyncpg
import httpx
import jwt
import pytest
from fastapi import Depends, FastAPI
from starlette.requests import Request

from app import dependencies as auth
from app.database import connection
from app.middleware.error_handler import register_error_handlers
from app.routers import auth as routes


TOKEN = "opaque-test-credential-" * 3


def request(body=None):
    async def receive():
        return {"type": "http.request", "body": json.dumps(body or {}).encode()}
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [
        (b"authorization", f"Bearer {TOKEN}".encode()),
    ]}, receive)


@pytest.fixture
def boundary(monkeypatch):
    auth._AUTH_USER_CACHE.clear()
    monkeypatch.setattr(connection, "_pool", None)
    monkeypatch.setattr(auth, "_get_cached_user_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(auth, "_set_cached_user_redis", AsyncMock())
    db = SimpleNamespace(
        fetchval=AsyncMock(return_value="profile-id"),
        fetchrow=AsyncMock(return_value={
            "plan": "free", "is_admin": False, "interviews_used_this_period": 0,
            "subscription_status": "none", "referral_code": "existing",
            "org_student": False,
        }),
    )
    monkeypatch.setattr(auth, "get_db", AsyncMock(return_value=db))
    monkeypatch.setattr(auth, "sync_profile_plan_state", AsyncMock(return_value={
        "selected_plan": "free", "owned_plans": ["free"],
        "expired_plans": [], "subscription_status": "none",
    }))
    monkeypatch.setattr(auth, "record_user_presence", AsyncMock())
    provider = SimpleNamespace(get=AsyncMock(return_value=httpx.Response(
        200, json={"id": "auth-id", "email": "student@example.test"},
    )), post=AsyncMock())
    monkeypatch.setattr(auth, "_supabase_http_client", provider)
    monkeypatch.setattr(routes, "_get_supabase_client", lambda: provider)
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(routes.router, prefix="/auth")

    @app.get("/protected")
    async def protected(user=Depends(auth.get_current_user)):
        return {"id": user.id, "college": user.is_org_student, "admin": user.is_admin}

    @app.get("/college")
    async def college(admin=Depends(auth.get_org_admin)):
        return {"organization_id": admin.organization_id}

    def call(path="/protected", token=TOKEN, method="GET", body=None):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(
                app=app, raise_app_exceptions=False,
            ), base_url="http://test") as client:
                return await client.request(method, path, headers={
                    "Authorization": f"Bearer {token}",
                }, json=body)
        return asyncio.run(run())
    yield db, provider, call
    auth._AUTH_USER_CACHE.clear()


def test_valid_auth_and_memory_cache(boundary):
    db, provider, call = boundary
    assert call().json() == {"id": "profile-id", "college": False, "admin": False}
    assert call().status_code == 200
    assert provider.get.await_count == db.fetchrow.await_count == 1


@pytest.mark.parametrize("status,expected", [(401, 401), (403, 403), (500, 503), (502, 503), (503, 503), (429, 503), (418, 502)])
@pytest.mark.parametrize("path,method,body", [
    ("/protected", "GET", None),
    ("/auth/refresh", "POST", {"refresh_token": "test-refresh"}),
    ("/auth/oauth/complete", "POST", {}),
])
def test_provider_status_contract(boundary, status, expected, path, method, body):
    _, provider, call = boundary
    provider.get.return_value = provider.post.return_value = httpx.Response(status, text="sensitive provider body")
    response = call(path, method=method, body=body)
    assert response.status_code == expected
    assert "sensitive provider body" not in response.text


@pytest.mark.parametrize("failure", [httpx.ReadTimeout("private"), httpx.ConnectError("private")])
@pytest.mark.parametrize("path,method,body", [
    ("/protected", "GET", None),
    ("/auth/refresh", "POST", {"refresh_token": "test-refresh"}),
    ("/auth/oauth/complete", "POST", {}),
])
def test_transport_failure_is_temporary(boundary, failure, path, method, body):
    _, provider, call = boundary
    provider.get.side_effect = provider.post.side_effect = failure
    assert call(path, method=method, body=body).status_code == 503


def test_detected_expired_token(boundary):
    _, provider, call = boundary
    token = jwt.encode({"sub": "user", "email": "student@example.test", "exp": time.time() - 60}, auth.get_settings().SUPABASE_JWT_SECRET, algorithm="HS256")
    assert call(token=token).status_code == 401
    provider.get.assert_not_awaited()


def test_expired_token_cannot_be_extended_by_profile_cache(boundary):
    _, provider, call = boundary
    token = jwt.encode({"sub": "user", "email": "student@example.test", "exp": time.time() - 60}, auth.get_settings().SUPABASE_JWT_SECRET, algorithm="HS256")
    auth._set_cached_user(token, auth.UserProfile("profile", "student@example.test", "free"))
    assert call(token=token).status_code == 401
    provider.get.assert_not_awaited()


def test_invalid_short_token(boundary):
    _, provider, call = boundary
    assert call(token="invalid").status_code == 401
    provider.get.assert_not_awaited()


def test_unregistered_authenticated_user_is_forbidden(boundary):
    db, _, call = boundary
    db.fetchval.return_value = None
    assert call().status_code == 403


@pytest.mark.parametrize("failure", [connection.DatabaseNotReadyError("offline"), TimeoutError(), ConnectionError(), asyncpg.ConnectionDoesNotExistError("offline")])
@pytest.mark.parametrize("stage", ["acquire", "profile"])
def test_database_failure_no_cache_corruption(boundary, monkeypatch, failure, stage):
    db, _, call = boundary
    known = auth.UserProfile("profile-id", "student@example.test", "free", is_org_student=True)
    auth._set_cached_user(TOKEN, known)
    before = dict(auth._AUTH_USER_CACHE)
    monkeypatch.setattr(auth, "_get_cached_user", lambda _: None)
    if stage == "acquire":
        auth.get_db.side_effect = failure
    else:
        db.fetchrow.side_effect = failure
    assert call().status_code == 503
    assert auth._AUTH_USER_CACHE == before
    auth._set_cached_user_redis.assert_not_awaited()


def test_unknown_failure_is_500(boundary):
    _, provider, call = boundary
    provider.get.side_effect = RuntimeError("private")
    assert call().status_code == 500


@pytest.mark.parametrize("payload,expected", [
    ({"error_code": "refresh_token_not_found"}, 401),
    ({"error": "invalid_grant"}, 401),
    ({"error_code": "provider_configuration_error"}, 502),
])
def test_refresh_credential_rejection_is_explicit(boundary, payload, expected):
    _, provider, call = boundary
    provider.post.return_value = httpx.Response(400, json=payload)
    assert call("/auth/refresh", method="POST", body={"refresh_token": "test-refresh"}).status_code == expected


def test_refresh_success(boundary):
    _, provider, call = boundary
    provider.post.return_value = httpx.Response(200, json={"access_token": "test-access", "refresh_token": "test-refresh", "expires_in": 3600})
    assert call("/auth/refresh", method="POST", body={"refresh_token": "old"}).json()["refresh_token"] == "test-refresh"


@pytest.mark.parametrize("status,expected", [(400, 401), (500, 503), (502, 503), (503, 503)])
def test_password_login_status_contract(boundary, monkeypatch, status, expected):
    _, provider, call = boundary
    monkeypatch.setattr(routes, "_find_profile_by_email", AsyncMock(return_value={"id": "profile"}))
    monkeypatch.setattr(routes, "_check_login_rate_limit", lambda *args: None)
    record = Mock()
    monkeypatch.setattr(routes, "_record_login_failure", lambda *args: record(*args))
    provider.post.return_value = httpx.Response(status, json={"error_code": "invalid_credentials"})
    response = call("/auth/login", method="POST", body={"email": "student@example.com", "password": "test-password"})
    assert response.status_code == expected
    assert record.call_count == (1 if expected == 401 else 0)


def test_login_database_not_ready_is_503(boundary, monkeypatch):
    _, _, call = boundary
    monkeypatch.setattr(routes, "_check_login_rate_limit", lambda *args: None)
    monkeypatch.setattr(routes, "_find_profile_by_email", AsyncMock(side_effect=connection.DatabaseNotReadyError("offline")))
    assert call("/auth/login", method="POST", body={"email": "student@example.com", "password": "test-password"}).status_code == 503


@pytest.mark.parametrize("path,body", [
    ("/auth/signup", {"email": "student@example.com", "password": "test-password", "verification_code": "123456"}),
    ("/auth/signup/request-code", {"email": "student@example.com"}),
    ("/auth/account-status", {"email": "student@example.com"}),
])
def test_signup_database_outage_is_503(boundary, monkeypatch, path, body):
    _, _, call = boundary
    monkeypatch.setattr(routes, "_require_deliverable_signup_email", lambda email: email)
    monkeypatch.setattr(routes, "_find_profile_by_email", AsyncMock(side_effect=connection.DatabaseNotReadyError("offline")))
    assert call(path, method="POST", body=body).status_code == 503


@pytest.mark.parametrize("failure", [500, 502, 503, httpx.ReadTimeout("private"), httpx.ConnectError("private")])
def test_signup_provider_outage_is_503(boundary, monkeypatch, failure):
    _, provider, call = boundary
    monkeypatch.setattr(routes, "_require_deliverable_signup_email", lambda email: email)
    monkeypatch.setattr(routes, "_find_profile_by_email", AsyncMock(return_value=None))
    class LocalContext:
        async def __aenter__(self):
            return object()
        async def __aexit__(self, *args):
            pass
    monkeypatch.setattr(routes, "DatabaseConnection", LocalContext)
    monkeypatch.setattr(routes, "verify_signup_code", AsyncMock())
    if isinstance(failure, int):
        provider.post.return_value = httpx.Response(failure, text="not JSON")
    else:
        provider.post.side_effect = failure
    assert call("/auth/signup", method="POST", body={"email": "student@example.com", "password": "test-password", "verification_code": "123456"}).status_code == 503


@pytest.mark.parametrize("college", [False, True])
def test_authoritative_college_context(boundary, college):
    db, _, call = boundary
    db.fetchrow.return_value["org_student"] = college
    db.fetchrow.return_value["org_career_access"] = college
    # Active college grants resolve into owned plans; membership alone is not a grant.
    if college:
        auth.sync_profile_plan_state.return_value = {
            "selected_plan": "career", "owned_plans": ["free", "pro", "career"],
            "expired_plans": [], "subscription_status": "active",
        }
    response = call()
    assert response.json()["college"] is college
    assert response.json()["admin"] is False
    assert auth._get_cached_user(TOKEN).effective_plan == ("career" if college else "free")


@pytest.mark.parametrize("admin_status,org_status,exists,expected", [
    ("active", "active", True, 200), ("suspended", "active", True, 403),
    ("active", "suspended", True, 403), ("active", "active", False, 403),
])
def test_college_admin_ownership_and_status(boundary, admin_status, org_status, exists, expected):
    db, _, call = boundary
    user = auth.UserProfile("profile-id", "student@example.test", "free")
    auth._set_cached_user(TOKEN, user)
    db.fetchrow.return_value = {
        "org_admin_id": "admin-id", "organization_id": "owned-org", "admin_role": "org_admin",
        "admin_status": admin_status, "organization_name": "College", "org_code": "CODE",
        "org_category": "college", "org_status": org_status,
    } if exists else None
    response = call("/college")
    assert response.status_code == expected
    query, owner = db.fetchrow.call_args.args
    assert "WHERE oa.user_id = $1" in query and owner == user.id
    if expected == 200:
        assert response.json() == {"organization_id": "owned-org"}


def test_college_context_is_owner_scoped_in_actual_query(monkeypatch):
    # Execute the unchanged ownership join locally, including an unrelated org.
    local = sqlite3.connect(":memory:")
    local.row_factory = sqlite3.Row
    local.executescript("""
        CREATE TABLE organizations (id TEXT, name TEXT, org_code TEXT, category TEXT, status TEXT);
        CREATE TABLE organization_admins (id TEXT, organization_id TEXT, user_id TEXT, role TEXT, status TEXT);
        INSERT INTO organizations VALUES ('org-a','A','A','college','active'), ('org-b','B','B','college','active');
        INSERT INTO organization_admins VALUES ('admin-a','org-a','owner-a','org_admin','active'), ('admin-b','org-b','owner-b','org_admin','active');
    """)
    class LocalDB:
        async def fetchrow(self, query, *args):
            row = local.execute(query, {str(i): value for i, value in enumerate(args, 1)}).fetchone()
            return dict(row) if row else None
    monkeypatch.setattr(auth, "get_db", AsyncMock(return_value=LocalDB()))
    monkeypatch.setattr(connection, "_pool", None)
    async def run():
        for owner, org in [("owner-a", "org-a"), ("owner-b", "org-b")]:
            context = await auth.get_org_admin(auth.UserProfile(owner, "admin@example.test", "free"))
            assert context.organization_id == org
            assert not context.user.is_admin
        with pytest.raises(auth.HTTPException) as error:
            await auth.get_org_admin(auth.UserProfile("normal-student", "student@example.test", "free"))
        assert error.value.status_code == 403
    try:
        asyncio.run(run())
    finally:
        local.close()


@pytest.mark.parametrize("college,override,admin", [(False, False, False), (True, False, False), (False, True, True)])
def test_redis_roundtrip_preserves_authorization(monkeypatch, college, override, admin):
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(UPSTASH_REDIS_URL="https://redis.test", UPSTASH_REDIS_TOKEN="dummy"))
    client = SimpleNamespace(post=AsyncMock(), get=AsyncMock())
    monkeypatch.setattr(auth, "_redis_http_client", client)
    user = auth.UserProfile("profile", "student@example.test", "free", is_org_student=college, premium_override=override, is_admin=admin)
    # Use the real serializer, then the real deserializer.
    asyncio.run(auth._set_cached_user_redis(TOKEN, user))
    serialized = client.post.call_args.kwargs["json"][-1]
    client.get.return_value = httpx.Response(200, json={"result": serialized})
    auth._AUTH_USER_CACHE.clear()
    recovered = asyncio.run(auth._get_cached_user_redis(TOKEN))
    assert recovered.is_org_student is college
    assert recovered.is_admin is admin and recovered.premium_override is override
    assert recovered.effective_plan == user.effective_plan
    assert auth._get_cached_user(TOKEN) is recovered
    auth._AUTH_USER_CACHE.clear()


@pytest.mark.parametrize("corruption", ["legacy", "string-role", "unknown-key"])
def test_redis_old_or_unsafe_shapes_are_cache_misses(monkeypatch, corruption):
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(UPSTASH_REDIS_URL="https://redis.test", UPSTASH_REDIS_TOKEN="dummy"))
    data = {"id": "profile", "email": "student@example.test", "plan": "free", "owned_plans": ["free"], "expired_plans": [], "is_admin": False, "premium_override": False, "is_org_student": True, "interviews_used": 0, "subscription_status": "none"}
    if corruption == "legacy":
        del data["is_org_student"]
    elif corruption == "string-role":
        data["is_admin"] = "false"
    else:
        data["organization_id"] = "forged"
    client = SimpleNamespace(get=AsyncMock(return_value=httpx.Response(200, json={"result": json.dumps(data)})), post=AsyncMock())
    monkeypatch.setattr(auth, "_redis_http_client", client)
    assert asyncio.run(auth._get_cached_user_redis(TOKEN)) is None
    client.post.assert_not_awaited()
