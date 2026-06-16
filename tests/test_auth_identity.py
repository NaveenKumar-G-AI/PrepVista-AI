import asyncio

from app.services.auth_identity import (
    ensure_auth_identity_link,
    extract_auth_identity,
    get_profile_id_for_auth_user,
    list_auth_user_ids_for_profile,
)


class _FakeConn:
    def __init__(self):
        self.links: dict[str, dict[str, str]] = {}

    async def execute(self, query: str, auth_user_id: str, profile_id: str, email: str, provider: str):
        self.links[auth_user_id] = {
            "auth_user_id": auth_user_id,
            "profile_id": profile_id,
            "email": email,
            "provider": provider,
        }

    async def fetchval(self, query: str, auth_user_id: str):
        row = self.links.get(auth_user_id)
        return row["profile_id"] if row else None

    async def fetch(self, query: str, profile_id: str):
        return [row for row in self.links.values() if row["profile_id"] == profile_id]


def test_extract_auth_identity_reads_google_metadata():
    identity = extract_auth_identity({
        "id": "auth-123",
        "email": "User@Example.com",
        "app_metadata": {"provider": "google"},
        "user_metadata": {
            "full_name": "Example User",
            "avatar_url": "https://cdn.example.com/avatar.png",
        },
    })

    assert identity == {
        "auth_user_id": "auth-123",
        "email": "user@example.com",
        "full_name": "Example User",
        "avatar_url": "https://cdn.example.com/avatar.png",
        "provider": "google",
    }


def test_extract_auth_identity_falls_back_to_name_picture_and_email_provider():
    identity = extract_auth_identity({
        "id": "auth-456",
        "email": "candidate@example.com",
        "user_metadata": {
            "name": "Candidate Name",
            "picture": "https://cdn.example.com/picture.png",
        },
    })

    assert identity["provider"] == "email"
    assert identity["full_name"] == "Candidate Name"
    assert identity["avatar_url"] == "https://cdn.example.com/picture.png"


def test_auth_identity_links_resolve_canonical_profile():
    async def runner():
        conn = _FakeConn()
        await ensure_auth_identity_link(conn, "google-auth-id", "canonical-profile-id", "User@Example.com", "google")
        await ensure_auth_identity_link(conn, "email-auth-id", "canonical-profile-id", "user@example.com", "email")

        assert await get_profile_id_for_auth_user(conn, "google-auth-id") == "canonical-profile-id"
        assert await get_profile_id_for_auth_user(conn, "email-auth-id") == "canonical-profile-id"
        assert await list_auth_user_ids_for_profile(conn, "canonical-profile-id") == [
            "google-auth-id",
            "email-auth-id",
        ]

    asyncio.run(runner())
