"""
Anomaly detection (Features 51-54) and cost forecasting (Feature 55).

This is genuine statistical logic (rolling baseline + standard-deviation
threshold, and a moving-average projection), not a mock. What it cannot
do is be *meaningful* without real historical production data feeding it —
a baseline computed from 3 test requests is not a baseline. Every result
here is tagged as ACTUAL, ESTIMATED, or FORECAST (Feature 55's explicit
requirement) and anomaly results report their own sample size so a caller
can see when a "5x spike" claim is backed by a thin baseline.

`possible_causes()` implements Feature 52 as a *checklist for a human to
go investigate*, not an automated diagnosis — Feature 52 explicitly says
"do not claim a cause without evidence," and this module has no access to
deploy logs, prompt diffs, or traffic graphs, so it cannot actually
determine which cause applies.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Sequence


class AnomalyKind(str, Enum):
    COST = "COST"
    TOKENS = "TOKENS"
    REQUEST_VOLUME = "REQUEST_VOLUME"
    LATENCY = "LATENCY"
    FAILURE_RATE = "FAILURE_RATE"


@dataclass(frozen=True)
class AnomalyResult:
    kind: AnomalyKind
    is_anomalous: bool
    observed_value: float
    baseline_mean: float
    baseline_stdev: float
    z_score: float | None
    baseline_sample_size: int
    reason: str


# Feature 52: known categories of cause, for a human to investigate. This is
# intentionally NOT wired to auto-select one — see module docstring.
POSSIBLE_ANOMALY_CAUSES = [
    "retry_loop",
    "prompt_growth",
    "cache_failure",
    "traffic_spike",
    "provider_problem",
    "model_configuration_change",
    "application_bug",
]


def detect_anomaly(
    kind: AnomalyKind,
    observed_value: float,
    baseline_values: Sequence[float],
    *,
    z_threshold: float = 3.0,
    min_baseline_samples: int = 10,
) -> AnomalyResult:
    if len(baseline_values) < min_baseline_samples:
        return AnomalyResult(
            kind=kind,
            is_anomalous=False,
            observed_value=observed_value,
            baseline_mean=0.0,
            baseline_stdev=0.0,
            z_score=None,
            baseline_sample_size=len(baseline_values),
            reason=(
                f"Baseline has only {len(baseline_values)} samples "
                f"(need >= {min_baseline_samples}) — too thin to judge anomalies yet."
            ),
        )

    mean = statistics.fmean(baseline_values)
    stdev = statistics.pstdev(baseline_values) if len(set(baseline_values)) > 1 else 0.0

    if stdev == 0:
        is_anomalous = observed_value != mean
        z = None
        reason = "Baseline has zero variance; flagging any deviation from the constant baseline."
    else:
        z = (observed_value - mean) / stdev
        is_anomalous = abs(z) >= z_threshold
        reason = f"z-score {z:.2f} vs threshold {z_threshold} over {len(baseline_values)} baseline samples."

    return AnomalyResult(
        kind=kind,
        is_anomalous=is_anomalous,
        observed_value=observed_value,
        baseline_mean=mean,
        baseline_stdev=stdev,
        z_score=z,
        baseline_sample_size=len(baseline_values),
        reason=reason,
    )


# ---------------------------------------------------------------------------
# Cost forecasting (Feature 55)
# ---------------------------------------------------------------------------

class ForecastConfidence(str, Enum):
    ACTUAL = "ACTUAL"
    ESTIMATED = "ESTIMATED"
    FORECAST = "FORECAST"


@dataclass(frozen=True)
class CostForecast:
    confidence: ForecastConfidence
    period_label: str  # "daily" | "weekly" | "monthly" | "at_Nx_volume"
    projected_cost_usd: Decimal
    basis_sample_days: int
    method: str


def forecast_cost(daily_costs_usd: Sequence[Decimal], *, period_days: int, period_label: str,
                   min_days_required: int = 7) -> CostForecast:
    """Simple moving-average projection. Deliberately simple and
    inspectable rather than a black-box model — Feature 55 asks for a
    clearly labeled forecast, not a falsely precise one. Raises if there
    isn't enough history to project responsibly."""
    if len(daily_costs_usd) < min_days_required:
        raise ValueError(
            f"Need at least {min_days_required} days of real cost history to forecast "
            f"'{period_label}', got {len(daily_costs_usd)}. Refusing to guess."
        )
    avg_daily = sum(daily_costs_usd, Decimal("0")) / Decimal(len(daily_costs_usd))
    projected = (avg_daily * Decimal(period_days)).quantize(Decimal("0.01"))
    return CostForecast(
        confidence=ForecastConfidence.FORECAST,
        period_label=period_label,
        projected_cost_usd=projected,
        basis_sample_days=len(daily_costs_usd),
        method=f"moving_average(days={len(daily_costs_usd)}) * {period_days}",
    )


def forecast_cost_at_volume(current_daily_cost_usd: Decimal, current_daily_active_users: int,
                             projected_active_users: int) -> CostForecast:
    """Feature 55's 'expected cost at higher student volume'. Linear in
    active users — a simplification worth stating out loud: real cost per
    user is rarely perfectly linear (caching, fixed background costs, etc.
    all break linearity), so this is explicitly a rough FORECAST, not a
    precise prediction."""
    if current_daily_active_users <= 0:
        raise ValueError("current_daily_active_users must be > 0")
    per_user = current_daily_cost_usd / Decimal(current_daily_active_users)
    projected = (per_user * Decimal(projected_active_users)).quantize(Decimal("0.01"))
    return CostForecast(
        confidence=ForecastConfidence.FORECAST,
        period_label=f"daily_at_{projected_active_users}_users",
        projected_cost_usd=projected,
        basis_sample_days=1,
        method="linear_extrapolation_per_active_user (simplifying assumption — see docstring)",
    )
