"""Structured logging infrastructure.

Produces consistent, environment-aware log records with timestamps, log
level, source module, and exception information. A `contextvars`-based
filter is included so future layers (API request handling, task workers,
agent runs) can attach correlation identifiers -- `request_id`, `project_id`,
`task_id`, `agent_run_id` -- to every log line emitted while they are active,
without changing call sites that don't care about them.

Secrets must never be logged. Do not pass API keys, passwords, tokens, or
raw environment dumps to any logger configured here.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, Final

from app.core.config import Settings

_LOG_CONTEXT: Final[ContextVar[dict[str, str] | None]] = ContextVar("log_context", default=None)

_RESERVED_RECORD_ATTRS = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__)


def bind_log_context(**fields: str) -> None:
    """Merge fields (e.g. request_id, project_id) into the active log context."""
    current = dict(_LOG_CONTEXT.get() or {})
    current.update(fields)
    _LOG_CONTEXT.set(current)


def clear_log_context() -> None:
    """Reset the active log context. Call at the end of a request/task."""
    _LOG_CONTEXT.set(None)


class ContextFilter(logging.Filter):
    """Injects the active correlation context into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        for key, value in (_LOG_CONTEXT.get() or {}).items():
            setattr(record, key, value)
        return True


class JSONFormatter(logging.Formatter):
    """Renders log records as single-line JSON for structured log ingestion."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        for key, value in record.__dict__.items():
            if key not in _RESERVED_RECORD_ATTRS and key not in payload:
                payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


class ConsoleFormatter(logging.Formatter):
    """Human-readable formatter used for local development."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )


def configure_logging(settings: Settings) -> None:
    """Configure the root logger for the current process.

    Uses structured JSON logs when `LOG_FORMAT=json` (typical for staging/
    production so output is easy to ingest downstream); uses a readable
    console format otherwise. The choice is explicit configuration, not
    inferred from the environment name.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(settings.logging.level)

    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.addFilter(ContextFilter())
    handler.setFormatter(
        JSONFormatter() if settings.logging.format == "json" else ConsoleFormatter()
    )

    root_logger.addHandler(handler)

    # Keep third-party access logs at a sane, non-noisy level.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
