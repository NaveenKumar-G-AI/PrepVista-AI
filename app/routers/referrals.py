"""
PrepVista - Referral Router
Public invite queueing plus authenticated referral workspace data.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, get_current_user
from app.services.referrals import get_public_referral_context, get_referral_summary, queue_referral

router = APIRouter()


class QueueReferralRequest(BaseModel):
    referral_code: str
    email: EmailStr


@router.get("/me")
async def get_my_referrals(user: UserProfile = Depends(get_current_user)):
    """Return referral slots and queue state for the current user."""
    async with DatabaseConnection() as conn:
        return await get_referral_summary(conn, user.id)


@router.get("/public/{referral_code}")
async def get_public_referral(referral_code: str):
    """Resolve public referral context for invite landing pages."""
    async with DatabaseConnection() as conn:
        data = await get_public_referral_context(conn, referral_code.strip().upper())

    if not data:
        return {
            "valid": False,
            "message": "This referral link is invalid or unavailable.",
        }

    return {
        "valid": True,
        **data,
    }


@router.post("/queue")
async def queue_referral_email(payload: QueueReferralRequest):
    """Queue a referred email if it is not already a user and not already claimed."""
    async with DatabaseConnection() as conn:
        result = await queue_referral(conn, payload.referral_code.strip().upper(), payload.email)
    return result
