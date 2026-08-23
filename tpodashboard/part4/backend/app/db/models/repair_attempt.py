"""RepairAttempt model.

Records one autonomous attempt to fix a failure (a failing test, a broken
build, a rejected evaluation). `diagnosis` and `resolution` are concise,
bounded text fields -- like `Evaluation.reasoning_summary`, this is not a
place for unrestricted internal agent reasoning.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import RepairAttemptStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun
    from app.db.models.task import Task


class RepairAttempt(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """One autonomous attempt to diagnose and fix a failure."""

    __tablename__ = "repair_attempts"
    __table_args__ = (
        CheckConstraint("attempt_number >= 1", name="ck_repair_attempt_number_positive"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    attempt_number: Mapped[int] = mapped_column(nullable=False, default=1)
    failure_type: Mapped[str] = mapped_column(String(150), nullable=False)
    failure_summary: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis: Mapped[str | None] = mapped_column(Text, default=None)
    resolution: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[RepairAttemptStatus] = mapped_column(
        pg_enum(RepairAttemptStatus, "repair_attempt_status"),
        nullable=False,
        default=RepairAttemptStatus.started,
    )
    completed_at: Mapped[datetime | None] = mapped_column(default=None)

    task: Mapped[Task] = relationship(back_populates="repair_attempts")
    agent_run: Mapped[AgentRun] = relationship(back_populates="repair_attempts")

    def __repr__(self) -> str:
        return f"RepairAttempt(id={self.id!r}, task_id={self.task_id!r}, status={self.status!r})"
