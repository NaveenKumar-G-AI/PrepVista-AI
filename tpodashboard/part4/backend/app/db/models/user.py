"""User model.

A minimal, future-compatible identity so projects have an owner. Deliberately
contains no authentication concepts (passwords, OAuth, sessions, tokens) --
those belong to a future identity/authentication part. This table exists
solely so `Project.owner_id` has somewhere to point.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import UserStatus, pg_enum
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.organization import OrganizationMembership
    from app.db.models.project import Project


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A person who can own projects.

    Soft-deletable (`deleted_at`) because deactivating a user shouldn't
    destroy the projects/history they own -- see `docs/database.md` for the
    soft-deletion policy.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        pg_enum(UserStatus, "user_status"), nullable=False, default=UserStatus.active
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    projects: Mapped[list[Project]] = relationship(back_populates="owner")
    organization_memberships: Mapped[list[OrganizationMembership]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:
        return f"User(id={self.id!r}, email={self.email!r}, status={self.status!r})"
