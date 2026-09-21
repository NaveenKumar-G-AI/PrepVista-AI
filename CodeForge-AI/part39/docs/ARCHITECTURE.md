# Architecture

## Request flow

Every AI call — whichever CodeForge feature initiates it — passes through the same pipeline:

```
Feature code
   │  AIGateway.execute(ctx)  (or POST /api/execute)
   ▼
Emergency controls   ── kill switch / disabled task / bulk pause checked first, before anything costs money
   ▼
Policy resolution     ── Global → Organization → Feature → Task, deterministic merge
   ▼
Quota check           ── per-user, per-org request counters
   ▼
Rate limiting          ── token bucket, keyed per org (extensible per feature)
   ▼
Context management     ── token-budget enforcement; truncates oldest turns or rejects, never silently drops content
   ▼
Cache lookup           ── only for tasks explicitly marked cacheable, at the narrowest safe scope
   ▼
Model routing          ── capability-matched, policy-constrained, deterministic given the same inputs
   ▼
Budget reservation      ── atomic reserve of an ESTIMATED cost, before the provider call
   ▼
Concurrency acquire     ── per provider+model semaphore
   ▼
Circuit breaker check   ── per provider+model
   ▼
Provider call (with bounded retries on transient errors only)
   ▼
Cost settlement         ── reservation adjusted from estimated to actual cost
   ▼
Telemetry + audit record
   ▼
Result returned to Feature code
```

On failure, the flow walks a capability-matched fallback chain (never silently downgrading below the task's required capabilities) before returning a structured `DEGRADED`/`FAILED`/`BLOCKED` result — the gateway's `execute()` never throws; callers always get a typed result with a category-tagged, user-safe error when something goes wrong. See `src/gateway/AIGateway.ts`.

## Why a gateway class, not just middleware

Every control in the pipeline above is independently testable (see `tests/*.test.ts` — each engine has its own suite) and independently reusable. `AIGateway` is pure orchestration: it owns no business logic about *what* a good interview analysis or code review looks like, only how a request for one safely reaches a model and comes back. That split is what lets it sit in front of arbitrarily many existing features without duplicating or overriding their domain logic.

## Determinism

Given the same task, policy, model registry, and provider/circuit health, `ModelRouter.route()` always returns the same model — no `Math.random()` anywhere in the routing path. The only source of intentional per-request variation is an explicit experiment configuration, and even that assigns deterministically per `(experiment key, organization, task)` via a stable hash, not per-call randomness — so a given organization always lands in the same experiment arm and a routing decision can always be reproduced from its recorded inputs.

## Concurrency safety without a distributed lock

`BudgetEngine.reserve()` and `QuotaEngine.tryConsume()` perform a synchronous check-then-increment with no `await` in between. Because Node's event loop cannot interleave two synchronous code paths, this is atomic *within a process* without any lock — see `tests/budgetEngine.test.ts`'s concurrent-reservation test, which fires 50 simultaneous reservations against a budget sized for exactly 5 and asserts precisely 5 succeed with zero overshoot.

This does **not** extend across processes. A multi-instance deployment needs the Postgres-equivalent atomic pattern documented in `migrations/001_init.sql`:

```sql
UPDATE ai_budget
   SET used_amount = used_amount + $reserveAmount
 WHERE id = $id AND used_amount + $reserveAmount <= limit_amount
RETURNING *;
```

(a single atomic conditional `UPDATE`, or row-level `SELECT ... FOR UPDATE` — never a separate `SELECT` followed by an `UPDATE`, which reintroduces exactly the race this design avoids).

## Cache isolation

Cache keys are built so that isolation is structural rather than a matter of remembering to check it: `CacheScope.USER` keys always fold the user id in, `CacheScope.TENANT` always folds the organization id in (never the user id), and there is no code path in `CacheLayer.buildKey()` that can produce a `USER`-scope key without a user id — it returns `null` instead. See `tests/cacheLayer.test.ts` and the end-to-end privacy test in `tests/aiGateway.integration.test.ts`.

## Error handling philosophy

Every provider/network/validation error is normalized (`src/errors/index.ts`) into one of a fixed set of categories before anything else in the system sees it. Two things follow from that:

1. **Retry eligibility is a property of the category, not of the call site** — `RetryEngine` only ever retries `TIMEOUT`, `NETWORK_ERROR`, `PROVIDER_ERROR`, and `RATE_LIMIT`. Authentication failures, invalid requests, and policy/budget/quota rejections are never retried, because retrying them wastes a retry budget on a failure mode retrying cannot fix.
2. **The public-facing message is decided once, centrally** (`api/middleware/errorHandler.ts`), so no route handler can accidentally leak a raw provider error or stack trace to an end user. Diagnostic detail (`internalDetail`) is logged (redacted) server-side and only echoed back over the API to callers with a dashboard-level role.

## What's deliberately NOT centralized

Feature 39's own spec is explicit that it should own infrastructure, not business logic. Concretely, this codebase does not know or care:

- What makes a good interview analysis, code review, or coaching response — that's the calling feature's prompt and evaluation logic.
- What a "good" quality signal looks like for a given domain — the gateway records cost/latency/failure-rate telemetry and leaves quality scoring to whatever domain-specific evaluation system a real CodeForge deployment already has (the spec calls this out explicitly: "Do not invent a fake universal AI quality score").

## Known architectural gaps (see `docs/COMPLETION_REPORT.md` for the full list)

- No real queue/worker integration — `Priority.BACKGROUND` / `Priority.BULK` are accepted and used for concurrency/pause decisions, but there's no BullMQ/SQS-style worker pulling from a queue, because there's no existing queue infrastructure in this codebase to reuse (the spec explicitly says not to introduce a duplicate one).
- No distributed tracing wiring — the request/telemetry model carries the fields a tracer would need (`requestId`, timing breakdown), but there's no OpenTelemetry exporter configured.
- Postgres/Redis-backed repository implementations are specified (schema + interfaces) but not written — the app runs against in-memory implementations of the same interfaces today.
