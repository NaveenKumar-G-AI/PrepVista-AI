"""Database constraint and cascade-behavior tests.

Covers: unique constraints, CHECK constraints, and that deletion behavior
matches the intentional design documented in `docs/database.md`
(RESTRICT for historical-linkage FKs, CASCADE for pure join/edge records,
SET NULL for optional links).

Note on assertion placement: the `make_*` factory helpers (see
`tests/factories.py`) flush immediately so callers can use a new object's
generated ID right away. That means for a *second, invalid* factory call,
the constraint violation is raised by that call itself (which flushes
internally), not by a later explicit `db_session.flush()` -- so
`pytest.raises` wraps the actual failing call directly throughout this file
rather than a trailing flush.
"""

from __future__ import annotations

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    AgentRun,
    OrganizationMembership,
    Repository,
    Task,
    TaskDependency,
    User,
)
from tests.factories import (
    make_agent_run,
    make_evaluation,
    make_organization,
    make_project,
    make_repair_attempt,
    make_repository,
    make_task,
    make_tool_execution,
    make_user,
)

# --- Unique constraints ------------------------------------------------


async def test_duplicate_user_email_is_rejected(db_session) -> None:
    await make_user(db_session, email="dupe@example.com")

    with pytest.raises(IntegrityError):
        await make_user(db_session, email="dupe@example.com")


async def test_duplicate_organization_slug_is_rejected(db_session) -> None:
    await make_organization(db_session, slug="acme")

    with pytest.raises(IntegrityError):
        await make_organization(db_session, slug="acme")


async def test_duplicate_project_slug_for_same_owner_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    await make_project(db_session, user, slug="api")

    with pytest.raises(IntegrityError):
        await make_project(db_session, user, slug="api")


async def test_same_project_slug_allowed_for_different_owners(db_session) -> None:
    user_one = await make_user(db_session)
    user_two = await make_user(db_session)
    await make_project(db_session, user_one, slug="api")

    await make_project(db_session, user_two, slug="api")  # must not raise


async def test_duplicate_project_slug_within_same_org_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    org = await make_organization(db_session)
    await make_project(db_session, user, slug="api", organization_id=org.id)

    with pytest.raises(IntegrityError):
        await make_project(db_session, user, slug="api", organization_id=org.id)


async def test_repository_is_one_per_project(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    await make_repository(db_session, project)

    with pytest.raises(IntegrityError):
        await make_repository(db_session, project)


async def test_duplicate_task_dependency_pair_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task_a = await make_task(db_session, project, title="A")
    task_b = await make_task(db_session, project, title="B")
    db_session.add(TaskDependency(task_id=task_b.id, depends_on_task_id=task_a.id))
    await db_session.flush()
    db_session.add(TaskDependency(task_id=task_b.id, depends_on_task_id=task_a.id))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_organization_membership_unique_pair_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    org = await make_organization(db_session)
    db_session.add(OrganizationMembership(organization_id=org.id, user_id=user.id))
    await db_session.flush()
    db_session.add(OrganizationMembership(organization_id=org.id, user_id=user.id))

    with pytest.raises(IntegrityError):
        await db_session.flush()


# --- CHECK constraints -----------------------------------------------------


async def test_task_dependency_self_reference_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    db_session.add(TaskDependency(task_id=task.id, depends_on_task_id=task.id))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_task_negative_attempt_count_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)

    with pytest.raises(IntegrityError):
        await make_task(db_session, project, attempt_count=-1)


async def test_task_zero_max_attempts_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)

    with pytest.raises(IntegrityError):
        await make_task(db_session, project, max_attempts=0)


async def test_evaluation_score_above_range_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)

    with pytest.raises(IntegrityError):
        await make_evaluation(db_session, task, run, score=150)


async def test_evaluation_score_below_range_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)

    with pytest.raises(IntegrityError):
        await make_evaluation(db_session, task, run, score=-1)


async def test_agent_run_negative_input_tokens_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)

    with pytest.raises(IntegrityError):
        await make_agent_run(db_session, task, input_tokens=-5)


async def test_repair_attempt_zero_number_is_rejected(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)

    with pytest.raises(IntegrityError):
        await make_repair_attempt(db_session, task, run, attempt_number=0)


# --- Cascade behavior --------------------------------------------------


async def test_deleting_project_cascades_to_its_repository(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    repo = await make_repository(db_session, project)
    await db_session.flush()

    await db_session.execute(delete(project.__class__).where(project.__class__.id == project.id))
    await db_session.flush()

    remaining = (
        await db_session.execute(select(Repository).where(Repository.id == repo.id))
    ).scalar_one_or_none()
    assert remaining is None


async def test_deleting_user_with_projects_is_restricted(db_session) -> None:
    user = await make_user(db_session)
    await make_project(db_session, user)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(User).where(User.id == user.id))


async def test_deleting_parent_task_nulls_out_child_parent_id(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    parent = await make_task(db_session, project, title="Parent")
    child = await make_task(db_session, project, title="Child", parent_task_id=parent.id)
    await db_session.flush()

    await db_session.execute(delete(Task).where(Task.id == parent.id))
    await db_session.flush()
    await db_session.refresh(child)

    assert child.parent_task_id is None


async def test_deleting_task_cascades_its_dependency_edges(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task_a = await make_task(db_session, project, title="A")
    task_b = await make_task(db_session, project, title="B")
    dependency = TaskDependency(task_id=task_b.id, depends_on_task_id=task_a.id)
    db_session.add(dependency)
    await db_session.flush()
    dependency_id = dependency.id

    await db_session.execute(delete(Task).where(Task.id == task_a.id))
    await db_session.flush()

    remaining = (
        await db_session.execute(select(TaskDependency).where(TaskDependency.id == dependency_id))
    ).scalar_one_or_none()
    assert remaining is None
    # task_b itself is untouched -- only the dependency edge was removed
    still_there = await db_session.get(Task, task_b.id)
    assert still_there is not None


async def test_deleting_task_with_agent_runs_is_restricted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    await make_agent_run(db_session, task)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(Task).where(Task.id == task.id))


async def test_deleting_agent_run_with_tool_executions_is_restricted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    await make_tool_execution(db_session, run)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(AgentRun).where(AgentRun.id == run.id))
