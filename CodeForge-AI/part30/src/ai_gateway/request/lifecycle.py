"""
Request lifecycle (Feature 7).

An explicit transition table means an invalid state jump (e.g. CREATED
straight to COMPLETED, skipping validation/policy/routing) raises
immediately instead of silently corrupting telemetry. Feature 7 also
requires that a request never gets "permanently stuck in an ambiguous
state" — every non-terminal state below has at least one outgoing edge
into either progress or an explicit failure state, and this invariant is
checked by a test (tests/test_lifecycle.py) rather than just asserted in a
comment.
"""

from __future__ import annotations

from ..enums import RequestStatus

_TRANSITIONS: dict[RequestStatus, set[RequestStatus]] = {
    RequestStatus.CREATED: {RequestStatus.VALIDATED, RequestStatus.REJECTED, RequestStatus.CANCELLED},
    RequestStatus.VALIDATED: {RequestStatus.POLICY_EVALUATED, RequestStatus.REJECTED, RequestStatus.CANCELLED},
    RequestStatus.POLICY_EVALUATED: {
        RequestStatus.CACHE_CHECKED, RequestStatus.REJECTED, RequestStatus.RATE_LIMITED, RequestStatus.CANCELLED,
    },
    # CACHE_CHECKED -> COMPLETED directly models a cache hit short-circuiting the provider call.
    RequestStatus.CACHE_CHECKED: {RequestStatus.MODEL_SELECTED, RequestStatus.COMPLETED, RequestStatus.CANCELLED},
    RequestStatus.MODEL_SELECTED: {RequestStatus.PROVIDER_SELECTED, RequestStatus.REJECTED, RequestStatus.CANCELLED},
    RequestStatus.PROVIDER_SELECTED: {RequestStatus.STARTED, RequestStatus.CANCELLED},
    RequestStatus.STARTED: {
        RequestStatus.COMPLETED, RequestStatus.TIMEOUT, RequestStatus.RETRYING,
        RequestStatus.FAILED, RequestStatus.RATE_LIMITED, RequestStatus.FALLBACK,
    },
    RequestStatus.RETRYING: {RequestStatus.STARTED, RequestStatus.FALLBACK, RequestStatus.FAILED},
    RequestStatus.FALLBACK: {RequestStatus.PROVIDER_SELECTED, RequestStatus.FAILED},
    RequestStatus.TIMEOUT: {RequestStatus.RETRYING, RequestStatus.FALLBACK, RequestStatus.FAILED},
    RequestStatus.RATE_LIMITED: {
        RequestStatus.RETRYING, RequestStatus.FALLBACK, RequestStatus.FAILED, RequestStatus.CANCELLED,
    },
    # terminal states — no outgoing edges
    RequestStatus.COMPLETED: set(),
    RequestStatus.REJECTED: set(),
    RequestStatus.CANCELLED: set(),
    RequestStatus.FAILED: set(),
}

TERMINAL_STATES = frozenset(s for s, edges in _TRANSITIONS.items() if not edges)


class InvalidTransitionError(Exception):
    pass


class RequestLifecycle:
    def __init__(self, initial: RequestStatus = RequestStatus.CREATED):
        self._status = initial
        self._history: list[RequestStatus] = [initial]

    @property
    def status(self) -> RequestStatus:
        return self._status

    @property
    def history(self) -> list[RequestStatus]:
        return list(self._history)

    def is_terminal(self) -> bool:
        return self._status in TERMINAL_STATES

    def can_transition(self, to: RequestStatus) -> bool:
        return to in _TRANSITIONS[self._status]

    def transition(self, to: RequestStatus) -> None:
        if not self.can_transition(to):
            raise InvalidTransitionError(
                f"Illegal request lifecycle transition: {self._status.value} -> {to.value} "
                f"(history: {[s.value for s in self._history]})"
            )
        self._status = to
        self._history.append(to)
