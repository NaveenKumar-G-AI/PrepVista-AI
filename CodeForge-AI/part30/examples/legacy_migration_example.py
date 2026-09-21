"""
Illustrative migration pattern (Features 90-91).

This file has no real CodeForge code to migrate — there's no repository
attached to this build (see REPORT.md). What follows is the SHAPE of the
migration a real call site should follow: wrap the existing direct-call
function so its signature and return type don't change for its callers,
swap its internals to go through the gateway, and only then (once it's
proven safe in staging — Feature 92) delete the old code path.

Feature 91's steps, applied to one hypothetical call site:
  1. inventory   -> this function IS the inventoried call site
  2. classify    -> becomes an OperationPolicy in policy/policy.py
  3. compatibility abstraction -> the `explain_error()` wrapper below
  4. migrate one operation at a time -> repeat this pattern per call site
  5-7. test / monitor / continue -> ordinary rollout, not code
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# BEFORE — a hypothetical existing CodeForge call site, calling a provider
# SDK directly. (Illustrative — not real CodeForge code.)
# ---------------------------------------------------------------------------
#
# import groq
#
# _client = groq.Client(api_key=os.environ["GROQ_API_KEY"])
#
# def explain_error(code: str, error_message: str) -> str:
#     resp = _client.chat.completions.create(
#         model="llama-3.3-70b-versatile",
#         messages=[
#             {"role": "system", "content": "You are a patient coding tutor..."},
#             {"role": "user", "content": f"Code:\n{code}\n\nError:\n{error_message}"},
#         ],
#         max_tokens=800,
#     )
#     return resp.choices[0].message.content
#
# Problems this has, that the gateway exists to fix: no cost tracking, no
# budget enforcement, no fallback if Groq is down, no retry policy, no
# cache, hardcoded model string, no quality floor, nothing stopping this
# from being called with unbounded frequency.


# ---------------------------------------------------------------------------
# AFTER — same function signature, same return type, callers unchanged.
# ---------------------------------------------------------------------------

from ..gateway import AIGateway, GatewayResult
from ..providers.base import ProviderMessage
from ..request.context import RequestContext
from ..enums import Priority, Environment


async def explain_error(
    gateway: AIGateway, *, code: str, error_message: str, user_id: str, organization_id: str,
) -> str:
    """Drop-in async replacement for the direct-SDK version above. The
    operation name here ('code_coach.explain_error') must exist in
    policy/policy.py's PolicyRegistry — see build_example_policy_registry()
    for the illustrative policy this maps to; a real migration replaces
    that example with a policy reviewed against what this feature actually
    needs (Feature 11)."""
    context = RequestContext.new(
        feature="code_coach",
        operation="code_coach.explain_error",
        user_id=user_id,
        organization_id=organization_id,
        priority=Priority.INTERACTIVE,
        environment=Environment.PRODUCTION,
    )
    messages = (
        ProviderMessage(role="system", content="You are a patient coding tutor..."),
        ProviderMessage(role="user", content=f"Code:\n{code}\n\nError:\n{error_message}"),
    )
    result: GatewayResult = await gateway.execute(
        context, messages=messages, input_payload={"code": code, "error_message": error_message},
    )
    return result.text


# ---------------------------------------------------------------------------
# If the call site is synchronous and can't easily become async yet, wrap
# with asyncio.run() as a temporary bridge — but track this as tech debt;
# a sync wrapper around an async gateway call blocks a thread per request
# and won't survive real concurrency.
# ---------------------------------------------------------------------------

import asyncio


def explain_error_sync_bridge(gateway: AIGateway, **kwargs) -> str:
    """Temporary bridge only — see warning above. Prefer migrating the
    call site to async instead of keeping this around long-term."""
    return asyncio.run(explain_error(gateway, **kwargs))
