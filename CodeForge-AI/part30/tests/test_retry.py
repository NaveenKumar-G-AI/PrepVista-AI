import pytest

from ai_gateway.errors import ProviderAuthError, ProviderTimeoutError
from ai_gateway.resilience.retry import RetryPolicy, compute_backoff_delay, retry_with_backoff


async def _fake_sleep(_seconds):
    return None  # tests run instantly, no real waiting


@pytest.mark.asyncio
async def test_succeeds_without_retry_when_first_attempt_works():
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        return "ok"

    result = await retry_with_backoff(fn, RetryPolicy(max_retries=3), sleep=_fake_sleep)
    assert result == "ok"
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_retries_transient_errors_up_to_max_then_succeeds():
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        if calls["n"] < 3:
            raise ProviderTimeoutError("timed out")
        return "ok"

    result = await retry_with_backoff(fn, RetryPolicy(max_retries=3), sleep=_fake_sleep)
    assert result == "ok"
    assert calls["n"] == 3


@pytest.mark.asyncio
async def test_gives_up_after_max_retries_exhausted():
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        raise ProviderTimeoutError("always fails")

    with pytest.raises(ProviderTimeoutError):
        await retry_with_backoff(fn, RetryPolicy(max_retries=2), sleep=_fake_sleep)
    assert calls["n"] == 3  # initial attempt + 2 retries


@pytest.mark.asyncio
async def test_permanent_errors_are_never_retried():
    calls = {"n": 0}

    async def fn():
        calls["n"] += 1
        raise ProviderAuthError("bad credentials")

    with pytest.raises(ProviderAuthError):
        await retry_with_backoff(fn, RetryPolicy(max_retries=5), sleep=_fake_sleep)
    assert calls["n"] == 1, "a permanent error must fail on the first attempt, never retried"


def test_backoff_delay_is_bounded_and_grows_exponentially():
    policy = RetryPolicy(base_delay_s=0.2, max_delay_s=5.0, jitter_s=0.1)
    delays = [compute_backoff_delay(attempt, policy, rand=lambda: 0.0) for attempt in range(10)]
    # zero jitter here so we can check the exact exponential curve and its ceiling
    assert delays[0] == pytest.approx(0.2)
    assert delays[1] == pytest.approx(0.4)
    assert delays[2] == pytest.approx(0.8)
    assert all(d <= policy.max_delay_s + policy.jitter_s for d in delays)
    assert delays[-1] == pytest.approx(policy.max_delay_s)  # eventually caps out


def test_backoff_jitter_adds_bounded_randomness():
    policy = RetryPolicy(base_delay_s=1.0, max_delay_s=10.0, jitter_s=0.5)
    delay = compute_backoff_delay(0, policy, rand=lambda: 1.0)  # max possible jitter
    assert delay == pytest.approx(1.5)
