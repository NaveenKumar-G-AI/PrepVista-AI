"""Shared SQLAlchemy declarative base.

Every future ORM model (projects, tasks, agent runs, etc.) should inherit
from `Base` so it is picked up by Alembic autogeneration via
`Base.metadata`. Import new model modules in `app/db/models/__init__.py` so
their tables are registered.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models in the application.

    `type_annotation_map` maps every plain `datetime` column to a
    timezone-aware `DateTime(timezone=True)` by default. Every persisted
    timestamp in this system must be timezone-aware (see
    `docs/database.md` §Timestamps) -- without this, SQLAlchemy's default
    mapping for `datetime` produces a naive column, which is exactly the
    mistake this exists to prevent at the source instead of relying on
    every model author remembering to write `DateTime(timezone=True)`
    explicitly on every column.
    """

    type_annotation_map = {datetime: DateTime(timezone=True)}
