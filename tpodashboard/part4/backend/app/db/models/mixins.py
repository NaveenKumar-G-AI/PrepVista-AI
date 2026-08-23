"""Shared mixins for domain models.

Every domain entity gets a PostgreSQL-native UUID primary key and
timezone-aware `created_at`/`updated_at` timestamps through these mixins,
so ID and timestamp conventions never drift between tables.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    """Adds a PostgreSQL-native UUID primary key, generated application-side.

    IDs are generated in Python (`uuid.uuid4`) rather than left to a
    database default so a new entity's ID is known immediately after
    construction, before any flush/commit -- useful for wiring up related
    objects in the same unit of work.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    """Adds timezone-aware `created_at` / `updated_at` columns.

    Both are set server-side (`func.now()`) so they reflect the database's
    clock consistently regardless of which process writes the row, and are
    never left as naive datetimes.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class CreatedAtMixin:
    """Adds only `created_at` for append-only / immutable execution records.

    Entities that represent a single historical fact (a tool execution, a
    test run, an event) are never updated after creation, so they get this
    mixin instead of `TimestampMixin` -- there is deliberately no
    `updated_at` to mutate.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
