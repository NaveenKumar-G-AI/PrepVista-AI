"""
AI response validation (Features 40-41).

Pipeline: AI raw text -> schema validation (is it valid JSON matching the
expected shape?) -> semantic validation (are the values actually sensible —
right ranges, allowed enums, no security-sensitive fields smuggled in?) ->
only then does it reach application state. Malformed output raises
OutputValidationError instead of silently corrupting anything downstream.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Optional, Type

from pydantic import BaseModel, ValidationError

from ..errors import OutputValidationError


def validate_structured_output(
    raw_text: str,
    schema: Type[BaseModel],
    *,
    semantic_check: Optional[Callable[[BaseModel], Optional[str]]] = None,
) -> BaseModel:
    """
    Raises OutputValidationError with the raw text attached (for logging —
    see telemetry, which redacts this before persisting per Feature 70)
    if either stage fails.

    `semantic_check` should return None if the parsed object is
    semantically fine, or a human-readable reason string if not (e.g. "hint
    level 7 is out of range 1-5").
    """
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise OutputValidationError(f"Model output was not valid JSON: {e}", raw_output=raw_text) from e

    try:
        parsed = schema.model_validate(data)
    except ValidationError as e:
        raise OutputValidationError(f"Model output failed schema validation: {e}", raw_output=raw_text) from e

    if semantic_check is not None:
        reason = semantic_check(parsed)
        if reason is not None:
            raise OutputValidationError(f"Model output failed semantic validation: {reason}", raw_output=raw_text)

    return parsed
