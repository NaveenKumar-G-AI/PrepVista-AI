"""TestRun model.

Records the execution and result of a test suite run, distinct from
`Evaluation` (which judges whether the *task* was satisfied, not just
whether tests passed -- see `evaluation.py`). Framework-specific details
(coverage numbers, per-test breakdowns, JUnit XML summaries, etc.) live in
`extra_metadata` JSONB since every test framework reports differently;
status/exit_code/timing are first-class columns because they're always
present and always queried.
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
from app.db.models.enums import TestRunStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun
    from app.db.models.task import Task


class TestRun(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """One test-suite execution. Immutable once recorded."""

    __tablename__ = "test_runs"
    __table_args__ = (
        CheckConstraint(
            "duration_ms IS NULL OR duration_ms >= 0", name="ck_test_run_duration_non_negative"
        ),
    )

    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    test_framework: Mapped[str] = mapped_column(String(100), nullable=False)
    command: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[TestRunStatus] = mapped_column(
        pg_enum(TestRunStatus, "test_run_status"), nullable=False, default=TestRunStatus.queued
    )
    exit_code: Mapped[int | None] = mapped_column(default=None)
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)
    duration_ms: Mapped[int | None] = mapped_column(default=None)
    summary: Mapped[str | None] = mapped_column(Text, default=None)
    stdout: Mapped[str | None] = mapped_column(Text, default=None)
    stderr: Mapped[str | None] = mapped_column(Text, default=None)
    extra_metadata: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)

    agent_run: Mapped[AgentRun] = relationship(back_populates="test_runs")
    task: Mapped[Task] = relationship(back_populates="test_runs")

    def __repr__(self) -> str:
        return f"TestRun(id={self.id!r}, framework={self.test_framework!r}, status={self.status!r})"
