"""
Multi-tenant foundation: Institution -> Campus -> Department -> Program -> Batch,
plus PlacementSeason which most placement-sensitive records key off of.
"""
import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin


class Institution(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "institutions"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    campuses: Mapped[list["Campus"]] = relationship(back_populates="institution")
    departments: Mapped[list["Department"]] = relationship(back_populates="institution")
    seasons: Mapped[list["PlacementSeason"]] = relationship(back_populates="institution")


class Campus(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "campuses"
    __table_args__ = (UniqueConstraint("institution_id", "name", name="uq_campus_institution_name"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    institution: Mapped["Institution"] = relationship(back_populates="campuses")


class Department(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("institution_id", "code", name="uq_department_institution_code"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    institution: Mapped["Institution"] = relationship(back_populates="departments")
    programs: Mapped[list["Program"]] = relationship(back_populates="department")


class Program(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "programs"
    __table_args__ = (UniqueConstraint("department_id", "code", name="uq_program_department_code"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    degree_level: Mapped[str | None] = mapped_column(String(64))  # e.g. UG, PG
    duration_years: Mapped[int | None] = mapped_column()
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    department: Mapped["Department"] = relationship(back_populates="programs")
    batches: Mapped[list["Batch"]] = relationship(back_populates="program")


class Batch(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "batches"
    __table_args__ = (UniqueConstraint("program_id", "graduation_year", name="uq_batch_program_year"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "B.Tech 2026"
    graduation_year: Mapped[int] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    program: Mapped["Program"] = relationship(back_populates="batches")


class PlacementSeason(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "placement_seasons"
    __table_args__ = (UniqueConstraint("institution_id", "name", name="uq_season_institution_name"),)

    institution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "2026"
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    institution: Mapped["Institution"] = relationship(back_populates="seasons")
