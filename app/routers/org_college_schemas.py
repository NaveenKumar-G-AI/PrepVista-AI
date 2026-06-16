"""
PrepVista AI - Org College Schemas
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator
from app.routers.org_college_helpers import _MAX_EMAIL_LEN, _EMAIL_RE, _MAX_CODE_LEN, _MAX_NOTES_LEN, _MAX_NAME_LEN

# REQUEST MODELS
# ══════════════════════════════════════════════════════════════════════════════

class AddStudentRequest(BaseModel):
    email: str
    student_code: str | None = None
    department_id: str | None = None
    year_id: str | None = None
    batch_id: str | None = None
    section: str | None = None
    grant_career_access: bool = True
    notes: str | None = None

    # ✅ SEC: Validate email format and length. Without this, any string is
    # accepted as an email — including SQL-shaped strings and excessively long
    # inputs that stress LOWER() + LIKE comparisons in list_students.
    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) > _MAX_EMAIL_LEN:
            raise ValueError(f"Email must be {_MAX_EMAIL_LEN} characters or fewer.")
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address format.")
        return v

    @field_validator("student_code", "section", mode="before")
    @classmethod
    def _cap_code_fields(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


class UpdateStudentRequest(BaseModel):
    student_code: str | None = None
    department_id: str | None = None
    year_id: str | None = None
    batch_id: str | None = None
    section: str | None = None
    notes: str | None = None

    @field_validator("student_code", "section", mode="before")
    @classmethod
    def _cap_code_fields(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


class SegmentRequest(BaseModel):
    name: str
    code: str | None = None
    notes: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _cap_name(cls, v: object) -> str:
        s = (str(v) if v is not None else "").strip()
        if not s:
            raise ValueError("Name is required.")
        return s[:_MAX_NAME_LEN]

    @field_validator("code", mode="before")
    @classmethod
    def _cap_code(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


class BatchRequest(BaseModel):
    name: str
    code: str | None = None
    year_id: str | None = None
    notes: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _cap_name(cls, v: object) -> str:
        s = (str(v) if v is not None else "").strip()
        if not s:
            raise ValueError("Name is required.")
        return s[:_MAX_NAME_LEN]

    @field_validator("code", mode="before")
    @classmethod
    def _cap_code(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_CODE_LEN]
        return v

    @field_validator("notes", mode="before")
    @classmethod
    def _cap_notes(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()[:_MAX_NOTES_LEN]
        return v


# ══════════════════════════════════════════════════════════════════════════════