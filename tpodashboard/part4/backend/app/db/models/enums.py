"""Domain enums.

Each maps to a native PostgreSQL ENUM type (see migrations). Status/type
values that are core, queryable, and stable are modeled here as enums
rather than free strings -- per the project's JSONB discipline, only
genuinely dynamic data belongs in JSONB (see `docs/database.md`).

`ProjectEventType` is the deliberate exception: event types are expected to
grow frequently as future parts add new kinds of events, so it is a plain
indexed string rather than a native enum that would require a migration for
every new event kind. See its docstring for the reasoning.
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Build a native PostgreSQL ENUM column type for a Python str-enum.

    Centralized so every enum column is created the same way: stores the
    enum's `.value` (not its Python member name) and gets an explicit,
    stable PostgreSQL type name that migrations can reference.
    """
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda cls: [member.value for member in cls],
    )


class UserStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"
    deactivated = "deactivated"


class OrganizationStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"
    archived = "archived"


class OrganizationRole(enum.StrEnum):
    owner = "owner"
    admin = "admin"
    member = "member"


class ProjectStatus(enum.StrEnum):
    active = "active"
    paused = "paused"
    archived = "archived"
    error = "error"
    completed = "completed"


class RepositoryProvider(enum.StrEnum):
    github = "github"
    gitlab = "gitlab"
    bitbucket = "bitbucket"
    local = "local"
    other = "other"


class RepositoryStatus(enum.StrEnum):
    connected = "connected"
    disconnected = "disconnected"
    error = "error"


class TaskStatus(enum.StrEnum):
    pending = "pending"
    queued = "queued"
    running = "running"
    blocked = "blocked"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    paused = "paused"


class TaskPriority(enum.StrEnum):
    low = "low"
    normal = "normal"
    high = "high"
    critical = "critical"


class TaskType(enum.StrEnum):
    feature = "feature"
    bug = "bug"
    refactor = "refactor"
    test = "test"
    security = "security"
    documentation = "documentation"
    maintenance = "maintenance"
    research = "research"


class AgentRunStatus(enum.StrEnum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"
    timeout = "timeout"


class ToolExecutionStatus(enum.StrEnum):
    requested = "requested"
    running = "running"
    completed = "completed"
    failed = "failed"
    timeout = "timeout"
    cancelled = "cancelled"


class TestRunStatus(enum.StrEnum):
    queued = "queued"
    running = "running"
    passed = "passed"
    failed = "failed"
    error = "error"
    timeout = "timeout"
    cancelled = "cancelled"


class EvaluationStatus(enum.StrEnum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


class RepairAttemptStatus(enum.StrEnum):
    started = "started"
    fixed = "fixed"
    failed = "failed"
    abandoned = "abandoned"


class GitCheckpointStatus(enum.StrEnum):
    created = "created"
    verified = "verified"
    reverted = "reverted"
    invalid = "invalid"


class EventSeverity(enum.StrEnum):
    debug = "debug"
    info = "info"
    warning = "warning"
    error = "error"
    critical = "critical"
