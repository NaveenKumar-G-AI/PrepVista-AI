"""ORM model registry.

Every model module is imported here so Alembic's autogeneration can
discover all tables via `app.db.base.Base.metadata`. This is the single
place that must be updated when a new domain model module is added.
"""

from app.db.models.agent_run import AgentRun
from app.db.models.evaluation import Evaluation
from app.db.models.git_checkpoint import GitCheckpoint
from app.db.models.organization import Organization, OrganizationMembership
from app.db.models.project import Project
from app.db.models.project_event import ProjectEvent, ProjectEventType
from app.db.models.repair_attempt import RepairAttempt
from app.db.models.repository import Repository
from app.db.models.task import Task, TaskDependency
from app.db.models.test_run import TestRun
from app.db.models.tool_execution import ToolExecution
from app.db.models.user import User

__all__ = [
    "AgentRun",
    "Evaluation",
    "GitCheckpoint",
    "Organization",
    "OrganizationMembership",
    "Project",
    "ProjectEvent",
    "ProjectEventType",
    "RepairAttempt",
    "Repository",
    "Task",
    "TaskDependency",
    "TestRun",
    "ToolExecution",
    "User",
]
