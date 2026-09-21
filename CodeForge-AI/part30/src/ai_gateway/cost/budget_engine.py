"""
Budget engine (Features 20-22).

Budgets are configured at PLATFORM / ORGANIZATION / FEATURE / USER scope
and enforced entirely server-side — Feature 20 is explicit that frontend
controls must never be trusted, so nothing here accepts a budget or spend
number from a request payload; `record_spend` must only ever be called
from the gateway's own cost-calculation path after a real provider call
completes.

Threshold behavior (Feature 21) and the controlled-degradation response
ladder (Feature 22 / Feature 57) are both here so gateway.py can ask "what
should I do right now" and get a deterministic, testable answer instead of
ad-hoc if/else scattered through request handling.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List

from ..enums import BudgetScope, BudgetStatus


@dataclass(frozen=True)
class BudgetConfig:
    scope: BudgetScope
    key: str  # "platform" | organization_id | feature name | user_id
    period_limit_usd: Decimal
    approaching_threshold_pct: Decimal = Decimal("0.75")
    optimization_threshold_pct: Decimal = Decimal("0.90")

    def __post_init__(self):
        if self.period_limit_usd < 0:
            raise ValueError("period_limit_usd cannot be negative")
        if not (Decimal("0") <= self.approaching_threshold_pct <= self.optimization_threshold_pct <= Decimal("1")):
            raise ValueError("thresholds must satisfy 0 <= approaching <= optimization <= 1")


@dataclass
class BudgetState:
    config: BudgetConfig
    spent_usd: Decimal = Decimal("0")

    @property
    def utilization(self) -> Decimal:
        if self.config.period_limit_usd == 0:
            return Decimal("1") if self.spent_usd > 0 else Decimal("0")
        return self.spent_usd / self.config.period_limit_usd

    @property
    def status(self) -> BudgetStatus:
        u = self.utilization
        if u >= 1:
            return BudgetStatus.EXCEEDED
        if u >= self.config.optimization_threshold_pct:
            return BudgetStatus.OPTIMIZATION_REQUIRED
        if u >= self.config.approaching_threshold_pct:
            return BudgetStatus.APPROACHING
        return BudgetStatus.OK

    @property
    def remaining_usd(self) -> Decimal:
        return max(Decimal("0"), self.config.period_limit_usd - self.spent_usd)


# Ordered, cumulative degradation ladder (Feature 22): each status includes
# every action from the statuses below it, then adds one more, escalating
# from "quietly cheaper" to "preserve only what's critical" rather than
# ever cutting the whole product off at once (Feature 22's explicit "do not
# suddenly disable the entire product").
_DEGRADATION_LADDER: dict[BudgetStatus, list[str]] = {
    BudgetStatus.OK: [],
    BudgetStatus.APPROACHING: ["increase_cache_ttl"],
    BudgetStatus.OPTIMIZATION_REQUIRED: [
        "increase_cache_ttl",
        "prefer_cheaper_compatible_models",
        "reduce_background_concurrency",
    ],
    BudgetStatus.EXCEEDED: [
        "increase_cache_ttl",
        "prefer_cheaper_compatible_models",
        "reduce_background_concurrency",
        "queue_noncritical_operations",
        "preserve_critical_only",
    ],
}


class BudgetEngine:
    def __init__(self) -> None:
        self._states: Dict[tuple, BudgetState] = {}

    def register(self, config: BudgetConfig) -> None:
        self._states[(config.scope, config.key)] = BudgetState(config=config)

    def record_spend(self, scope: BudgetScope, key: str, amount_usd: Decimal) -> BudgetState:
        state = self._require(scope, key)
        state.spent_usd += amount_usd
        return state

    def check(self, scope: BudgetScope, key: str) -> BudgetState:
        return self._require(scope, key)

    def has_budget(self, scope: BudgetScope, key: str) -> bool:
        return (scope, key) in self._states

    def worst_status(self, checks: list[tuple[BudgetScope, str]]) -> BudgetStatus:
        """A single request is usually subject to several budgets at once
        (platform + org + feature + user). The most restrictive one wins."""
        order = [BudgetStatus.OK, BudgetStatus.APPROACHING, BudgetStatus.OPTIMIZATION_REQUIRED, BudgetStatus.EXCEEDED]
        worst = BudgetStatus.OK
        for scope, key in checks:
            if not self.has_budget(scope, key):
                continue
            status = self.check(scope, key).status
            if order.index(status) > order.index(worst):
                worst = status
        return worst

    @staticmethod
    def degradation_actions(status: BudgetStatus) -> List[str]:
        return list(_DEGRADATION_LADDER[status])

    def _require(self, scope: BudgetScope, key: str) -> BudgetState:
        k = (scope, key)
        if k not in self._states:
            raise KeyError(f"No budget configured for {scope.value}:{key}")
        return self._states[k]
