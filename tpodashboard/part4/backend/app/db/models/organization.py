"""Organization model and user membership.

A lightweight team foundation: an `Organization` can own projects, and
`OrganizationMembership` links users to organizations with a role. No
invitations, billing, or role-management API is implemented -- this exists
purely so a project can eventually be owned by a team instead of only an
individual `User`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import OrganizationRole, OrganizationStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.project import Project
    from app.db.models.user import User


class Organization(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A team that can own projects. Soft-deletable, same rationale as `User`."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    status: Mapped[OrganizationStatus] = mapped_column(
        pg_enum(OrganizationStatus, "organization_status"),
        nullable=False,
        default=OrganizationStatus.active,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    memberships: Mapped[list[OrganizationMembership]] = relationship(
        back_populates="organization", cascade="all, delete-orphan", passive_deletes=True
    )
    projects: Mapped[list[Project]] = relationship(back_populates="organization")

    def __repr__(self) -> str:
        return f"Organization(id={self.id!r}, slug={self.slug!r})"


class OrganizationMembership(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Links a `User` to an `Organization` with a role.

    A pure join record -- not independently meaningful historical data --
    so it cascade-deletes when either side is removed (see
    `docs/database.md` §Cascade behavior).
    """

    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[OrganizationRole] = mapped_column(
        pg_enum(OrganizationRole, "organization_role"),
        nullable=False,
        default=OrganizationRole.member,
    )

    organization: Mapped[Organization] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="organization_memberships")

    def __repr__(self) -> str:
        return f"OrganizationMembership(org={self.organization_id!r}, user={self.user_id!r})"
