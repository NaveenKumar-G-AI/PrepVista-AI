import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class StudentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    GRADUATED = "GRADUATED"


class PlacementStatus(str, enum.Enum):
    SEEKING = "SEEKING"
    PLACED = "PLACED"
    HIGHER_STUDIES = "HIGHER_STUDIES"
    ENTREPRENEURSHIP = "ENTREPRENEURSHIP"
    NOT_SEEKING = "NOT_SEEKING"
    OPTED_OUT = "OPTED_OUT"
    WITHDRAWN = "WITHDRAWN"


class Gender(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"
    UNDISCLOSED = "UNDISCLOSED"


class Student(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("institution_id", "register_number", name="uq_student_institution_register_number"),
    )

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    season_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("placement_seasons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    register_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    roll_number: Mapped[str | None] = mapped_column(String(64), index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    institutional_email: Mapped[str | None] = mapped_column(String(255), index=True)
    personal_email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(32), index=True)

    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, name="gender"))
    date_of_birth: Mapped[date | None] = mapped_column(Date)

    status: Mapped[StudentStatus] = mapped_column(
        Enum(StudentStatus, name="student_status"), nullable=False, default=StudentStatus.ACTIVE
    )
    placement_status: Mapped[PlacementStatus] = mapped_column(
        Enum(PlacementStatus, name="placement_status"), nullable=False, default=PlacementStatus.SEEKING
    )

    profile_completion_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Provenance: how this record entered the system (helps import auditing)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")  # manual | import
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True
    )

    batch = relationship("Batch")
    department = relationship("Department")
    program = relationship("Program")

    academic_records: Mapped[list["AcademicRecord"]] = relationship(
        back_populates="student", cascade="all, delete-orphan"
    )
    professional_profile: Mapped["ProfessionalProfile"] = relationship(
        back_populates="student", uselist=False, cascade="all, delete-orphan"
    )
    student_skills: Mapped[list["StudentSkill"]] = relationship(
        back_populates="student", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(back_populates="student", cascade="all, delete-orphan")


class AcademicRecord(Base, UUIDPKMixin, TimestampMixin):
    """
    One row per semester (or a single cumulative row if that's all the
    institution tracks). cumulative_cgpa is duplicated onto the latest
    row deliberately, so 'current CGPA' is always a plain read.
    """

    __tablename__ = "academic_records"
    __table_args__ = (UniqueConstraint("student_id", "semester", name="uq_academic_student_semester"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    semester: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 0 = cumulative/only record
    gpa: Mapped[float | None] = mapped_column(Numeric(4, 2))
    cumulative_cgpa: Mapped[float | None] = mapped_column(Numeric(4, 2))
    percentage: Mapped[float | None] = mapped_column(Numeric(5, 2))
    backlog_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_backlog_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    academic_status: Mapped[str | None] = mapped_column(String(32))  # e.g. GOOD_STANDING, PROBATION
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")

    student: Mapped["Student"] = relationship(back_populates="academic_records")


class ProfessionalProfile(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "professional_profiles"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    headline: Mapped[str | None] = mapped_column(String(255))
    preferred_roles: Mapped[list | None] = mapped_column(JSONB)
    preferred_locations: Mapped[list | None] = mapped_column(JSONB)
    salary_expectation_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    career_interests: Mapped[str | None] = mapped_column(Text)
    linkedin_url: Mapped[str | None] = mapped_column(String(512))
    github_url: Mapped[str | None] = mapped_column(String(512))
    portfolio_url: Mapped[str | None] = mapped_column(String(512))
    resume_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )

    student: Mapped["Student"] = relationship(back_populates="professional_profile")


class Skill(Base, UUIDPKMixin, TimestampMixin):
    """
    Institution-scoped skill taxonomy. NOT hardcoded to any fixed set —
    an institution (or a later analytics layer) defines what it tracks.
    """

    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("institution_id", "name", name="uq_skill_institution_name"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str | None] = mapped_column(String(120))  # e.g. Technical, Communication, Behavioral


class StudentSkill(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "student_skills"
    __table_args__ = (UniqueConstraint("student_id", "skill_id", name="uq_student_skill"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    proficiency: Mapped[int | None] = mapped_column(Integer)  # 0-100 scale, nullable if unassessed
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="self_reported")
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    student: Mapped["Student"] = relationship(back_populates="student_skills")
    skill: Mapped["Skill"] = relationship()


class DocumentType(str, enum.Enum):
    RESUME = "RESUME"
    MARKSHEET = "MARKSHEET"
    ID_PROOF = "ID_PROOF"
    OFFER_LETTER = "OFFER_LETTER"
    OTHER = "OTHER"


class Document(Base, UUIDPKMixin, TimestampMixin):
    """
    Storage-backend-agnostic document record. storage_key is an opaque
    reference resolved by the active StorageService implementation
    (local filesystem in Part 1; S3-compatible is a future swap-in).
    """

    __tablename__ = "documents"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    document_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType, name="document_type"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))
    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    student: Mapped["Student"] = relationship(back_populates="documents")
