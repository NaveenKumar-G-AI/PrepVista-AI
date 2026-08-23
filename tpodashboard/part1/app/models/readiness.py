import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReadinessSnapshot(Base):
    """
    A point-in-time readiness measurement for a student, produced by
    whatever assessment/training system computes it. Part 1 defines
    the storage shape and the read-side service contract only; it does
    NOT generate or invent readiness values. Until a real assessment
    module writes rows here, get_student_readiness() returns None and
    the API/UI must show "No assessment yet" — never a fabricated score.
    """

    __tablename__ = "readiness_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    overall_score: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-100
    skill_breakdown: Mapped[dict | None] = mapped_column(JSONB)
    source: Mapped[str] = mapped_column(String(64), nullable=False)  # which system computed this
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
