"""Structured logging behavior."""

from __future__ import annotations

import json
import logging

from app.core.config import LoggingSettings, Settings
from app.core.logging import (
    JSONFormatter,
    bind_log_context,
    clear_log_context,
    configure_logging,
)


def test_json_formatter_produces_valid_json_with_required_fields() -> None:
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=42,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )

    rendered = json.loads(JSONFormatter().format(record))

    assert rendered["message"] == "hello world"
    assert rendered["level"] == "INFO"
    assert rendered["logger"] == "app.test"
    assert "timestamp" in rendered


def test_log_context_fields_are_attached_to_records() -> None:
    clear_log_context()
    bind_log_context(request_id="req-123")
    try:
        record = logging.LogRecord(
            name="app.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="test",
            args=(),
            exc_info=None,
        )
        from app.core.logging import ContextFilter

        ContextFilter().filter(record)
        assert record.request_id == "req-123"  # type: ignore[attr-defined]
    finally:
        clear_log_context()


def test_configure_logging_sets_root_level_from_settings() -> None:
    settings = Settings(logging=LoggingSettings(LOG_LEVEL="WARNING"))

    configure_logging(settings)

    assert logging.getLogger().level == logging.WARNING

    # restore a sane level so later tests aren't affected
    configure_logging(Settings(logging=LoggingSettings(LOG_LEVEL="INFO")))


def test_configure_logging_uses_json_formatter_when_configured() -> None:
    settings = Settings(logging=LoggingSettings(LOG_FORMAT="json"))

    configure_logging(settings)

    handler = logging.getLogger().handlers[0]
    assert isinstance(handler.formatter, JSONFormatter)

    # restore console formatting so later tests aren't affected
    configure_logging(Settings(logging=LoggingSettings(LOG_FORMAT="console")))
