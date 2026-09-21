"""Resume failures must not become fabricated claims or paid generic sessions."""
import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.services import resume_parser as parser


TEXT = """NAVEENKUMAR G
B.Tech Computer Science
Skills: Python, Redis, JavaScript, C++, C#, SQL
Project: API cache
I implemented invalidation and wrote regression tests.
Data Intern at Example Labs
I maintained a SQL dashboard.
"""


def response(**overrides):
    return {
        "candidate_name": "naveenkumar g",
        "education": ["B.Tech Computer Science"],
        "skills": ["python", "Redis"],
        "projects": [{"name": "API cache", "description": "I implemented invalidation and wrote regression tests.", "tech_stack": ["Redis"]}],
        "experience": [{"title": "Data Intern", "company": "Example Labs", "description": "I maintained a SQL dashboard."}],
        "programming_languages": ["Python", "SQL"],
        "certifications": [],
        "inferred_role": "junior_swe",
        **overrides,
    }


def parse(monkeypatch, data):
    call = AsyncMock(return_value=data)
    monkeypatch.setattr(parser, "call_llm_json", call)
    return asyncio.run(parser.parse_resume_structured(TEXT)), call


def test_extraction_retains_source_spelling_and_bounded_groq_contract(monkeypatch):
    summary, call = parse(monkeypatch, response())
    assert summary["candidate_name"] == "NAVEENKUMAR G"
    assert summary["skills"] == ["Python", "Redis"]
    assert summary["projects"][0]["description"] in TEXT
    assert summary["resume_extraction"] == {
        "version": 1, "status": "AVAILABLE", "error_code": None,
        "skill_count": 2, "project_count": 1, "dropped_fields": [],
    }
    assert call.call_args.kwargs["allow_provider_fallback"] is False
    assert call.call_args.kwargs["max_tokens"] == 2000
    assert call.call_args.kwargs["timeout"] * call.call_args.kwargs["retries"] <= 30


@pytest.mark.parametrize("data", [None, [], {}, {"skills": "Python", "projects": []}, {"skills": [], "projects": {}}])
def test_invalid_schema_is_failure_not_no_student_skills(monkeypatch, data):
    summary, _ = parse(monkeypatch, data)
    assert summary["skills"] == []
    assert summary["resume_extraction"]["status"] == "FAILED"
    assert summary["resume_extraction"]["error_code"] == "RESUME_INVALID_SCHEMA"


def test_wrong_types_and_unquoted_claims_are_removed_without_losing_valid_data(monkeypatch):
    summary, _ = parse(monkeypatch, response(
        skills=["Python", "python", "Java", "C", "Rust", {"name": "Kubernetes"}, 5],
        projects=[{"name": "API cache", "description": "I improved speed by 99%.", "tech_stack": ["Redis", "AWS"]},
                  {"name": "Invented platform", "description": "scaled to millions"}, "SQL"],
        certifications="AWS certified",
        programming_languages=["C++", "C#", "SQL"],
        experience=[{"title": "CEO", "company": "Example Labs"}],
        target_role="CEO", is_admin=True,
    ))
    assert summary["skills"] == ["Python"]
    assert summary["programming_languages"] == ["C++", "C#", "SQL"]
    assert summary["projects"] == [{"name": "API cache", "description": "", "tech_stack": ["Redis"]}]
    assert summary["certifications"] == [] and summary["experience"] == []
    assert "target_role" not in summary and "is_admin" not in summary
    assert summary["resume_extraction"]["status"] == "PARTIAL"
    assert "projects.description" in summary["resume_extraction"]["dropped_fields"]


