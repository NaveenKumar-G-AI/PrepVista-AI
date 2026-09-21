import asyncio

import pytest

from ai_gateway.caching.cache import InMemoryAICache
from ai_gateway.caching.cache_key import build_cache_key


def _key(**overrides):
    base = dict(
        operation="classify_topic", provider="groq", model_id="llama-3.1-8b-instant",
        prompt_version="v1", config_version="v1", input_payload={"code": "print(1)"},
    )
    base.update(overrides)
    return build_cache_key(**base)


def test_identical_inputs_produce_identical_keys():
    assert _key() == _key()


def test_different_provider_changes_key():
    assert _key() != _key(provider="gemini")


def test_different_model_changes_key():
    assert _key() != _key(model_id="llama-3.3-70b-versatile")


def test_different_prompt_version_changes_key():
    assert _key() != _key(prompt_version="v2")


def test_different_config_version_changes_key():
    assert _key() != _key(config_version="v2")


def test_different_input_changes_key():
    assert _key() != _key(input_payload={"code": "print(2)"})


def test_key_independent_of_dict_field_order():
    k1 = build_cache_key(
        operation="op", provider="groq", model_id="m", prompt_version="v1",
        config_version="v1", input_payload={"a": 1, "b": 2},
    )
    k2 = build_cache_key(
        operation="op", provider="groq", model_id="m", prompt_version="v1",
        config_version="v1", input_payload={"b": 2, "a": 1},
    )
    assert k1 == k2, "cache key must be stable regardless of dict key insertion order"


@pytest.mark.asyncio
async def test_get_or_compute_returns_cached_value_on_hit():
    cache = InMemoryAICache()
    calls = {"n": 0}

    async def compute():
        calls["n"] += 1
        return "value"

    v1, hit1 = await cache.get_or_compute("k", 60, compute)
    v2, hit2 = await cache.get_or_compute("k", 60, compute)
    assert v1 == v2 == "value"
    assert hit1 is False and hit2 is True
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_concurrent_identical_requests_are_coalesced_into_one_compute():
    cache = InMemoryAICache()
    calls = {"n": 0}

    async def compute():
        calls["n"] += 1
        await asyncio.sleep(0.05)  # simulate a slow provider call
        return f"result-{calls['n']}"

    results = await asyncio.gather(*[cache.get_or_compute("shared-key", 60, compute) for _ in range(10)])
    values = {r[0] for r in results}
    assert calls["n"] == 1, "10 concurrent identical requests should trigger exactly 1 provider call"
    assert values == {"result-1"}, "every caller should receive the same coalesced result"


@pytest.mark.asyncio
async def test_expired_entries_are_not_returned():
    cache = InMemoryAICache()
    await cache.set("k", "v", ttl_s=-1)  # already expired
    assert await cache.get("k") is None


def test_invalidate_prefix_removes_matching_keys_only():
    cache = InMemoryAICache()

    async def _setup():
        await cache.set("aicache:op_a:x", "1", 60)
        await cache.set("aicache:op_a:y", "2", 60)
        await cache.set("aicache:op_b:z", "3", 60)

    asyncio.run(_setup())
    removed = cache.invalidate_prefix("aicache:op_a:")
    assert removed == 2
    assert asyncio.run(cache.get("aicache:op_b:z")) == "3"
