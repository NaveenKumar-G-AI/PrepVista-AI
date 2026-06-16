"""
PrepVista AI - Super Admin Schemas
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator
from app.routers.org_admin_helpers import _MAX_EMAIL_LEN, _EMAIL_RE

class CreateOrgRequest(BaseModel):
    name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    placement_cell_name: str | None = None
    branch_code: str | None = None
    seat_limit: int = 50
    notes: str | None = None


class UpdateOrgRequest(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    placement_cell_name: str | None = None
    branch_code: str | None = None
    seat_limit: int | None = None
    notes: str | None = None


class CreateOrgAdminRequest(BaseModel):
    organization_id: str
    email: str
    full_name: str | None = None
    phone: str | None = None


class UpdateOrgAdminRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None


class AssignPlanRequest(BaseModel):
    plan: str = "college_standard"
    seat_limit: int = 50
    billing_type: str = "annual"
    amount_paise: int | None = None
    end_date: str | None = None


class RecordPaymentRequest(BaseModel):
    amount_paise: int
    plan: str = "college_standard"
    billing_type: str = "annual"
    seat_count: int | None = None
    notes: str | None = None


# ══════════════════════════════════════════════════════════════════════════════
# STATISTICAL HELPERS
# (Mirror of org_college.py helpers. Phase 4 recommends extracting both files'
#  copies to app.utils.org_analytics to eliminate the duplication.)
# ══════════════════════════════════════════════════════════════════════════════
