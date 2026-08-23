import enum
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class PipelineStage(str, enum.Enum):
    PROSPECT = "PROSPECT"
    CONTACTED = "CONTACTED"
    INTERESTED = "INTERESTED"
    REQUIREMENT_RECEIVED = "REQUIREMENT_RECEIVED"
    DRIVE_SCHEDULED = "DRIVE_SCHEDULED"
    DRIVE_COMPLETED = "DRIVE_COMPLETED"
    HIRING = "HIRING"
    REPEAT_RECRUITER = "REPEAT_RECRUITER"


class Company(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("institution_id", "name", name="uq_company_institution_name"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(120))
    website: Mapped[str | None] = mapped_column(String(512))
    city: Mapped[str | None] = mapped_column(String(120))
    pipeline_stage: Mapped[PipelineStage] = mapped_column(
        Enum(PipelineStage, name="pipeline_stage"), nullable=False, default=PipelineStage.PROSPECT
    )
    recruiter_owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    contacts: Mapped[list["CompanyContact"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    drives: Mapped[list["Drive"]] = relationship(back_populates="company")


class CompanyContact(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "company_contacts"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_title: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_contacted_at: Mapped[date | None] = mapped_column(Date)
    next_follow_up_at: Mapped[date | None] = mapped_column(Date)

    company: Mapped["Company"] = relationship(back_populates="contacts")
