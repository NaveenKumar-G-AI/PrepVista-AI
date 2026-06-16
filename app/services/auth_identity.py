"""
PrepVista - Auth identity helpers
Maps one or more auth provider identities to a single canonical profile.
"""

from __future__ import annotations

from typing import Any

import asyncpg


def resolve_auth_provider(user_data: dict[str, Any]) -> str:
    """Resolve the primary auth provider from a Supabase user payload."""
    app_metadata = user_data.get("app_metadata") or {}
    direct_provider = str(app_metadata.get("provider") or "").strip().lower()
    if direct_provider:
        return direct_provider

    identities = user_data.get("identities") or []
    for identity in identities:
        provider = str((identity or {}).get("provider") or "").strip().lower()
        if provider:
            return provider

    providers = app_metadata.get("providers") or []
    if providers:
        provider = str(providers[0] or "").strip().lower()
        if provider:
            return provider

    return "email"


def extract_auth_identity(user_data: dict[str, Any]) -> dict[str, str]:
    """Extract a normalized identity snapshot from a Supabase user payload."""
    user_metadata = user_data.get("user_metadata") or {}
    full_name = str(user_metadata.get("full_name") or user_metadata.get("name") or "").strip()
    avatar_url = str(user_metadata.get("avatar_url") or user_metadata.get("picture") or "").strip()

    return {
        "auth_user_id": str(user_data.get("id") or "").strip(),
        "email": str(user_data.get("email") or "").strip().lower(),
        "full_name": full_name,
        "avatar_url": avatar_url,
        "provider": resolve_auth_provider(user_data),
    }


async def ensure_auth_identity_link(
    conn: asyncpg.Connection,
    auth_user_id: str,
    profile_id: str,
    email: str,
    provider: str,
) -> str:
    """Upsert the mapping from an auth identity to the canonical profile id."""
    await conn.execute(
        """INSERT INTO auth_identity_links (auth_user_id, profile_id, email, provider)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (auth_user_id) DO UPDATE SET
               profile_id = EXCLUDED.profile_id,
               email = EXCLUDED.email,
               provider = EXCLUDED.provider,
               updated_at = NOW()""",
        auth_user_id,
        profile_id,
        email.strip().lower(),
        (provider or "email").strip().lower(),
    )
    return profile_id


async def get_profile_id_for_auth_user(conn: asyncpg.Connection, auth_user_id: str) -> str | None:
    """Return the canonical profile id for a given auth identity, when linked."""
    value = await conn.fetchval(
        "SELECT profile_id FROM auth_identity_links WHERE auth_user_id = $1",
        auth_user_id,
    )
    return str(value) if value else None


async def list_auth_user_ids_for_profile(conn: asyncpg.Connection, profile_id: str) -> list[str]:
    """Return every linked auth identity for a profile."""
    rows = await conn.fetch(
        """SELECT auth_user_id
           FROM auth_identity_links
           WHERE profile_id = $1
           ORDER BY created_at ASC""",
        profile_id,
    )
    return [str(row["auth_user_id"]) for row in rows]
