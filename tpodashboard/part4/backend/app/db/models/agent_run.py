"""AgentRun model.

One autonomous attempt to perform a task. Core queryable facts (status,
provider, model, token counts, cost) are first-class columns; genuinely
dynamic, rapidly-evolving execution details live in `extra_metadata`
(JSONB) -- see the module docstring pattern established in
`docs/database.md` §JSONB discipline. `extra_metadata` is intentionally
named that way (not `metadata`) because `metadata` is reserved by
SQLAlchemy's declarative API.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import AgentRunStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.evaluation import Evaluation
    from app.db.models.git_checkpoint import GitCheckpoint
    from app.db.models.repair_attempt import RepairAttempt
    from app.db.models.task import Task
    from app.db.models.test_run import TestRun
    from app.db.models.tool_execution import ToolExecution


class AgentRun(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """A single autonomous execution attempt against a task.

    No `updated_at` / soft delete: an agent run is an immutable historical
    record of what was attempted. Its `status` field is the only thing
    that changes after creation, driven by the (not-yet-implemented) agent
    runtime, not by direct row edits.
    """

    __tablename__ = "agent_runs"
    __table_args__ = (
        CheckConstraint(
            "input_tokens IS NULL OR input_tokens >= 0",
            name="ck_agent_run_input_tokens_non_negative",
        ),
        CheckConstraint(
            "output_tokens IS NULL OR output_tokens >= 0",
            name="ck_agent_run_output_tokens_non_negative",
        ),
        CheckConstraint(
            "estimated_cost IS NULL OR estimated_cost >= 0",
            name="ck_agent_run_estimated_cost_non_negative",
        ),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[AgentRunStatus] = mapped_column(
        pg_enum(AgentRunStatus, "agent_run_status"),
        nullable=False,
        default=AgentRunStatus.queued,
        index=True,
    )
    agent_type: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(100), default=None)
    model: Mapped[str | None] = mapped_column(String(200), default=None)
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    failure_reason: Mapped[str | None] = mapped_column(Text, default=None)
    input_tokens: Mapped[int | None] = mapped_column(default=None)
    output_tokens: Mapped[int | None] = mapped_column(default=None)
    estimated_cost: Mapped[float | None] = mapped_column(Numeric(12, 6), default=None)
    extra_metadata: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)

    task: Mapped[Task] = relationship(back_populates="agent_runs")
    tool_executions: Mapped[list[ToolExecution]] = relationship(back_populates="agent_run")
    test_runs: Mapped[list[TestRun]] = relationship(back_populates="agent_run")
    evaluations: Mapped[list[Evaluation]] = relationship(back_populates="agent_run")
    repair_attempts: Mapped[list[RepairAttempt]] = relationship(back_populates="agent_run")
    git_checkpoints: Mapped[list[GitCheckpoint]] = relationship(back_populates="agent_run")

    def __repr__(self) -> str:
        return f"AgentRun(id={self.id!r}, task_id={self.task_id!r}, status={self.status!r})"
