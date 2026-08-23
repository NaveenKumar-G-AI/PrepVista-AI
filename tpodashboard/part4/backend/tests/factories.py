"""Minimal factory helpers for domain model tests.

Each function builds a valid instance of one entity with sensible defaults,
overridable via kwargs, and flushes it (assigning a real DB-backed state)
without committing -- the enclosing `db_session` fixture's transaction
rollback is what keeps tests isolated from each other.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AgentRun,
    Evaluation,
    GitCheckpoint,
    Organization,
    Project,
    ProjectEvent,
    RepairAttempt,
    Repository,
    Task,
    TestRun,
    ToolExecution,
    User,
)
from app.db.models.enums import RepositoryProvider, TaskType


async def make_user(session: AsyncSession, **overrides: Any) -> User:
    unique = uuid.uuid4().hex[:8]
    user = User(
        email=overrides.pop("email", f"user-{unique}@example.com"),
        display_name=overrides.pop("display_name", "Test User"),
        **overrides,
    )
    session.add(user)
    await session.flush()
    return user


async def make_organization(session: AsyncSession, **overrides: Any) -> Organization:
    unique = uuid.uuid4().hex[:8]
    org = Organization(
        name=overrides.pop("name", "Test Org"),
        slug=overrides.pop("slug", f"test-org-{unique}"),
        **overrides,
    )
    session.add(org)
    await session.flush()
    return org


async def make_project(session: AsyncSession, owner: User, **overrides: Any) -> Project:
    unique = uuid.uuid4().hex[:8]
    project = Project(
        owner_id=owner.id,
        name=overrides.pop("name", "Test Project"),
        slug=overrides.pop("slug", f"test-project-{unique}"),
        **overrides,
    )
    session.add(project)
    await session.flush()
    return project


async def make_task(session: AsyncSession, project: Project, **overrides: Any) -> Task:
    task = Task(
        project_id=project.id,
        title=overrides.pop("title", "Test Task"),
        task_type=overrides.pop("task_type", TaskType.feature),
        **overrides,
    )
    session.add(task)
    await session.flush()
    return task


async def make_agent_run(session: AsyncSession, task: Task, **overrides: Any) -> AgentRun:
    run = AgentRun(
        task_id=task.id,
        agent_type=overrides.pop("agent_type", "coding_agent"),
        **overrides,
    )
    session.add(run)
    await session.flush()
    return run


async def make_tool_execution(
    session: AsyncSession, agent_run: AgentRun, **overrides: Any
) -> ToolExecution:
    execution = ToolExecution(
        agent_run_id=agent_run.id,
        tool_name=overrides.pop("tool_name", "read_file"),
        **overrides,
    )
    session.add(execution)
    await session.flush()
    return execution


async def make_test_run(
    session: AsyncSession, agent_run: AgentRun, task: Task, **overrides: Any
) -> TestRun:
    run = TestRun(
        agent_run_id=agent_run.id,
        task_id=task.id,
        test_framework=overrides.pop("test_framework", "pytest"),
        command=overrides.pop("command", "pytest -q"),
        **overrides,
    )
    session.add(run)
    await session.flush()
    return run


async def make_evaluation(
    session: AsyncSession, task: Task, agent_run: AgentRun, **overrides: Any
) -> Evaluation:
    evaluation = Evaluation(task_id=task.id, agent_run_id=agent_run.id, **overrides)
    session.add(evaluation)
    await session.flush()
    return evaluation


async def make_repair_attempt(
    session: AsyncSession, task: Task, agent_run: AgentRun, **overrides: Any
) -> RepairAttempt:
    attempt = RepairAttempt(
        task_id=task.id,
        agent_run_id=agent_run.id,
        failure_type=overrides.pop("failure_type", "test_failure"),
        failure_summary=overrides.pop("failure_summary", "A test failed."),
        **overrides,
    )
    session.add(attempt)
    await session.flush()
    return attempt


async def make_git_checkpoint(
    session: AsyncSession, project: Project, **overrides: Any
) -> GitCheckpoint:
    unique = uuid.uuid4().hex[:12]
    checkpoint = GitCheckpoint(
        project_id=project.id,
        commit_hash=overrides.pop("commit_hash", unique),
        branch=overrides.pop("branch", "main"),
        message=overrides.pop("message", "Test checkpoint"),
        **overrides,
    )
    session.add(checkpoint)
    await session.flush()
    return checkpoint


async def make_repository(session: AsyncSession, project: Project, **overrides: Any) -> Repository:
    repo = Repository(
        project_id=project.id,
        provider=overrides.pop("provider", RepositoryProvider.github),
        url=overrides.pop("url", "https://github.com/example/repo.git"),
        **overrides,
    )
    session.add(repo)
    await session.flush()
    return repo


async def make_project_event(
    session: AsyncSession, project: Project, **overrides: Any
) -> ProjectEvent:
    event = ProjectEvent(
        project_id=project.id,
        event_type=overrides.pop("event_type", "project_created"),
        message=overrides.pop("message", "Project created."),
        **overrides,
    )
    session.add(event)
    await session.flush()
    return event
