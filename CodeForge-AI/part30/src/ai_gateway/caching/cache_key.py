"""
Cache key construction (Feature 32).

A cache key incorporates every input that materially affects the result:
operation, provider, model, prompt_version, configuration_version, and a
hash of the actual input payload. Missing any one of these is exactly how
cross-user or cross-version leakage happens (Feature 32's explicit
warning), so this is centralized in one function rather than re-implemented
at each call site.

Whether an operation is cacheable AT ALL is a policy decision, not a
caching-layer decision — see policy/policy.py's `cacheable` flag and
caching/cache.py's `AICache.get_or_compute`, which refuses to read/write
the cache for operations not explicitly marked cacheable. That is what
actually prevents personalized output from being cached across users
(Feature 31); this module only ensures that when caching IS allowed, the
key can't accidentally collide across different prompts/models/inputs.
"""

from __future__ import annotations

import hashlib
import json


def build_cache_key(
    *,
    operation: str,
    provider: str,
    model_id: str,
    prompt_version: str,
    config_version: str,
    input_payload: dict,
) -> str:
    normalized = json.dumps(input_payload, sort_keys=True, separators=(",", ":"), default=str)
    input_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]
    return f"aicache:{operation}:{provider}:{model_id}:{prompt_version}:{config_version}:{input_hash}"


def cache_prefix_for_operation(operation: str) -> str:
    """Used for bulk invalidation when an operation's prompt/policy changes
    (Feature 33) without needing to enumerate every input hash."""
    return f"aicache:{operation}:"


def cache_prefix_for_model(operation: str, provider: str, model_id: str) -> str:
    return f"aicache:{operation}:{provider}:{model_id}:"
