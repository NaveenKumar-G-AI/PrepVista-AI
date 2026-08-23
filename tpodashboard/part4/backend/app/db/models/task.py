"""Task and TaskDependency models.

A Task is a unit of engineering work. Tasks form a hierarchy
(`parent_task_id`) for breaking down large work items, and a separate
dependency graph (`TaskDependency`) for ordering constraints between
otherwise-unrelated tasks ("Task C can't start until Task A and Task B are
done").

Cycle detection: the database only prevents the trivial cases (self-
dependency via CHECK, duplicate edges via UNIQUE). Detecting longer cycles
(A depends on B, B depends on C, C depends on A) is a graph problem that
does not fit cleanly into a single-row CHECK constraint and is deliberately
left to application-level validation in the future task-scheduling
service (Part 5+) -- see `docs/database.md` §Task dependencies.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import TaskPriority, TaskStatus, TaskType, pg_enum
from app.db.models.mixins import CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun
    from app.db.models.evaluation import Evaluation
    from app.db.models.project import Project
    from app.db.models.repair_attempt import RepairAttempt
    from app.db.models.test_run import TestRun


class Task(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A unit of engineering work, optionally nested under a parent task.

    No soft deletion here -- tasks are execution history, not user-facing
    configuration; use `status=cancelled` instead of deleting a task (see
    `docs/database.md` §Soft deletion).
    """

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("attempt_count >= 0", name="ck_task_attempt_count_non_negative"),
        CheckConstraint("max_attempts >= 1", name="ck_task_max_attempts_positive"),
        Index("ix_tasks_project_id_status", "project_id", "status"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[TaskStatus] = mapped_column(
        pg_enum(TaskStatus, "task_status"), nullable=False, default=TaskStatus.pending, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        pg_enum(TaskPriority, "task_priority"), nullable=False, default=TaskPriority.normal
    )
    task_type: Mapped[TaskType] = mapped_column(pg_enum(TaskType, "task_type"), nullable=False)
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(nullable=False, default=3)
    started_at: Mapped[datetime | None] = mapped_column(default=None)
    completed_at: Mapped[datetime | None] = mapped_column(default=None)

    project: Mapped[Project] = relationship(back_populates="tasks")
    parent: Mapped[Task | None] = relationship(back_populates="children", remote_side="Task.id")
    children: Mapped[list[Task]] = relationship(back_populates="parent")

    outgoing_dependencies: Mapped[list[TaskDependency]] = relationship(
        foreign_keys="TaskDependency.task_id",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    incoming_dependencies: Mapped[list[TaskDependency]] = relationship(
        foreign_keys="TaskDependency.depends_on_task_id",
        back_populates="depends_on_task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    agent_runs: Mapped[list[AgentRun]] = relationship(back_populates="task")
    test_runs: Mapped[list[TestRun]] = relationship(back_populates="task")
    evaluations: Mapped[list[Evaluation]] = relationship(back_populates="task")
    repair_attempts: Mapped[list[RepairAttempt]] = relationship(back_populates="task")

    def __repr__(self) -> str:
        return f"Task(id={self.id!r}, title={self.title!r}, status={self.status!r})"


class TaskDependency(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """A directed edge: `task` cannot proceed until `depends_on_task` is done.

    A pure graph-edge record, not standalone historical data, so it
    cascade-deletes when either endpoint task is deleted (see
    `Task.outgoing_dependencies` / `incoming_dependencies`).
    """

    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint("task_id", "depends_on_task_id", name="uq_task_dependency_pair"),
        CheckConstraint(
            "task_id != depends_on_task_id", name="ck_task_dependency_no_self_reference"
        ),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )

    task: Mapped[Task] = relationship(
        foreign_keys=[task_id], back_populates="outgoing_dependencies"
    )
    depends_on_task: Mapped[Task] = relationship(
        foreign_keys=[depends_on_task_id], back_populates="incoming_dependencies"
    )

    def __repr__(self) -> str:
        return f"TaskDependency(task={self.task_id!r}, depends_on={self.depends_on_task_id!r})"
