from app.services.email_validation import (
    REAL_EMAIL_ERROR_MESSAGE,
    TEMPORARY_EMAIL_ERROR_MESSAGE,
    validate_deliverable_email_address,
)


class _ValidatedEmail:
    def __init__(self, normalized: str):
        self.normalized = normalized


def test_validate_deliverable_email_address_returns_normalized_email(monkeypatch):
    def fake_validate_email(email: str, *, check_deliverability: bool):
        assert email == "User@Example.com"
        assert check_deliverability is True
        return _ValidatedEmail("user@example.com")

    monkeypatch.setattr("app.services.email_validation.validate_email", fake_validate_email)

    assert validate_deliverable_email_address("User@Example.com") == "user@example.com"


def test_validate_deliverable_email_address_rejects_undeliverable_email(monkeypatch):
    from email_validator import EmailNotValidError

    def fake_validate_email(email: str, *, check_deliverability: bool):
        raise EmailNotValidError("domain does not accept mail")

    monkeypatch.setattr("app.services.email_validation.validate_email", fake_validate_email)

    try:
        validate_deliverable_email_address("fake@example.invalid")
    except ValueError as exc:
        assert str(exc) == REAL_EMAIL_ERROR_MESSAGE
    else:
        raise AssertionError("Expected ValueError for an undeliverable email address.")


def test_validate_deliverable_email_address_rejects_common_provider_typos(monkeypatch):
    def fake_validate_email(email: str, *, check_deliverability: bool):
        return _ValidatedEmail("user@gmil.com")

    monkeypatch.setattr("app.services.email_validation.validate_email", fake_validate_email)

    try:
        validate_deliverable_email_address("user@gmil.com")
    except ValueError as exc:
        assert str(exc) == f"{REAL_EMAIL_ERROR_MESSAGE} Did you mean user@gmail.com?"
    else:
        raise AssertionError("Expected ValueError for a mistyped email provider domain.")


def test_validate_deliverable_email_address_rejects_disposable_domains(monkeypatch):
    def fake_validate_email(email: str, *, check_deliverability: bool):
        return _ValidatedEmail("user@mailinator.com")

    monkeypatch.setattr("app.services.email_validation.validate_email", fake_validate_email)

    try:
        validate_deliverable_email_address("user@mailinator.com")
    except ValueError as exc:
        assert str(exc) == TEMPORARY_EMAIL_ERROR_MESSAGE
    else:
        raise AssertionError("Expected ValueError for a disposable email domain.")


def test_pro_deactivation_does_not_change_other_unlimited_markers():
    from app.routers.admin_grants import _clear_model_bonus_override

    class _FakeConn:
        def __init__(self):
            self.updated_bonus = None

        async def fetchval(self, query: str, target_user_id: str):
            return 9993

        async def execute(self, query: str, target_user_id: str, updated_bonus: int):
            self.updated_bonus = updated_bonus

    import asyncio

    conn = _FakeConn()
    asyncio.run(_clear_model_bonus_override(conn, "user-1", "pro"))
    assert conn.updated_bonus is None
