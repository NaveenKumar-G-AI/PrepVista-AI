"""
PrepVista - Referral Service
Tracks limited referral invitations and awards bonus interview credits on join.
"""

from __future__ import annotations

import json
import secrets
import string

import asyncpg
import structlog

from app.config import get_settings

logger = structlog.get_logger("prepvista.referrals")

REFERRAL_LIMIT = 3
REFERRAL_CODE_LENGTH = 8
REFERRAL_CODE_PREFIX = "PV"
_REFERRAL_ALPHABET = string.ascii_uppercase + string.digits


def _is_admin_referral_email(email: str | None) -> bool:
    """Return True when the email belongs to the configured admin override account."""
    settings = get_settings()
    return bool(email and settings.ADMIN_EMAIL and email.lower() == settings.ADMIN_EMAIL.lower())


def _get_referral_limit(is_admin_override: bool) -> int | None:
    """Return the referral slot limit. None means unlimited."""
    return None if is_admin_override else REFERRAL_LIMIT


def normalize_email(email: str) -> str:
    """Normalize emails for collision-safe referral matching."""
    return email.strip().lower()


def _generate_referral_code() -> str:
    return REFERRAL_CODE_PREFIX + "".join(
        secrets.choice(_REFERRAL_ALPHABET) for _ in range(REFERRAL_CODE_LENGTH)
    )


async def ensure_referral_identity(conn: asyncpg.Connection, user_id: str) -> str:
    """Guarantee that every user has a stable referral code."""
    existing = await conn.fetchval(
        "SELECT referral_code FROM profiles WHERE id = $1",
        user_id,
    )
    if existing:
        return existing

    for _ in range(12):
        code = _generate_referral_code()
        try:
            await conn.execute(
                """UPDATE profiles
                   SET referral_code = $2,
                       updated_at = NOW()
                   WHERE id = $1 AND (referral_code IS NULL OR referral_code = '')""",
                user_id,
                code,
            )
            stored = await conn.fetchval(
                "SELECT referral_code FROM profiles WHERE id = $1",
                user_id,
            )
            if stored:
                return stored
        except asyncpg.UniqueViolationError:
            continue

    raise RuntimeError("Unable to generate a unique referral code.")


def _build_referral_url(code: str) -> str:
    frontend_url = get_settings().FRONTEND_URL.rstrip("/")
    return f"{frontend_url}/referral/{code}"


async def get_referral_summary(conn: asyncpg.Connection, user_id: str) -> dict:
    """Return referral slots, share URL, and queued/joined referral state."""
    profile = await conn.fetchrow(
        "SELECT email, referral_code FROM profiles WHERE id = $1",
        user_id,
    )
    code = await ensure_referral_identity(conn, user_id)
    rows = await conn.fetch(
        """SELECT invited_email, status, reward_granted, created_at, joined_at
           FROM referrals
           WHERE referrer_user_id = $1
           ORDER BY created_at DESC""",
        user_id,
    )

    is_admin_override = _is_admin_referral_email(profile["email"] if profile else None)
    total_slots = _get_referral_limit(is_admin_override)
    used_slots = len(rows)
    remaining_slots = None if total_slots is None else max(0, total_slots - used_slots)
    successful_referrals = sum(1 for row in rows if row["reward_granted"])

    return {
        "referral_code": code,
        "referral_url": _build_referral_url(code),
        "total_slots": total_slots,
        "used_slots": used_slots,
        "remaining_slots": remaining_slots,
        "is_unlimited": total_slots is None,
        "successful_referrals": successful_referrals,
        "entries": [
            {
                "email": row["invited_email"],
                "status": row["status"],
                "reward_granted": bool(row["reward_granted"]),
                "created_at": str(row["created_at"]),
                "joined_at": str(row["joined_at"]) if row["joined_at"] else None,
            }
            for row in rows
        ],
    }


async def get_public_referral_context(conn: asyncpg.Connection, referral_code: str) -> dict | None:
    """Resolve a public referral code for the invite page."""
    row = await conn.fetchrow(
        """SELECT id, full_name, email
           FROM profiles
           WHERE referral_code = $1""",
        referral_code,
    )
    if not row:
        return None

    count = await conn.fetchval(
        "SELECT COUNT(*) FROM referrals WHERE referrer_user_id = $1",
        row["id"],
    )
    total_slots = _get_referral_limit(_is_admin_referral_email(row["email"]))
    remaining_slots = None if total_slots is None else max(0, total_slots - int(count or 0))

    display_name = (row["full_name"] or "A PrepVista user").strip() or "A PrepVista user"
    return {
        "referrer_name": display_name,
        "remaining_slots": remaining_slots,
        "total_slots": total_slots,
        "is_unlimited": total_slots is None,
    }


