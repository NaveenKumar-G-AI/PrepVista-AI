import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class ApplicationStage(str, enum.Enum):
    APPLIED = "APPLIED"
    SHORTLISTED = "SHORTLISTED"
    INTERVIEWING = "INTERVIEWING"
    SELECTED = "SELECTED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"


class Application(Base, UUIDPKMixin, TimestampMixin):
    """
    One row per (student, drive). This IS the funnel: a student's stage
    for a given drive lives here, not on the Student record itself
    (Part 1 deliberately keeps Student.placement_status as a small,
    permanent enum -- see docs/ARCHITECTURE.md).
    """

    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("drive_id", "student_id", name="uq_application_drive_student"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drive_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drives.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage: Mapped[ApplicationStage] = mapped_column(
        Enum(ApplicationStage, name="application_stage"), nullable=False, default=ApplicationStage.APPLIED
    )
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    drive: Mapped["Drive"] = relationship(back_populates="applications")
    student = relationship("Student")
    interview_schedules: Mapped[list["InterviewSchedule"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    offer: Mapped["Offer"] = relationship(back_populates="application", uselist=False, cascade="all, delete-orphan")


class ScheduleStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"
    CANCELLED = "CANCELLED"


class RoundResult(str, enum.Enum):
    PENDING = "PENDING"
    PASS_ = "PASS"
    FAIL = "FAIL"


class InterviewSchedule(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "interview_schedules"

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("interview_rounds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[ScheduleStatus] = mapped_column(
        Enum(ScheduleStatus, name="schedule_status"), nullable=False, default=ScheduleStatus.SCHEDULED
    )
    result: Mapped[RoundResult] = mapped_column(
        Enum(RoundResult, name="round_result"), nullable=False, default=RoundResult.PENDING
    )
    interviewer_name: Mapped[str | None] = mapped_column(String(255))
    feedback: Mapped[str | None] = mapped_column(Text)

    application: Mapped["Application"] = relationship(back_populates="interview_schedules")
    round: Mapped["InterviewRound"] = relationship()
