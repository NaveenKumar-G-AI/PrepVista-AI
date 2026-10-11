"""Storage cleanup resolves references without changing their project or key."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import storage_cleanup


@pytest.fixture
def storage_delete(monkeypatch):
    monkeypatch.setattr(storage_cleanup, "get_settings", lambda: SimpleNamespace(
        SUPABASE_URL="https://owned-project.invalid", INTERVIEW_AUDIO_BUCKET="interview-audio"))
    delete = AsyncMock(return_value=True)
    monkeypatch.setattr(storage_cleanup, "delete_storage_object", delete)
    return delete


@pytest.mark.asyncio
@pytest.mark.parametrize("reference", [
    "https://foreign-project.invalid/storage/v1/object/public/reports/owner/report.pdf",
    "https://owned-project.invalid.evil.invalid/storage/v1/object/public/reports/owner/report.pdf",
    "https://credentials@owned-project.invalid/storage/v1/object/public/reports/owner/report.pdf",
    "https://owned-project.invalid/unrelated/reports/owner/report.pdf",
    "https://owned-project.invalid/storage/v1/object/public/reports/%2e%2e/other/report.pdf",
    "https://owned-project.invalid/storage/v1/object/public/reports%2fother/owner/report.pdf",
    "../other/answer.webm",
    "owner\\..\\other\\answer.webm",
    "",
])
async def test_ambiguous_or_foreign_reference_is_not_deleted(storage_delete, reference):
    assert await storage_cleanup.parse_and_delete_storage_path(reference) is False
    storage_delete.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("access", ["public/", "sign/", "authenticated/", ""])
async def test_local_url_resolves_exact_key_without_query_or_fragment(storage_delete, access):
    result = await storage_cleanup.parse_and_delete_storage_path(
        f"https://owned-project.invalid/storage/v1/object/{access}reports/owner/report%20one.pdf?token=synthetic#ignored")
    assert result is True
    storage_delete.assert_awaited_once_with("reports", "owner/report one.pdf")


@pytest.mark.asyncio
async def test_raw_audio_path_retains_default_bucket(storage_delete):
    assert await storage_cleanup.parse_and_delete_storage_path("session/turn/chunk.webm") is True
    storage_delete.assert_awaited_once_with("interview-audio", "session/turn/chunk.webm")


@pytest.mark.asyncio
async def test_delete_failure_remains_retryable(storage_delete):
    storage_delete.return_value = False
    assert await storage_cleanup.parse_and_delete_storage_path("session/turn/chunk.webm") is False
