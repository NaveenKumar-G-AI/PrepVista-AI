"""
Circuit breaker (Feature 28).

State machine: HEALTHY -> DEGRADED -> OPEN -> RECOVERY_CHECK -> HEALTHY
(or back to OPEN if the recovery probe fails).

Keyed per provider+model by the caller (see resilience/registry pattern in
gateway.py, which keeps one CircuitBreaker instance per "provider:model").
A repeatedly failing model stops receiving normal traffic and the router
falls through to the next candidate (routing/router.py + gateway.py).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from ..enums import CircuitState


@dataclass(frozen=True)
class CircuitBreakerConfig:
    degraded_threshold: int = 2     # consecutive failures -> DEGRADED
    failure_threshold: int = 5      # consecutive failures -> OPEN
    open_duration_s: float = 30.0   # how long OPEN lasts before a recovery probe is allowed
    half_open_max_probes: int = 1   # concurrent probes allowed during RECOVERY_CHECK


class CircuitBreaker:
    def __init__(self, config: CircuitBreakerConfig | None = None, clock=time.monotonic):
        self._config = config or CircuitBreakerConfig()
        self._clock = clock
        self._state = CircuitState.HEALTHY
        self._consecutive_failures = 0
        self._opened_at: float | None = None
        self._probes_in_flight = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN and self._opened_at is not None:
            if self._clock() - self._opened_at >= self._config.open_duration_s:
                self._state = CircuitState.RECOVERY_CHECK
        return self._state

    def allow_request(self) -> bool:
        s = self.state
        if s in (CircuitState.HEALTHY, CircuitState.DEGRADED):
            return True
        if s == CircuitState.RECOVERY_CHECK:
            if self._probes_in_flight < self._config.half_open_max_probes:
                self._probes_in_flight += 1
                return True
            return False
        return False  # OPEN, still cooling down

    def record_success(self) -> None:
        if self._state == CircuitState.RECOVERY_CHECK:
            self._probes_in_flight = max(0, self._probes_in_flight - 1)
        self._consecutive_failures = 0
        self._state = CircuitState.HEALTHY
        self._opened_at = None

    def record_failure(self) -> None:
        if self._state == CircuitState.RECOVERY_CHECK:
            self._probes_in_flight = max(0, self._probes_in_flight - 1)
            self._state = CircuitState.OPEN
            self._opened_at = self._clock()
            return

        self._consecutive_failures += 1
        if self._consecutive_failures >= self._config.failure_threshold:
            self._state = CircuitState.OPEN
            self._opened_at = self._clock()
        elif self._consecutive_failures >= self._config.degraded_threshold:
            self._state = CircuitState.DEGRADED


class CircuitBreakerRegistry:
    """One breaker per 'provider:model' key, created lazily."""

    def __init__(self, config: CircuitBreakerConfig | None = None):
        self._config = config or CircuitBreakerConfig()
        self._breakers: dict[str, CircuitBreaker] = {}

    def get(self, key: str) -> CircuitBreaker:
        if key not in self._breakers:
            self._breakers[key] = CircuitBreaker(self._config)
        return self._breakers[key]

    def snapshot(self) -> dict[str, str]:
        """For the health dashboard / admin API (Feature 45/46)."""
        return {key: cb.state.value for key, cb in self._breakers.items()}
