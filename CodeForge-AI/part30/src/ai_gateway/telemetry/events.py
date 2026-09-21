"""
Telemetry events (Features 42, 44, 78-79).

Every request emits a chain of events that, taken together, make the
request traceable end to end (Feature 78): Feature -> Operation -> Gateway
-> Policy -> Model -> Provider -> Response -> Cost -> Latency -> Quality.
Each event carries the same `request_id` (a correlation ID) so they can be
joined back together later regardless of which table they land in.

These are dataclasses, not ORM models — db/repository.py is responsible
for turning them into rows. Keeping the shapes separate from the
persistence layer means the gateway's core logic can be unit tested
without a database at all (see tests/), and the same events could later
be published to a message bus instead of / in addition to Postgres without
changing gateway.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class UsageEvent:
    request_id: str
    feature: str
    operation: str
    provider: str
    model_id: str
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    estimated: bool
    user_id: Optional[str]
    organization_id: Optional[str]
    environment: str
    created_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class CostEvent:
    request_id: str
    feature: str
    operation: str
    provider: str
    model_id: str
    amount_usd: Decimal
    pricing_version: str
    estimated: bool
    user_id: Optional[str]
    organization_id: Optional[str]
    environment: str
    created_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class PerformanceEvent:
    request_id: str
    feature: str
    operation: str
    provider: str
    model_id: str
    latency_ms: float
    retry_count: int
    used_fallback: bool
    cache_hit: bool
    status: str  # RequestStatus value at completion
    environment: str
    created_at: datetime = field(default_factory=_now)


@dataclass(frozen=True)
class QualityEvent:
    """
    Feature 42 is explicit: "Do not manufacture quality measurements. Use
    authoritative existing signals." This event shape has a slot for real
    signals (validation_passed, retry_triggered, human_override) that the
    gateway itself observes directly. Fields like `student_accepted` or
    `assessment_correct` can only be populated by the real CodeForge
    features that own that judgment (Hint Ladder, Understanding Check,
    etc.) — this package cannot and does not fabricate them, so those
    fields default to None ("unknown"), not a manufactured value like
    False or 0.
    """

    request_id: str
    feature: str
    operation: str
    provider: str
    model_id: str
    validation_passed: bool          # observed directly by validation/schema.py
    retry_triggered: bool            # observed directly by resilience/retry.py
    used_fallback: bool              # observed directly by gateway.py
    user_id: Optional[str] = None
    organization_id: Optional[str] = None
    student_accepted: Optional[bool] = None     # must be supplied by the owning CodeForge feature
    assessment_correct: Optional[bool] = None   # must be supplied by the owning CodeForge feature
    human_override: Optional[bool] = None       # must be supplied by the owning CodeForge feature
    environment: str = "development"
    created_at: datetime = field(default_factory=_now)


class EventSink:
    """In-memory event sink used by gateway.py and the test suite. The
    production wiring (api.py) passes a sink backed by
    db/repository.Repository instead — same interface, durable storage."""

    def __init__(self) -> None:
        self.usage_events: list[UsageEvent] = []
        self.cost_events: list[CostEvent] = []
        self.performance_events: list[PerformanceEvent] = []
        self.quality_events: list[QualityEvent] = []

    def emit_usage(self, event: UsageEvent) -> None:
        self.usage_events.append(event)

    def emit_cost(self, event: CostEvent) -> None:
        self.cost_events.append(event)

    def emit_performance(self, event: PerformanceEvent) -> None:
        self.performance_events.append(event)

    def emit_quality(self, event: QualityEvent) -> None:
        self.quality_events.append(event)