def test_no_claims_is_distinct_from_provider_failure_and_ungrounded_claims(monkeypatch):
    summary, _ = parse(monkeypatch, {"skills": [], "projects": []})
    assert summary["resume_extraction"]["status"] == "NO_CLAIMS"
    summary, _ = parse(monkeypatch, {"skills": ["Rust"], "projects": []})
    assert summary["resume_extraction"]["status"] == "FAILED"
    assert summary["resume_extraction"]["error_code"] == "RESUME_UNGROUNDED_RESPONSE"
    monkeypatch.setattr(parser, "call_llm_json", AsyncMock(side_effect=TimeoutError("private provider body")))
    summary = asyncio.run(parser.parse_resume_structured(TEXT))
    assert summary["resume_extraction"]["status"] == "FAILED"
    assert summary["resume_extraction"]["error_code"] == "RESUME_TIMEOUT"
    assert "private provider body" not in str(summary)


def test_extraction_limits_output_and_deduplicates_claims(monkeypatch):
    summary, _ = parse(monkeypatch, response(skills=["Python"] * 100))
    assert summary["skills"] == ["Python"]
    assert summary["resume_extraction"]["status"] == "PARTIAL"


def test_resume_parsing_through_json_transport_rejects_truncated_provider_response(monkeypatch):
    from app.services import llm
    create = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(
        finish_reason="length", message=SimpleNamespace(content='{"skills":["Python"]'))]))
    monkeypatch.setattr(llm, "_get_groq", lambda: SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    monkeypatch.setattr(llm, "get_settings", lambda: SimpleNamespace(GROQ_API_KEY="fixture", GROQ_MODEL="fixture-model", OPENAI_API_KEY=""))
    summary = asyncio.run(parser.parse_resume_structured(TEXT))
    assert summary["resume_extraction"]["status"] == "FAILED"
    assert summary["resume_extraction"]["error_code"] == "RESUME_TRUNCATED"


def setup_client(monkeypatch, summary):
    from app.dependencies import get_current_user
    from app.routers import interviews_session as routes
    monkeypatch.setattr(routes, "rate_limit_user", AsyncMock())
    monkeypatch.setattr(routes, "enforce_quota", AsyncMock())
    monkeypatch.setattr(routes, "extract_text_from_resume", lambda *args: TEXT)
    monkeypatch.setattr(routes, "parse_resume_structured", AsyncMock(return_value=summary))
    create = AsyncMock(return_value={"session_id": "fixture-id", "access_token": "fixture-token", "plan": "free",
                                   "difficulty_mode": "auto", "max_turns": 5, "duration_seconds": 180, "proctoring_mode": "practice"})
    monkeypatch.setattr(routes, "create_session", create)
    db = SimpleNamespace(execute=AsyncMock())
    @asynccontextmanager
    async def connect():
        yield db
    monkeypatch.setattr(routes, "DatabaseConnection", connect)
    monkeypatch.setattr(routes, "track_funnel_event", AsyncMock())
    application = FastAPI()
    application.include_router(routes.router)
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="owner", plan="free", effective_plan="free", full_name="Profile Student")
    return TestClient(application), create, db


def test_setup_extraction_failure_does_not_create_or_write_a_session(monkeypatch):
    client, create, db = setup_client(monkeypatch, parser._default_resume_summary(TEXT))
    result = client.post("/setup", files={"resume": ("resume.pdf", b"%PDF-fixture", "application/pdf")})
    assert result.status_code == 503
    assert "No interview was started" in result.json()["detail"]
    create.assert_not_awaited()
    db.execute.assert_not_awaited()


def test_setup_persists_valid_claims_and_returns_extraction_status(monkeypatch):
    summary, _ = parse(monkeypatch, response(candidate_name=None))
    client, create, _ = setup_client(monkeypatch, summary)
    result = client.post("/setup", files={"resume": ("resume.pdf", b"%PDF-fixture", "application/pdf")})
    assert result.status_code == 200
    assert result.json()["resume_extraction"]["skill_count"] == 2
    assert create.call_args.kwargs["resume_summary"]["candidate_name"] == "Profile Student"
    assert create.call_args.kwargs["resume_summary"]["candidate_name_source"] == "PROFILE"
    assert create.call_args.kwargs["resume_text"] == TEXT
