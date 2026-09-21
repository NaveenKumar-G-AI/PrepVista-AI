"""
Token accounting (Feature 16) + cost engine (Feature 17).

All money math uses `decimal.Decimal`, never float — Feature 17 explicitly
forbids unsafe floating-point accounting for financial values, and
Feature 74 requires the resulting numbers to be auditable.

Every CostResult retains the exact pricing_version used to compute it
(Feature 10 / Feature 74): if pricing changes tomorrow, today's historical
cost records stay correct and re-derivable.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal

from ..models.pricing import PricingStore


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0
    estimated: bool = False  # True if the provider did not return exact usage (Feature 16)

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    def __post_init__(self):
        if self.input_tokens < 0 or self.output_tokens < 0 or self.cached_tokens < 0:
            raise ValueError("token counts cannot be negative")


@dataclass(frozen=True)
class CostResult:
    amount_usd: Decimal
    pricing_version: str
    estimated: bool  # propagated from TokenUsage.estimated — an estimated-usage cost
                      # must never be presented to a human as an exact value (Feature 16)


class CostEngine:
    def __init__(self, pricing_store: PricingStore):
        self._pricing_store = pricing_store

    def calculate(
        self,
        *,
        provider: str,
        model_id: str,
        usage: TokenUsage,
        pricing_version: str | None = None,
    ) -> CostResult:
        pv = self._pricing_store.get(pricing_version) if pricing_version else self._pricing_store.latest()
        price = pv.price_for(provider, model_id)

        input_cost = (Decimal(usage.input_tokens) / Decimal(1000)) * price.input_price_per_1k
        output_cost = (Decimal(usage.output_tokens) / Decimal(1000)) * price.output_price_per_1k
        total = (input_cost + output_cost).quantize(Decimal("0.000001"), rounding=ROUND_HALF_EVEN)

        return CostResult(amount_usd=total, pricing_version=pv.version, estimated=usage.estimated)
