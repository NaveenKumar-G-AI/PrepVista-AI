"""ProjectEvent model.

Powers activity streams, dashboards, and audit history. `event_type` is
deliberately a plain indexed string, not a native PostgreSQL enum, because
new event kinds are expected to be added frequently as future parts land
(new tool events, new agent lifecycle events, new evaluation events, ...);
requiring a migration to add each one would slow down every future part for
little benefit. A curated, extensible set of known type constants lives in
`ProjectEventType` for documentation/autocomplete, but the column does not
enforce membership in that set at the database level -- see
`docs/database.md` §Project events for the full reasoning.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import EventSeverity, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun
    from app.db.models.project import Project
    from app.db.models.task import Task


class ProjectEventType:
    """Known event type string constants. Documentation only, not enforced.

    Future parts are free to introduce new event type strings beyond this
    set; extend this class when doing so to keep known types discoverable.
    """

    PROJECT_CREATED = "project_created"
    TASK_CREATED = "task_created"
    TASK_STARTED = "task_started"
    AGENT_STARTED = "agent_started"
    TOOL_STARTED = "tool_started"
    TOOL_COMPLETED = "tool_completed"
    TEST_STARTED = "test_started"
    TEST_FAILED = "test_failed"
    EVALUATION_COMPLETED = "evaluation_completed"
    REPAIR_STARTED = "repair_started"
    CHECKPOINT_CREATED = "checkpoint_created"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"


class ProjectEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """One entry in a project's activity/audit log. Immutable once recorded."""

    __tablename__ = "project_events"
    __table_args__ = (Index("ix_project_events_project_id_created_at", "project_id", "created_at"),)

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
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    severity: Mapped[EventSeverity] = mapped_column(
        pg_enum(EventSeverity, "event_severity"), nullable=False, default=EventSeverity.info
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    extra_metadata: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)

    project: Mapped[Project] = relationship(back_populates="events")
    task: Mapped[Task | None] = relationship()
    agent_run: Mapped[AgentRun | None] = relationship()

    def __repr__(self) -> str:
        return f"ProjectEvent(id={self.id!r}, event_type={self.event_type!r})"
