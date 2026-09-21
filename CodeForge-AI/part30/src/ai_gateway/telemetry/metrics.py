"""
Metrics aggregation (Features 44, 79).

Feature 44 explicitly warns against calculating statistics from incomplete
samples without representing the limitation — so `ModelPerformanceProfile`
carries a `sample_size` on every profile, and `percentile()` refuses to
silently interpolate a P99 out of 3 data points; it raises instead so the
caller has to consciously handle "not enough data yet" rather than display
a misleading number.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence


class InsufficientSampleError(Exception):
    pass


def percentile(values: Sequence[float], p: float, *, min_sample_size: int = 5) -> float:
    """Nearest-rank percentile. Raises InsufficientSampleError below
    `min_sample_size` rather than returning a number that looks precise
    but isn't (Feature 44)."""
    if len(values) < min_sample_size:
        raise InsufficientSampleError(
            f"Need at least {min_sample_size} samples for a meaningful p{p:.0f}, got {len(values)}"
        )
    if not (0 <= p <= 100):
        raise ValueError("p must be between 0 and 100")
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, math.ceil(p / 100 * len(ordered)) - 1))
    return ordered[rank]


@dataclass(frozen=True)
class ModelPerformanceProfile:
    provider: str
    model_id: str
    sample_size: int
    request_count: int
    total_tokens: int
    total_cost_usd: Decimal
    failure_count: int
    latencies_ms: tuple[float, ...]  # raw samples retained so percentiles can be recomputed on demand

    @property
    def failure_rate(self) -> float:
        if self.request_count == 0:
            return 0.0
        return self.failure_count / self.request_count

    def latency_percentile(self, p: float) -> float | None:
        try:
            return percentile(list(self.latencies_ms), p)
        except InsufficientSampleError:
            return None  # explicit "not enough data" rather than a misleading number

    def summary(self) -> dict:
        return {
            "provider": self.provider,
            "model_id": self.model_id,
            "sample_size": self.sample_size,
            "request_count": self.request_count,
            "total_tokens": self.total_tokens,
            "total_cost_usd": str(self.total_cost_usd),
            "failure_rate": round(self.failure_rate, 4),
            "p50_latency_ms": self.latency_percentile(50),
            "p90_latency_ms": self.latency_percentile(90),
            "p95_latency_ms": self.latency_percentile(95),
            "p99_latency_ms": self.latency_percentile(99),
        }


def build_performance_profile(
    provider: str, model_id: str, performance_events: list, cost_events: list, usage_events: list
) -> ModelPerformanceProfile:
    """Builds a profile purely from real recorded events — no synthetic
    numbers. If no events exist for this model yet, every metric is 0/empty,
    which is the honest answer, not a placeholder guess."""
    perf = [e for e in performance_events if e.provider == provider and e.model_id == model_id]
    costs = [e for e in cost_events if e.provider == provider and e.model_id == model_id]
    usage = [e for e in usage_events if e.provider == provider and e.model_id == model_id]

    latencies = tuple(e.latency_ms for e in perf)
    failures = sum(1 for e in perf if e.status not in ("COMPLETED",))
    total_tokens = sum(e.input_tokens + e.output_tokens for e in usage)
    total_cost = sum((e.amount_usd for e in costs), Decimal("0"))

    return ModelPerformanceProfile(
        provider=provider,
        model_id=model_id,
        sample_size=len(perf),
        request_count=len(perf),
        total_tokens=total_tokens,
        total_cost_usd=total_cost,
        failure_count=failures,
        latencies_ms=latencies,
    )