async def queue_referral(conn: asyncpg.Connection, referral_code: str, invited_email: str) -> dict:
    """Queue a referral by public code without overriding existing referral ownership."""
    normalized_email = normalize_email(invited_email)

    async with conn.transaction():
        referrer = await conn.fetchrow(
            """SELECT id, email
               FROM profiles
               WHERE referral_code = $1""",
            referral_code,
        )
        if not referrer:
            return {
                "status": "invalid_code",
                "message": "This referral link is no longer available.",
            }

        if normalized_email == normalize_email(referrer["email"] or ""):
            return {
                "status": "self_referral",
                "message": "You cannot use your own email address as a referral.",
            }

        if not _is_admin_referral_email(referrer["email"]):
            used_slots = await conn.fetchval(
                "SELECT COUNT(*) FROM referrals WHERE referrer_user_id = $1",
                referrer["id"],
            )
            if int(used_slots or 0) >= REFERRAL_LIMIT:
                return {
                    "status": "limit_reached",
                    "message": "This user has already used all 3 referral invites.",
                }

        existing_user = await conn.fetchval(
            "SELECT 1 FROM profiles WHERE LOWER(email) = $1",
            normalized_email,
        )
        if existing_user:
            return {
                "status": "exists",
                "message": "User exists.",
            }

        existing_referral = await conn.fetchrow(
            """SELECT referrer_user_id
               FROM referrals
               WHERE invited_email_normalized = $1""",
            normalized_email,
        )
        if existing_referral:
            return {
                "status": "already_queued",
                "message": "This email is already queued through a referral link.",
            }

        await conn.execute(
            """INSERT INTO referrals (
                   referrer_user_id,
                   invited_email,
                   invited_email_normalized,
                   status
               ) VALUES ($1, $2, $3, 'queued')""",
            referrer["id"],
            invited_email.strip(),
            normalized_email,
        )
        await conn.execute(
            """INSERT INTO usage_events (user_id, event_type, metadata)
               VALUES ($1, 'referral_queued', $2)""",
            referrer["id"],
            json.dumps({"invited_email": normalized_email}),
        )

    logger.info("referral_queued", referrer_user_id=referrer["id"], invited_email=normalized_email)
    return {
        "status": "queued",
        "message": "Referral is queued for this exact email. Once that user joins, you will get exactly 1 interview.",
    }


async def apply_joined_referral_reward(
    conn: asyncpg.Connection,
    joined_user_id: str,
    joined_email: str,
) -> dict | None:
    """
    Convert a queued referral into a rewarded referral when the invited user becomes real.
    Safe to call multiple times for the same user/email.
    """
    normalized_email = normalize_email(joined_email)

    async with conn.transaction():
        existing_claim = await conn.fetchrow(
            """SELECT id
               FROM referrals
               WHERE invited_user_id = $1
               LIMIT 1
               FOR UPDATE""",
            joined_user_id,
        )

        referral = await conn.fetchrow(
            """SELECT id, referrer_user_id, reward_granted, invited_user_id, status
               FROM referrals
               WHERE invited_email_normalized = $1
               LIMIT 1
               FOR UPDATE""",
            normalized_email,
        )
        if not referral:
            return None

        if existing_claim and str(existing_claim["id"]) != str(referral["id"]):
            await conn.execute(
                """UPDATE referrals
                   SET status = 'rejected',
                       joined_at = COALESCE(joined_at, NOW())
                   WHERE id = $1 AND status = 'queued'""",
                referral["id"],
            )
            logger.warning(
                "referral_duplicate_join_blocked",
                joined_user_id=joined_user_id,
                referral_id=str(referral["id"]),
            )
            return None

        if str(referral["referrer_user_id"]) == str(joined_user_id):
            logger.warning("referral_self_join_skipped", user_id=joined_user_id)
            return None

        if referral["reward_granted"]:
            if not referral["invited_user_id"]:
                await conn.execute(
                    """UPDATE referrals
                       SET invited_user_id = $2,
                           status = 'joined',
                           joined_at = COALESCE(joined_at, NOW())
                       WHERE id = $1""",
                    referral["id"],
                    joined_user_id,
                )
            return None

        await conn.execute(
            """UPDATE referrals
               SET invited_user_id = $2,
                   status = 'joined',
                   reward_granted = TRUE,
                   joined_at = NOW()
               WHERE id = $1""",
            referral["id"],
            joined_user_id,
        )
        await conn.execute(
            """UPDATE profiles
               SET referral_bonus_interviews = COALESCE(referral_bonus_interviews, 0) + 1,
                   updated_at = NOW()
               WHERE id = $1""",
            referral["referrer_user_id"],
        )
        await conn.execute(
            """INSERT INTO usage_events (user_id, event_type, metadata)
               VALUES ($1, 'referral_reward_granted', $2)""",
            referral["referrer_user_id"],
            json.dumps(
                {
                    "referred_user_id": joined_user_id,
                    "referred_email": normalized_email,
                }
            ),
        )

    logger.info(
        "referral_reward_granted",
        referrer_user_id=referral["referrer_user_id"],
        joined_user_id=joined_user_id,
    )
    return {
        "referrer_user_id": str(referral["referrer_user_id"]),
        "joined_user_id": joined_user_id,
    }
