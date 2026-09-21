import pytest

from ai_gateway.enums import RequestStatus
from ai_gateway.request.lifecycle import TERMINAL_STATES, InvalidTransitionError, RequestLifecycle, _TRANSITIONS


def test_happy_path_full_execution():
    lc = RequestLifecycle()
    for step in [
        RequestStatus.VALIDATED, RequestStatus.POLICY_EVALUATED, RequestStatus.CACHE_CHECKED,
        RequestStatus.MODEL_SELECTED, RequestStatus.PROVIDER_SELECTED, RequestStatus.STARTED,
        RequestStatus.COMPLETED,
    ]:
        lc.transition(step)
    assert lc.status == RequestStatus.COMPLETED
    assert lc.is_terminal()


def test_cache_hit_short_circuits_to_completed():
    lc = RequestLifecycle()
    lc.transition(RequestStatus.VALIDATED)
    lc.transition(RequestStatus.POLICY_EVALUATED)
    lc.transition(RequestStatus.CACHE_CHECKED)
    lc.transition(RequestStatus.COMPLETED)  # cache hit — skips model/provider selection entirely
    assert lc.is_terminal()


def test_illegal_jump_is_rejected():
    lc = RequestLifecycle()
    with pytest.raises(InvalidTransitionError):
        lc.transition(RequestStatus.COMPLETED)  # cannot skip straight from CREATED


def test_terminal_states_reject_further_transitions():
    lc = RequestLifecycle()
    lc.transition(RequestStatus.REJECTED)
    assert lc.is_terminal()
    with pytest.raises(InvalidTransitionError):
        lc.transition(RequestStatus.VALIDATED)


def test_failure_and_retry_path():
    lc = RequestLifecycle()
    lc.transition(RequestStatus.VALIDATED)
    lc.transition(RequestStatus.POLICY_EVALUATED)
    lc.transition(RequestStatus.CACHE_CHECKED)
    lc.transition(RequestStatus.MODEL_SELECTED)
    lc.transition(RequestStatus.PROVIDER_SELECTED)
    lc.transition(RequestStatus.STARTED)
    lc.transition(RequestStatus.TIMEOUT)
    lc.transition(RequestStatus.RETRYING)
    lc.transition(RequestStatus.FALLBACK)
    lc.transition(RequestStatus.PROVIDER_SELECTED)
    lc.transition(RequestStatus.STARTED)
    lc.transition(RequestStatus.COMPLETED)
    assert lc.history[0] == RequestStatus.CREATED
    assert lc.history[-1] == RequestStatus.COMPLETED


def test_history_is_recorded_in_order():
    lc = RequestLifecycle()
    lc.transition(RequestStatus.VALIDATED)
    lc.transition(RequestStatus.REJECTED)
    assert [s.value for s in lc.history] == ["CREATED", "VALIDATED", "REJECTED"]


def test_no_non_terminal_state_is_a_dead_end():
    """Feature 7: 'Never leave requests permanently stuck in an ambiguous
    state.' Every non-terminal state must have at least one outgoing edge."""
    for status, edges in _TRANSITIONS.items():
        if status in TERMINAL_STATES:
            continue
        assert len(edges) > 0, f"{status} is non-terminal but has no outgoing transitions — a dead end"


def test_every_failure_equivalent_status_exists():
    required = {
        RequestStatus.TIMEOUT, RequestStatus.RETRYING, RequestStatus.FALLBACK,
        RequestStatus.RATE_LIMITED, RequestStatus.REJECTED, RequestStatus.CANCELLED, RequestStatus.FAILED,
    }
    assert required.issubset(set(_TRANSITIONS.keys()))
