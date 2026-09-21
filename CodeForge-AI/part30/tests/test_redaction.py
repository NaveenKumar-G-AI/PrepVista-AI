from ai_gateway.security.redaction import redact_secrets, safe_log_context


def test_redacts_bearer_token():
    text = "Groq auth failed (401): Authorization: Bearer gsk_abcdEFGH12345678901234"
    out = redact_secrets(text)
    assert "gsk_abcdEFGH12345678901234" not in out
    assert "[REDACTED]" in out


def test_redacts_goog_api_key_header():
    text = "request failed, headers: {'x-goog-api-key': 'AIzaSyD-abcdefghijklmnopqrstuvwx1234'}"
    out = redact_secrets(text)
    assert "AIzaSyD-abcdefghijklmnopqrstuvwx1234" not in out


def test_redacts_connection_string_password():
    text = "could not connect: postgresql://cfai_app:sup3rSecretPW@127.0.0.1:5432/db"
    out = redact_secrets(text)
    assert "sup3rSecretPW" not in out
    assert "cfai_app" in out, "the username is not secret and can stay for debuggability"
    assert "127.0.0.1:5432/db" in out


def test_redacts_generic_api_key_field():
    text = '{"api_key": "sk-abcdefghijklmnopqrstuvwxyz123456"}'
    out = redact_secrets(text)
    assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in out


def test_leaves_non_secret_text_untouched():
    text = "Model returned finish_reason=length after 3 retries for operation=hint_ladder.next_hint"
    assert redact_secrets(text) == text


def test_empty_string_is_safe():
    assert redact_secrets("") == ""


def test_safe_log_context_only_contains_whitelisted_fields():
    ctx = safe_log_context(request_id="r1", feature="code_coach", operation="explain_error", provider="groq")
    assert set(ctx.keys()) == {"request_id", "feature", "operation", "provider", "model_id", "status"}
    assert "prompt" not in ctx and "response" not in ctx
