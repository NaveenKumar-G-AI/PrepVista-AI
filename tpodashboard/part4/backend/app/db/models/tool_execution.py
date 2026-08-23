"""ToolExecution model.

Records one invocation of an agent tool (`read_file`, `run_tests`, etc.).
Input/output are JSONB since every tool has a different payload shape.

Secrets and retention: tool input/output can easily contain secrets
(an env var dump, an API response, file contents) or unbounded payloads
(a huge command output). This table does not enforce sanitization or size
limits itself -- the future tool-execution engine (a later part) is
responsible for redacting secrets and truncating oversized payloads before
persisting. See `docs/database.md` §Security and §Retention.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import ToolExecutionStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun


class ToolExecution(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """One tool call made by an agent run. Immutable once recorded."""

    __tablename__ = "tool_executions"
    __table_args__ = (
        CheckConstraint(
            "duration_ms IS NULL OR duration_ms >= 0",
            name="ck_tool_execution_duration_non_negative",
        ),
    )

    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    tool_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    status: Mapped[ToolExecutionStatus] = mapped_column(
        pg_enum(ToolExecutionStatus, "tool_execution_status"),
        nullable=False,
        default=ToolExecutionStatus.requested,
    )
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    input: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)
    output: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    duration_ms: Mapped[int | None] = mapped_column(default=None)

    agent_run: Mapped[AgentRun] = relationship(back_populates="tool_executions")

    def __repr__(self) -> str:
        return (
            f"ToolExecution(id={self.id!r}, tool_name={self.tool_name!r}, status={self.status!r})"
        )
