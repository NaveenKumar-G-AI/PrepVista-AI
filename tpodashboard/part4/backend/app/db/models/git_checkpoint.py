"""GitCheckpoint model.

Records that a commit was made by (or on behalf of) the autonomous system.
This is a record-keeping table only -- it does not perform Git operations;
a future part will create these rows after actually running `git commit`.
`task_id` / `agent_run_id` are nullable because a checkpoint could
conceivably be created outside a specific task/run context (e.g. a manual
project-level checkpoint).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import GitCheckpointStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun
    from app.db.models.project import Project
    from app.db.models.task import Task


class GitCheckpoint(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """A recorded Git commit checkpoint. Immutable once recorded."""

    __tablename__ = "git_checkpoints"

    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    agent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    commit_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    branch: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[GitCheckpointStatus] = mapped_column(
        pg_enum(GitCheckpointStatus, "git_checkpoint_status"),
        nullable=False,
        default=GitCheckpointStatus.created,
    )

    project: Mapped[Project] = relationship(back_populates="git_checkpoints")
    task: Mapped[Task | None] = relationship()
    agent_run: Mapped[AgentRun | None] = relationship(back_populates="git_checkpoints")

    def __repr__(self) -> str:
        return f"GitCheckpoint(id={self.id!r}, commit_hash={self.commit_hash!r})"
