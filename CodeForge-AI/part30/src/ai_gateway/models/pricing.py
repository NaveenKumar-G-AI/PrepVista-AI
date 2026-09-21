"""
Versioned AI pricing (Feature 10).

Design constraints from the spec that shape this file:
  - Pricing must be configurable and versioned, never scattered as magic
    numbers through business logic.
  - Pricing changes must not corrupt historical cost records: a request
    keeps the pricing version it was actually charged under.
  - Financial values must use accurate decimal arithmetic, never floats.

PricingStore is therefore append-only: once a version is added it cannot be
mutated or removed, only superseded by a newer version. cost/cost_engine.py
always records which version it used.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Dict, Optional


@dataclass(frozen=True)
class ModelPricing:
    provider: str
    model_id: str
    input_price_per_1k: Decimal   # USD per 1,000 input tokens
    output_price_per_1k: Decimal  # USD per 1,000 output tokens

    def key(self) -> str:
        return f"{self.provider}:{self.model_id}"


@dataclass(frozen=True)
class PricingVersion:
    version: str  # e.g. "2026-08-20". Caller-controlled versioning scheme.
    effective_at: datetime
    prices: Dict[str, ModelPricing] = field(default_factory=dict)
    note: str = ""

    def price_for(self, provider: str, model_id: str) -> ModelPricing:
        key = f"{provider}:{model_id}"
        if key not in self.prices:
            raise KeyError(f"No pricing entry for '{key}' in pricing version '{self.version}'")
        return self.prices[key]


class PricingStore:
    """Append-only versioned pricing registry.

    NOT thread-safe for concurrent writers; in production this is backed by
    the `ai_policy_versions`-style table (see db/migrations) where inserts
    are the unit of concurrency control, not in-process locks.
    """

    def __init__(self) -> None:
        self._versions: Dict[str, PricingVersion] = {}
        self._order: list[str] = []  # insertion order == chronological order

    def add_version(self, pv: PricingVersion) -> None:
        if pv.version in self._versions:
            raise ValueError(
                f"Pricing version '{pv.version}' already exists. Pricing versions are "
                f"immutable/append-only — create a new version instead of editing this one."
            )
        self._versions[pv.version] = pv
        self._order.append(pv.version)

    def get(self, version: str) -> PricingVersion:
        if version not in self._versions:
            raise KeyError(f"Unknown pricing version '{version}'")
        return self._versions[version]

    def latest(self) -> PricingVersion:
        if not self._order:
            raise RuntimeError("No pricing versions have been registered yet")
        return self._versions[self._order[-1]]

    def all_versions(self) -> list[str]:
        return list(self._order)


def build_example_pricing_store() -> PricingStore:
    """
    Seeds ONE illustrative pricing version for local dev/tests.

    These numbers are placeholders copied from public documentation at
    build time and WILL drift. Do not depend on them for real billing —
    replace this seed with your actual current Groq/Gemini pricing (or
    better, load pricing rows from the `ai_model_registry` /
    `ai_policy_versions` tables via db/repository.py) before trusting any
    cost numbers this system produces.
    """
    store = PricingStore()
    store.add_version(
        PricingVersion(
            version="example-2026-08-20",
            effective_at=datetime(2026, 8, 20),
            note="ILLUSTRATIVE PLACEHOLDER — verify against current provider pricing pages before production use.",
            prices={
                p.key(): p
                for p in [
                    ModelPricing("groq", "llama-3.3-70b-versatile", Decimal("0.59"), Decimal("0.79")),
                    ModelPricing("groq", "llama-3.1-8b-instant", Decimal("0.05"), Decimal("0.08")),
                    ModelPricing("gemini", "gemini-2.0-flash", Decimal("0.10"), Decimal("0.40")),
                    ModelPricing("gemini", "gemini-2.5-pro", Decimal("1.25"), Decimal("10.00")),
                ]
            },
        )
    )
    return store
