"""Repository model.

Records where a project's source lives. One repository per project (see
the unique constraint on `project_id`) -- a project with multiple
repositories is a future extension, not modeled yet. Contains no
credentials: authenticating with a provider belongs to a future secure
secret-management system, not this table.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.db.base import Base
from app.db.models.enums import RepositoryProvider, RepositoryStatus, pg_enum
from app.db.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.project import Project


class Repository(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The source repository backing a project. Deleted along with its project."""

    __tablename__ = "repositories"

    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    provider: Mapped[RepositoryProvider] = mapped_column(
        pg_enum(RepositoryProvider, "repository_provider"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(200), nullable=False, default="main")
    local_path: Mapped[str | None] = mapped_column(String(1024), default=None)
    status: Mapped[RepositoryStatus] = mapped_column(
        pg_enum(RepositoryStatus, "repository_status"),
        nullable=False,
        default=RepositoryStatus.connected,
    )

    project: Mapped[Project] = relationship(back_populates="repository")

    @validates("url")
    def _validate_url(self, _key: str, value: str) -> str:
        """Reject obviously-invalid URLs at the application layer.

        Deliberately lenient (accepts `https://`, `git@host:...` SSH form,
        and bare local filesystem paths for `provider=local`) rather than a
        strict RFC parser, since valid Git remotes take several shapes.
        """
        candidate = value.strip()
        if not candidate:
            raise ValueError("Repository url must not be empty.")
        looks_like_url = "://" in candidate
        looks_like_ssh_remote = "@" in candidate and ":" in candidate
        looks_like_path = candidate.startswith("/") or candidate.startswith(".")
        if not (looks_like_url or looks_like_ssh_remote or looks_like_path):
            raise ValueError(f"Repository url does not look like a valid URL or path: {value!r}")
        return candidate

    def __repr__(self) -> str:
        return f"Repository(id={self.id!r}, provider={self.provider!r}, url={self.url!r})"
