"""
PrepVista AI - Super Admin Billing
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timezone

from app.database.connection import DatabaseConnection
from app.dependencies import UserProfile, require_main_admin
from app.config import COLLEGE_STUDENT_PLAN

from app.routers.org_admin_schemas import AssignPlanRequest, RecordPaymentRequest
from app.routers.org_admin_helpers import _validate_uuid

router = APIRouter()
@router.post("/organizations/{org_id}/assign-plan")
async def assign_org_plan(
    org_id: str,
    body: AssignPlanRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Assign a plan to a college and grant career access to all active students.

    ✅ FIXED N+1: Was 2 × N serial DB calls (UPDATE org_students + UPDATE profiles
    per student in a for-loop). For 500 students = 1,000 sequential queries —
    guaranteed timeout. Fix: pre-fetch all eligible student IDs in one read,
    then bulk UPDATE with ANY($1::uuid[]) — exactly 2 write queries regardless
    of cohort size.

    ✅ FIXED TRANSACTION: All 4 write operations now inside one transaction.
    Previously no transaction — org plan could be updated and allocation recorded
    but student grants could fail halfway, leaving a paid-but-access-broken state.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        # Pre-fetch eligible students outside transaction (read-only, safe)
        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = FALSE""",
            org_id,
        )
        student_record_ids = [s["id"]           for s in students]
        user_ids           = [str(s["user_id"]) for s in students]
        granted            = len(student_record_ids)
        now                = datetime.now(timezone.utc)

        async with conn.transaction():
            # 1. Update org plan + seat limit
            await conn.execute(
                "UPDATE organizations SET plan = $1, seat_limit = $2, updated_at = NOW() WHERE id = $3",
                body.plan, body.seat_limit, org_id,
            )
            # 2. Record plan allocation
            await conn.execute(
                """INSERT INTO org_plan_allocations
                   (organization_id, plan, seat_limit, billing_type, amount_paise, end_date)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                org_id, body.plan, body.seat_limit, body.billing_type,
                body.amount_paise, body.end_date,
            )
            # 3. Bulk grant career access — 1 query regardless of N
            if student_record_ids:
                await conn.execute(
                    """UPDATE organization_students
                       SET has_career_access = TRUE, access_granted_at = $1,
                           access_granted_by = $2, updated_at = $1
                       WHERE id = ANY($3::uuid[])""",
                    now, admin.id, student_record_ids,
                )
            # 4. Bulk upgrade student profiles — 1 query regardless of N
            if user_ids:
                await conn.execute(
                    """UPDATE profiles
                       SET plan = $1, org_student = TRUE, organization_id = $2
                       WHERE id = ANY($3::uuid[])""",
                    COLLEGE_STUDENT_PLAN, org_id, user_ids,
                )

    return {
        "status":           "plan_assigned",
        "students_granted": granted,
        "message":          f"Plan assigned to {org['name']}. Career access granted to {granted} students.",
    }


@router.post("/organizations/{org_id}/record-payment")
async def record_org_payment(
    org_id: str,
    body: RecordPaymentRequest,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Record a manual/offline payment for a college (bank transfer, cheque, etc.)."""
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        now     = datetime.now(timezone.utc)
        payment = await conn.fetchrow(
            """INSERT INTO org_payments
               (organization_id, provider, plan, amount_paise, currency, status,
                seat_count, notes, created_at, verified_at)
               VALUES ($1, 'manual', $2, $3, 'INR', 'verified', $4, $5, $6, $6)
               RETURNING id""",
            org_id, body.plan, body.amount_paise, body.seat_count,
            body.notes or "Manual payment recorded by admin", now,
        )
    return {
        "status":     "recorded",
        "payment_id": str(payment["id"]),
        "message":    f"Payment of ₹{body.amount_paise / 100:.2f} recorded for {org['name']}.",
    }


@router.post("/organizations/{org_id}/revoke-plan")
async def revoke_org_plan(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Revoke a college's plan and remove career access from all active students.

    ✅ FIXED N+1: Was 2 × N serial DB calls per student. Now exactly 2 bulk
    UPDATE queries regardless of cohort size.

    ✅ FIXED TRANSACTION: All 4 write operations now inside one transaction.
    Previously no transaction — org plan reset + allocation expiry + student
    revocation were three independent writes. A crash between any two left
    data in a broken half-revoked state.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = TRUE""",
            org_id,
        )
        student_record_ids = [s["id"]           for s in students]
        user_ids           = [str(s["user_id"]) for s in students]
        revoked            = len(student_record_ids)

        async with conn.transaction():
            # 1. Bulk revoke career access — 1 query
            if student_record_ids:
                await conn.execute(
                    """UPDATE organization_students
                       SET has_career_access = FALSE, updated_at = NOW()
                       WHERE id = ANY($1::uuid[])""",
                    student_record_ids,
                )
            # 2. Bulk downgrade profiles — 1 query
            if user_ids:
                await conn.execute(
                    "UPDATE profiles SET plan = 'free' WHERE id = ANY($1::uuid[])",
                    user_ids,
                )
            # 3. Reset org plan
            await conn.execute(
                "UPDATE organizations SET plan = 'college_standard', updated_at = NOW() WHERE id = $1",
                org_id,
            )
            # 4. Expire active allocation
            await conn.execute(
                """UPDATE org_plan_allocations SET status = 'expired', updated_at = NOW()
                   WHERE organization_id = $1 AND status = 'active'""",
                org_id,
            )

    return {
        "status":           "revoked",
        "students_revoked": revoked,
        "message":          f"Plan revoked for {org['name']}. Career access removed from {revoked} students.",
    }


@router.post("/organizations/{org_id}/grant-all-access")
async def grant_all_org_access(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Grant career access to ALL active students in the org who don't have it yet.

    ✅ FIXED N+1: Was 2 × N serial DB calls. Now exactly 2 bulk queries.
    ✅ FIXED TRANSACTION: Both writes now inside a single transaction.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = FALSE""",
            org_id,
        )
        student_record_ids = [s["id"]           for s in students]
        user_ids           = [str(s["user_id"]) for s in students]
        granted            = len(student_record_ids)
        now                = datetime.now(timezone.utc)

        if granted > 0:
            async with conn.transaction():
                # 1 query for org_students, 1 query for profiles — never N+N
                await conn.execute(
                    """UPDATE organization_students
                       SET has_career_access = TRUE, access_granted_at = $1,
                           access_granted_by = $2, updated_at = $1
                       WHERE id = ANY($3::uuid[])""",
                    now, admin.id, student_record_ids,
                )
                await conn.execute(
                    """UPDATE profiles
                       SET plan = $1, org_student = TRUE, organization_id = $2
                       WHERE id = ANY($3::uuid[])""",
                    COLLEGE_STUDENT_PLAN, org_id, user_ids,
                )

    return {
        "status":           "granted",
        "students_granted": granted,
        "message":          f"Career access granted to {granted} students in {org['name']}.",
    }


@router.post("/organizations/{org_id}/revoke-all-access")
async def revoke_all_org_access(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    """Revoke career access from ALL active students in the org.

    ✅ FIXED N+1: Was 2 × N serial DB calls. Now exactly 2 bulk queries.
    ✅ FIXED TRANSACTION: Both writes now inside a single transaction.
    """
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT id, name FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")

        students = await conn.fetch(
            """SELECT id, user_id FROM organization_students
               WHERE organization_id = $1 AND status = 'active' AND has_career_access = TRUE""",
            org_id,
        )
        student_record_ids = [s["id"]           for s in students]
        user_ids           = [str(s["user_id"]) for s in students]
        revoked            = len(student_record_ids)

        if revoked > 0:
            async with conn.transaction():
                await conn.execute(
                    """UPDATE organization_students
                       SET has_career_access = FALSE, updated_at = NOW()
                       WHERE id = ANY($1::uuid[])""",
                    student_record_ids,
                )
                await conn.execute(
                    "UPDATE profiles SET plan = 'free' WHERE id = ANY($1::uuid[])",
                    user_ids,
                )

    return {
        "status":           "revoked",
        "students_revoked": revoked,
        "message":          f"Career access revoked from {revoked} students in {org['name']}.",
    }


@router.get("/organizations/{org_id}/billing")
async def get_org_billing_admin(
    org_id: str,
    admin: UserProfile = Depends(require_main_admin()),
):
    _validate_uuid(org_id, "organization ID")   # ✅ SEC
    async with DatabaseConnection() as conn:
        org = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1", org_id)
        if not org:
            raise HTTPException(404, "Organization not found.")
        allocations = await conn.fetch(
            "SELECT * FROM org_plan_allocations WHERE organization_id = $1 ORDER BY created_at DESC",
            org_id,
        )
        payments = await conn.fetch(
            "SELECT * FROM org_payments WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50",
            org_id,
        )
        total_students = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students WHERE organization_id = $1 AND status = 'active'",
            org_id,
        )
        access_count = await conn.fetchval(
            "SELECT COUNT(*) FROM organization_students "
            "WHERE organization_id = $1 AND has_career_access = TRUE AND status = 'active'",
            org_id,
        )
    return {
        "organization":       dict(org),
        "allocations":        [dict(a) for a in allocations],
        "payments":           [dict(p) for p in payments],
        "total_students":     total_students,
        "career_access_count":access_count,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PLATFORM DASHBOARD  (fixed + extended with performance KPIs + renewal risk)
# ══════════════════════════════════════════════════════════════════════════════
