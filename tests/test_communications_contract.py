"""Regression tests for the organization communications contract."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.routers.communications import (
    AudienceRequest,
    CreateIssueRequest,
    DraftMessageRequest,
    RespondIssueRequest,
    SendMessageRequest,
    _render_template,
    _unknown_template_variables,
    router,
)


def test_communication_routes_are_registered() -> None:
    paths = {route.path for route in router.routes}

    assert "/communications/messages" in paths
    assert "/communications/draft" in paths
    assert "/communications/inbox" in paths
    assert "/communications/inbox/{message_id:uuid}/acknowledge" in paths
    assert "/communications/issues/mine" in paths

    # Verify that the router is mounted at its production prefix, not merely
    # defined in isolation. Authentication must reject an anonymous request.
    response = TestClient(create_app()).get("/org/my/communications/messages")
    assert response.status_code == 401


def test_message_and_issue_text_is_trimmed_and_blank_values_are_rejected() -> None:
    request = SendMessageRequest(
        subject="  Placement update  ",
        body="  Read the notice.  ",
        audience=AudienceRequest(all_active=True),
    )
    issue = CreateIssueRequest(category="GENERAL", description="  Please help.  ")
    response = RespondIssueRequest(status="RESOLVED", response="  Fixed.  ")
    draft = DraftMessageRequest(instruction="  Draft a reminder.  ")

    assert request.subject == "Placement update"
    assert request.body == "Read the notice."
    assert issue.description == "Please help."
    assert response.response == "Fixed."
    assert draft.instruction == "Draft a reminder."

    with pytest.raises(ValidationError):
        SendMessageRequest(subject="   ", body="valid", audience=AudienceRequest(all_active=True))
    with pytest.raises(ValidationError):
        CreateIssueRequest(category="GENERAL", description="   ")


def test_audience_and_template_validation() -> None:
    with pytest.raises(ValidationError):
        AudienceRequest()

    assert _unknown_template_variables("Hi {{student_name}}", "{{invented_field}}") == ["invented_field"]
    assert _render_template(
        "Hi {{student_name}}, {{company_name}} is hiring.",
        {"student_name": "Asha", "company_name": None},
    ) == "Hi Asha, [not available] is hiring."
