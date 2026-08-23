import enum
import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class DriveStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Drive(Base, UUIDPKMixin, TimestampMixin):
    """
    Eligibility criteria (min_cgpa / max_backlogs / eligible_department_ids)
    are real, queryable columns rather than a JSON blob -- this is what
    lets the eligibility engine run as a plain indexed SQL query instead
    of pulling every student into Python to filter.
    """

    __tablename__ = "drives"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    season_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("placement_seasons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(255), nullable=False)
    job_type: Mapped[str] = mapped_column(String(32), nullable=False, default="FULL_TIME")  # FULL_TIME | INTERN
    ctc_lpa: Mapped[float | None] = mapped_column(Numeric(6, 2))
    location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[DriveStatus] = mapped_column(Enum(DriveStatus, name="drive_status"), nullable=False, default=DriveStatus.DRAFT)

    min_cgpa: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=0)
    max_backlogs: Mapped[int] = mapped_column(Integer, nullable=False, default=99)
    eligible_department_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))  # NULL/empty = all departments

    application_deadline: Mapped[date | None] = mapped_column(Date)
    drive_date: Mapped[date | None] = mapped_column(Date)

    company: Mapped["Company"] = relationship(back_populates="drives")
    rounds: Mapped[list["InterviewRound"]] = relationship(
        back_populates="drive", cascade="all, delete-orphan", order_by="InterviewRound.sequence_order"
    )
    applications: Mapped[list["Application"]] = relationship(back_populates="drive")


class InterviewRound(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "interview_rounds"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drive_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drives.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)  # e.g. "Technical Interview"
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    drive: Mapped["Drive"] = relationship(back_populates="rounds")
