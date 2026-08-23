"""Project model.

The central entity: a software system the autonomous engineer works on.
Every other execution-history entity (tasks, agent runs, checkpoints,
events) ultimately traces back to a project.

Ownership: every project has a required `owner_id` (an individual `User`)
and an optional `organization_id`. A project with `organization_id` set is
considered team-owned; slug uniqueness is scoped accordingly -- see the two
partial unique indexes below.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import ProjectStatus, pg_enum
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.git_checkpoint import GitCheckpoint
    from app.db.models.organization import Organization
    from app.db.models.project_event import ProjectEvent
    from app.db.models.repository import Repository
    from app.db.models.task import Task
    from app.db.models.user import User


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A software system the autonomous engineer works on.

    Slug uniqueness is scoped to ownership rather than global: two
    different personal accounts (or a personal account and an
    organization) may each have a project named "api". This is enforced by
    two partial unique indexes (see `__table_args__`) rather than a single
    UNIQUE constraint, since exactly one of `owner_id`-scoped or
    `organization_id`-scoped uniqueness applies depending on whether
    `organization_id` is set.
    """

    __tablename__ = "projects"
    __table_args__ = (
        Index(
            "uq_project_slug_per_owner",
            "owner_id",
            "slug",
            unique=True,
            postgresql_where=text("organization_id IS NULL"),
        ),
        Index(
            "uq_project_slug_per_org",
            "organization_id",
            "slug",
            unique=True,
            postgresql_where=text("organization_id IS NOT NULL"),
        ),
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[ProjectStatus] = mapped_column(
        pg_enum(ProjectStatus, "project_status"), nullable=False, default=ProjectStatus.active
    )
    default_branch: Mapped[str] = mapped_column(String(200), nullable=False, default="main")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    owner: Mapped[User] = relationship(back_populates="projects")
    organization: Mapped[Organization | None] = relationship(back_populates="projects")
    repository: Mapped[Repository | None] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    tasks: Mapped[list[Task]] = relationship(back_populates="project")
    git_checkpoints: Mapped[list[GitCheckpoint]] = relationship(back_populates="project")
    events: Mapped[list[ProjectEvent]] = relationship(back_populates="project")

    def __repr__(self) -> str:
        return f"Project(id={self.id!r}, slug={self.slug!r}, status={self.status!r})"
