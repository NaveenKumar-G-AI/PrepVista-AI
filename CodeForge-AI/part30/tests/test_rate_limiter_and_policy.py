import pytest

from ai_gateway.errors import UnknownOperationError
from ai_gateway.policy.policy import build_example_policy_registry
from ai_gateway.resilience.rate_limiter import InMemoryRateLimiterRegistry, InMemoryTokenBucket, RateLimitConfig


def make_clock():
    state = {"t": 0.0}

    def clock():
        return state["t"]

    def advance(seconds):
        state["t"] += seconds

    return clock, advance


def test_bucket_allows_up_to_capacity_then_blocks():
    clock, _ = make_clock()
    bucket = InMemoryTokenBucket(RateLimitConfig(capacity=3, refill_per_second=0), clock=clock)
    assert bucket.try_acquire() is True
    assert bucket.try_acquire() is True
    assert bucket.try_acquire() is True
    assert bucket.try_acquire() is False, "4th request should be blocked with a capacity of 3 and no refill"


def test_bucket_refills_over_time():
    clock, advance = make_clock()
    bucket = InMemoryTokenBucket(RateLimitConfig(capacity=1, refill_per_second=1.0), clock=clock)
    assert bucket.try_acquire() is True
    assert bucket.try_acquire() is False
    advance(1.0)
    assert bucket.try_acquire() is True, "after 1 second at 1 token/sec, the bucket should have refilled"


def test_registry_gives_each_key_its_own_bucket():
    registry = InMemoryRateLimiterRegistry(RateLimitConfig(capacity=1, refill_per_second=0))
    assert registry.try_acquire("user:1") is True
    assert registry.try_acquire("user:1") is False
    assert registry.try_acquire("user:2") is True, "a different scope key must not share the exhausted bucket"


def test_per_key_override_configuration():
    registry = InMemoryRateLimiterRegistry(RateLimitConfig(capacity=1, refill_per_second=0))
    registry.configure("org:premium", RateLimitConfig(capacity=5, refill_per_second=0))
    for _ in range(5):
        assert registry.try_acquire("org:premium") is True
    assert registry.try_acquire("org:premium") is False


def test_policy_registry_rejects_unknown_operations():
    registry = build_example_policy_registry()
    with pytest.raises(UnknownOperationError):
        registry.get("some_operation_nobody_classified")


def test_example_policies_all_have_sane_invariants():
    """Sanity-checks the seed data's internal consistency (not its
    real-world correctness, which requires inspecting the actual
    CodeForge features — see policy.py's module docstring)."""
    registry = build_example_policy_registry()
    for policy in registry.all():
        assert policy.max_output_tokens > 0
        assert policy.max_input_tokens > 0
        assert policy.max_cost_usd > 0
        assert len(policy.allowed_models) > 0
        assert policy.prompt_version, "every operation must declare a prompt version (Feature 36)"
