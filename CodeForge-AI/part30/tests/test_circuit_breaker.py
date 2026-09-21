from ai_gateway.enums import CircuitState
from ai_gateway.resilience.circuit_breaker import CircuitBreaker, CircuitBreakerConfig


def make_clock():
    state = {"t": 0.0}

    def clock():
        return state["t"]

    def advance(seconds):
        state["t"] += seconds

    return clock, advance


def test_starts_healthy_and_allows_requests():
    cb = CircuitBreaker(CircuitBreakerConfig())
    assert cb.state == CircuitState.HEALTHY
    assert cb.allow_request() is True


def test_degrades_after_threshold_failures():
    cb = CircuitBreaker(CircuitBreakerConfig(degraded_threshold=2, failure_threshold=5))
    cb.record_failure()
    assert cb.state == CircuitState.HEALTHY
    cb.record_failure()
    assert cb.state == CircuitState.DEGRADED
    assert cb.allow_request() is True  # still allowed while degraded


def test_opens_after_failure_threshold_and_stops_traffic():
    cb = CircuitBreaker(CircuitBreakerConfig(degraded_threshold=2, failure_threshold=3))
    for _ in range(3):
        cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False


def test_success_resets_consecutive_failures():
    cb = CircuitBreaker(CircuitBreakerConfig(degraded_threshold=2, failure_threshold=5))
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.DEGRADED
    cb.record_success()
    assert cb.state == CircuitState.HEALTHY
    cb.record_failure()
    assert cb.state == CircuitState.HEALTHY, "failure count should have reset after the success"


def test_recovery_probe_succeeds_closes_circuit():
    clock, advance = make_clock()
    cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=2, open_duration_s=30.0), clock=clock)
    cb.record_failure()
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False  # still cooling down

    advance(31.0)
    assert cb.state == CircuitState.RECOVERY_CHECK
    assert cb.allow_request() is True  # exactly one probe allowed
    cb.record_success()
    assert cb.state == CircuitState.HEALTHY


def test_recovery_probe_fails_reopens_circuit():
    clock, advance = make_clock()
    cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=2, open_duration_s=30.0), clock=clock)
    cb.record_failure()
    cb.record_failure()
    advance(31.0)
    assert cb.state == CircuitState.RECOVERY_CHECK
    assert cb.allow_request() is True
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.allow_request() is False


def test_half_open_limits_concurrent_probes():
    clock, advance = make_clock()
    cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=1, open_duration_s=10.0, half_open_max_probes=1), clock=clock)
    cb.record_failure()
    advance(11.0)
    assert cb.state == CircuitState.RECOVERY_CHECK
    assert cb.allow_request() is True   # first probe allowed
    assert cb.allow_request() is False  # second concurrent probe blocked
