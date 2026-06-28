"""
PrepVista AI - TPO Placement Config (Fix 9)
===========================================
A college-admin (TPO) screen for configuring placement targets:
  * which company archetypes matter for this college,
  * the readiness score the college treats as "placement ready",
  * the competency pillars the college wants emphasised,
  * free-text notes.

GET/PUT only, one row per organization (college). The available company
archetypes and competency pillars come straight from the placement readiness
engine so the config can never drift from what the engine actually scores.

Mounted under /org/my (via the org_college barrel) -> /org/my/placement-config.
Auth: require_org_admin() -> admin.organization_id is the college id.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.database.connection import DatabaseConnection
from app.dependencies import OrgAdminProfile, require_org_admin
from app.routers.org_college_helpers import _log_action
from app.services.placement_readiness import COMPANY_PROFILES, PILLAR_DISPLAY_NAMES

router = APIRouter()

# Allowed option sets, derived from the engine (single source of truth).
_KNOWN_COMPANIES = tuple(profile.name for profile in COMPANY_PROFILES)
_KNOWN_PILLARS = tuple(PILLAR_DISPLAY_NAMES.keys())

_DEFAULT_THRESHOLD = 70
_MAX_NOTES_LEN = 2000


class PlacementConfigRequest(BaseModel):
    target_companies: list[str] = []
    readiness_threshold: int = _DEFAULT_THRESHOLD
    focus_pillars: list[str] = []
    notes: str | None = None

    @field_validator("target_companies")
    @classmethod
    def _check_companies(cls, value: list[str]) -> list[str]:
        # Preserve order, drop duplicates, reject anything the engine doesn't know.
        cleaned: list[str] = []
        for name in value:
            name = str(name).strip()
            if name and name not in _KNOWN_COMPANIES:
                raise ValueError(f"Unknown company archetype: {name!r}.")
            if name and name not in cleaned:
                cleaned.append(name)
        return cleaned

    @field_validator("focus_pillars")
    @classmethod
    def _check_pillars(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for pillar in value:
            pillar = str(pillar).strip()
            if pillar and pillar not in _KNOWN_PILLARS:
                raise ValueError(f"Unknown competency pillar: {pillar!r}.")
            if pillar and pillar not in cleaned:
                cleaned.append(pillar)
        return cleaned

    @field_validator("readiness_threshold")
    @classmethod
    def _check_threshold(cls, value: int) -> int:
        if not 0 <= int(value) <= 100:
            raise ValueError("readiness_threshold must be between 0 and 100.")
        return int(value)

    @field_validator("notes")
    @classmethod
    def _check_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) > _MAX_NOTES_LEN:
            raise ValueError(f"notes must be {_MAX_NOTES_LEN} characters or fewer.")
        return value or None


def _options_payload() -> dict:
    """The fixed choices the UI renders, sourced from the readiness engine."""
    return {
        "available_companies": list(_KNOWN_COMPANIES),
        "available_pillars": [
            {"key": key, "label": PILLAR_DISPLAY_NAMES[key]} for key in _KNOWN_PILLARS
        ],
    }


def _coerce_list(value) -> list[str]:
    """JSONB columns come back as either a parsed list or a JSON string."""
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
        except (ValueError, TypeError):
            return []
        return [str(item) for item in parsed] if isinstance(parsed, list) else []
    return []


@router.get("/placement-config")
async def get_placement_config(admin: OrgAdminProfile = Depends(require_org_admin())):
    """Return the college's placement config (defaults if never set) + the
    available company/pillar options the UI should offer."""
    async with DatabaseConnection() as conn:
        row = await conn.fetchrow(
            """SELECT target_companies, readiness_threshold, focus_pillars,
                      notes, updated_at
               FROM college_placement_config
               WHERE organization_id = $1""",
            admin.organization_id,
        )

    if row:
        config = {
            "target_companies": _coerce_list(row["target_companies"]),
            "readiness_threshold": row["readiness_threshold"],
            "focus_pillars": _coerce_list(row["focus_pillars"]),
            "notes": row["notes"],
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
            "is_default": False,
        }
    else:
        config = {
            "target_companies": [],
            "readiness_threshold": _DEFAULT_THRESHOLD,
            "focus_pillars": [],
            "notes": None,
            "updated_at": None,
            "is_default": True,
        }

    return {"config": config, "options": _options_payload()}


@router.put("/placement-config")
async def update_placement_config(
    body: PlacementConfigRequest,
    admin: OrgAdminProfile = Depends(require_org_admin()),
):
    """Create or update the college's placement config (upsert, one row per org)."""
    org_id = admin.organization_id
    async with DatabaseConnection() as conn:
        await conn.execute(
            """INSERT INTO college_placement_config
                   (organization_id, target_companies, readiness_threshold,
                    focus_pillars, notes, updated_by, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (organization_id) DO UPDATE SET
                   target_companies    = EXCLUDED.target_companies,
                   readiness_threshold = EXCLUDED.readiness_threshold,
                   focus_pillars       = EXCLUDED.focus_pillars,
                   notes               = EXCLUDED.notes,
                   updated_by          = EXCLUDED.updated_by,
                   updated_at          = NOW()""",
            org_id,
            json.dumps(body.target_companies),
            body.readiness_threshold,
            json.dumps(body.focus_pillars),
            body.notes,
            admin.user_id,
        )
        await _log_action(
            conn, org_id, admin.user_id, "placement_config_update",
            entity_type="placement_config",
            metadata={
                "target_companies": body.target_companies,
                "readiness_threshold": body.readiness_threshold,
                "focus_pillars": body.focus_pillars,
            },
        )

    return {"status": "updated"}
