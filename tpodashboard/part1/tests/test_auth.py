from app.services import rate_limit


def test_login_success(client, tpo_user):
    resp = client.post("/auth/login", json={"email": "tpo@test.edu", "password": "TestPass123!"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client, tpo_user):
    resp = client.post("/auth/login", json={"email": "tpo@test.edu", "password": "WrongPassword"})
    assert resp.status_code == 401
    assert resp.json()["error_code"] == "UNAUTHORIZED"


def test_login_unknown_email(client, tenant):
    resp = client.post("/auth/login", json={"email": "nobody@test.edu", "password": "whatever"})
    assert resp.status_code == 401


def test_login_inactive_user_rejected(client, db, tenant):
    from app.models.user import User, UserRole
    from app.security import hash_password

    user = User(
        institution_id=tenant["institution"].id, email="inactive@test.edu", full_name="Inactive",
        role=UserRole.FACULTY, hashed_password=hash_password("TestPass123!"), is_active=False,
    )
    db.add(user)
    db.commit()

    resp = client.post("/auth/login", json={"email": "inactive@test.edu", "password": "TestPass123!"})
    assert resp.status_code == 401


def test_protected_endpoint_without_token_is_rejected(client):
    resp = client.get("/students")
    assert resp.status_code == 401


def test_protected_endpoint_with_garbage_token_is_rejected(client):
    resp = client.get("/students", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_me_endpoint_returns_current_user(client, auth_headers, tpo_user):
    resp = client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == tpo_user.email
    assert body["role"] == "TPO_HEAD"
    assert "hashed_password" not in body
    assert "password" not in body


def test_login_rate_limited_after_repeated_failures(client, tpo_user, monkeypatch):
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("LOGIN_RATE_LIMIT_ATTEMPTS", "3")
    get_settings.cache_clear()
    rate_limit._attempts.clear()

    for _ in range(3):
        resp = client.post("/auth/login", json={"email": "tpo@test.edu", "password": "WrongPassword"})
        assert resp.status_code == 401

    resp = client.post("/auth/login", json={"email": "tpo@test.edu", "password": "WrongPassword"})
    assert resp.status_code == 429
    assert resp.json()["error_code"] == "RATE_LIMITED"

    get_settings.cache_clear()
    rate_limit._attempts.clear()
