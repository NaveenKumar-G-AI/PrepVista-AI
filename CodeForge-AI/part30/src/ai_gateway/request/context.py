"""
Request identity and context (Features 5-6).

Every AI request gets a unique, traceable RequestContext before anything
else happens to it. This is deliberately a thin, mostly-opaque identifier
bag: Feature 6 says to collect only what's needed for operation and
observability, and Feature 71 (privacy) says to keep operational metadata
separate from sensitive content — so this class carries IDs and
enumerations, never raw prompts, code, or free-text student content.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from ..enums import Environment, Priority, RequestType


@dataclass(frozen=True)
class RequestContext:
    request_id: str
    feature: str
    operation: str
    priority: Priority
    environment: Environment
    request_type: RequestType = RequestType.INTERACTIVE

    user_id: Optional[str] = None
    organization_id: Optional[str] = None
    challenge_id: Optional[str] = None
    assessment_id: Optional[str] = None
    session_id: Optional[str] = None
    idempotency_key: Optional[str] = None

    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @staticmethod
    def new(
        *,
        feature: str,
        operation: str,
        priority: Priority = Priority.NORMAL,
        environment: Environment = Environment.DEVELOPMENT,
        request_type: RequestType = RequestType.INTERACTIVE,
        user_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        challenge_id: Optional[str] = None,
        assessment_id: Optional[str] = None,
        session_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> "RequestContext":
        return RequestContext(
            request_id=str(uuid.uuid4()),
            feature=feature,
            operation=operation,
            priority=priority,
            environment=environment,
            request_type=request_type,
            user_id=user_id,
            organization_id=organization_id,
            challenge_id=challenge_id,
            assessment_id=assessment_id,
            session_id=session_id,
            idempotency_key=idempotency_key,
        )
