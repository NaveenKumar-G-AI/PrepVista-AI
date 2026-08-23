"""Evaluation model.

Judges whether an agent run actually satisfied the requested task -- a
different question from "did the tests pass" (see `TestRun`). `score` is a
0-100 scale (`NUMERIC(5,2)`, human-readable in a dashboard) with a CHECK
constraint enforcing the range; `passed` is a separate boolean because a
future evaluator may use a pass/fail threshold that isn't a simple
"score >= X" (e.g. a required criterion failing regardless of overall
score). `criteria` (JSONB) holds the structured per-criterion breakdown
(functional_correctness, code_quality, etc., see `docs/database.md`
§Evaluation criteria) since the exact criteria set is expected to evolve.
`reasoning_summary` is a concise, bounded explanation -- not an unrestricted
chain-of-thought dump, per the project's rule against storing raw model
reasoning.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import EvaluationStatus, pg_enum
from app.db.models.mixins import CreatedAtMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.agent_run import AgentRun
    from app.db.models.task import Task


class Evaluation(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """A judgment of whether a task's implementation met its requirements."""

    __tablename__ = "evaluations"
    __table_args__ = (
        CheckConstraint(
            "score IS NULL OR (score >= 0 AND score <= 100)", name="ck_evaluation_score_range"
        ),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    agent_run_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("agent_runs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[EvaluationStatus] = mapped_column(
        pg_enum(EvaluationStatus, "evaluation_status"),
        nullable=False,
        default=EvaluationStatus.pending,
    )
    score: Mapped[float | None] = mapped_column(Numeric(5, 2), default=None)
    criteria: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)
    reasoning_summary: Mapped[str | None] = mapped_column(Text, default=None)
    passed: Mapped[bool | None] = mapped_column(Boolean, default=None)

    task: Mapped[Task] = relationship(back_populates="evaluations")
    agent_run: Mapped[AgentRun] = relationship(back_populates="evaluations")

    def __repr__(self) -> str:
        return f"Evaluation(id={self.id!r}, task_id={self.task_id!r}, score={self.score!r})"
