"""Model creation and relationship tests.

Covers: every core entity can be persisted, relationships resolve
correctly in both directions, timestamps are timezone-aware, and IDs are
proper UUIDs.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.db.models import OrganizationMembership, TaskDependency, User
from app.db.models.enums import OrganizationRole
from tests.factories import (
    make_agent_run,
    make_evaluation,
    make_git_checkpoint,
    make_organization,
    make_project,
    make_project_event,
    make_repair_attempt,
    make_repository,
    make_task,
    make_test_run,
    make_tool_execution,
    make_user,
)

# --- Model creation: every core entity can be persisted ---------------------


async def test_user_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)

    assert isinstance(user.id, uuid.UUID)
    assert user.status.value == "active"


async def test_organization_can_be_persisted(db_session) -> None:
    org = await make_organization(db_session)

    assert isinstance(org.id, uuid.UUID)
    assert org.status.value == "active"


async def test_project_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)

    assert isinstance(project.id, uuid.UUID)
    assert project.status.value == "active"
    assert project.default_branch == "main"


async def test_repository_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    repo = await make_repository(db_session, project)

    assert isinstance(repo.id, uuid.UUID)
    assert repo.status.value == "connected"


async def test_task_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)

    assert isinstance(task.id, uuid.UUID)
    assert task.status.value == "pending"
    assert task.attempt_count == 0
    assert task.max_attempts == 3


async def test_agent_run_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)

    assert isinstance(run.id, uuid.UUID)
    assert run.status.value == "queued"
    assert run.extra_metadata == {}


async def test_tool_execution_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    execution = await make_tool_execution(db_session, run, input={"path": "app/main.py"})

    assert isinstance(execution.id, uuid.UUID)
    assert execution.input == {"path": "app/main.py"}


async def test_test_run_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    test_run = await make_test_run(db_session, run, task)

    assert isinstance(test_run.id, uuid.UUID)
    assert test_run.status.value == "queued"


async def test_evaluation_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    evaluation = await make_evaluation(db_session, task, run, score=87.5, passed=True)

    assert isinstance(evaluation.id, uuid.UUID)
    assert float(evaluation.score) == 87.5
    assert evaluation.passed is True


async def test_repair_attempt_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    attempt = await make_repair_attempt(db_session, task, run)

    assert isinstance(attempt.id, uuid.UUID)
    assert attempt.status.value == "started"
    assert attempt.attempt_number == 1


async def test_git_checkpoint_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    checkpoint = await make_git_checkpoint(db_session, project)

    assert isinstance(checkpoint.id, uuid.UUID)
    assert checkpoint.status.value == "created"


async def test_project_event_can_be_persisted(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    event = await make_project_event(db_session, project)

    assert isinstance(event.id, uuid.UUID)
    assert event.severity.value == "info"


# --- Relationships -----------------------------------------------------


async def test_user_project_relationship(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    await db_session.refresh(user, attribute_names=["projects"])

    assert project in user.projects
    assert project.owner is user


async def test_project_repository_relationship(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    repo = await make_repository(db_session, project)
    await db_session.refresh(project, attribute_names=["repository"])

    assert project.repository is repo
    assert repo.project is project


async def test_task_hierarchy_relationship(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    parent = await make_task(db_session, project, title="Parent")
    child = await make_task(db_session, project, title="Child", parent_task_id=parent.id)
    await db_session.refresh(parent, attribute_names=["children"])

    assert child in parent.children
    assert child.parent is parent


async def test_task_agent_run_relationship(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    await db_session.refresh(task, attribute_names=["agent_runs"])

    assert run in task.agent_runs
    assert run.task is task


async def test_agent_run_tool_execution_relationship(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    execution = await make_tool_execution(db_session, run)
    await db_session.refresh(run, attribute_names=["tool_executions"])

    assert execution in run.tool_executions
    assert execution.agent_run is run


async def test_agent_run_test_run_relationship(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    test_run = await make_test_run(db_session, run, task)
    await db_session.refresh(run, attribute_names=["test_runs"])

    assert test_run in run.test_runs


async def test_evaluation_associations(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)
    evaluation = await make_evaluation(db_session, task, run)
    await db_session.refresh(task, attribute_names=["evaluations"])
    await db_session.refresh(run, attribute_names=["evaluations"])

    assert evaluation in task.evaluations
    assert evaluation in run.evaluations


async def test_git_checkpoint_project_association(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    checkpoint = await make_git_checkpoint(db_session, project)
    await db_session.refresh(project, attribute_names=["git_checkpoints"])

    assert checkpoint in project.git_checkpoints
    assert checkpoint.project is project


async def test_project_event_persistence_and_association(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    event = await make_project_event(db_session, project, event_type="task_created")
    await db_session.refresh(project, attribute_names=["events"])

    assert event in project.events
    assert event.event_type == "task_created"


async def test_organization_membership_relationship(db_session) -> None:
    user = await make_user(db_session)
    org = await make_organization(db_session)
    membership = OrganizationMembership(
        organization_id=org.id, user_id=user.id, role=OrganizationRole.admin
    )
    db_session.add(membership)
    await db_session.flush()
    await db_session.refresh(org, attribute_names=["memberships"])
    await db_session.refresh(user, attribute_names=["organization_memberships"])

    assert membership in org.memberships
    assert membership in user.organization_memberships
    assert membership.role.value == "admin"


async def test_project_can_belong_to_organization(db_session) -> None:
    user = await make_user(db_session)
    org = await make_organization(db_session)
    project = await make_project(db_session, user, organization_id=org.id)
    await db_session.refresh(org, attribute_names=["projects"])

    assert project in org.projects
    assert project.organization is org


# --- Task dependency graph -----------------------------------------------


async def test_task_dependency_can_be_recorded(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task_a = await make_task(db_session, project, title="A")
    task_b = await make_task(db_session, project, title="B")

    dependency = TaskDependency(task_id=task_b.id, depends_on_task_id=task_a.id)
    db_session.add(dependency)
    await db_session.flush()

    await db_session.refresh(task_b, attribute_names=["outgoing_dependencies"])
    await db_session.refresh(task_a, attribute_names=["incoming_dependencies"])
    assert dependency in task_b.outgoing_dependencies
    assert dependency in task_a.incoming_dependencies


# --- Timestamps ----------------------------------------------------------


async def test_created_at_and_updated_at_are_timezone_aware(db_session) -> None:
    user = await make_user(db_session)

    assert user.created_at.tzinfo is not None
    assert user.updated_at.tzinfo is not None
    # sanity: the timestamp should be "now", not some naive epoch artifact
    assert abs((datetime.now(UTC) - user.created_at).total_seconds()) < 30


async def test_immutable_records_have_created_at_but_no_updated_at(db_session) -> None:
    user = await make_user(db_session)
    project = await make_project(db_session, user)
    task = await make_task(db_session, project)
    run = await make_agent_run(db_session, task)

    assert run.created_at.tzinfo is not None
    assert not hasattr(run, "updated_at")


# --- UUID generation -------------------------------------------------------


async def test_ids_are_unique_uuids_across_instances(db_session) -> None:
    user_one = await make_user(db_session)
    user_two = await make_user(db_session)

    assert isinstance(user_one.id, uuid.UUID)
    assert isinstance(user_two.id, uuid.UUID)
    assert user_one.id != user_two.id


async def test_query_by_primary_key_roundtrips(db_session) -> None:
    user = await make_user(db_session)

    fetched = await db_session.get(User, user.id)

    assert fetched is not None
    assert fetched.email == user.email
