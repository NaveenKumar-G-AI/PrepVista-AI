# CodeForge AI Gateway — AI Cost & Performance Control Plane

A central AI request gateway, model router, cost/budget engine, and
resilience layer (retry / circuit breaker / rate limiting / caching), with
Postgres persistence (RLS-isolated by organization) and an admin control
API — built from the "AI Cost & Performance Controls" specification.

**Read this first:** [REPORT.md](./REPORT.md) is the honest, itemized
status of every feature in the spec — what's real and tested, what's a
labeled placeholder, and what's blocked in this environment and why. This
README is the practical setup guide; REPORT.md is the accountability
document. Please read REPORT.md before treating anything here as
production-ready.

**The one-sentence version of REPORT.md:** there was no existing CodeForge
repository available to inspect or integrate with, so this is a
standalone, real, tested reference implementation of the control plane —
not a patch against your actual codebase. Wiring it into CodeForge (real
operation classifications, real model choices, real deployment) is the
next step, not something this build could do without your repo.

---

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env: GROQ_API_KEY, GEMINI_API_KEY, DATABASE_URL, REDIS_URL, ADMIN_API_TOKEN

# Apply the schema to your Postgres (Supabase or otherwise):
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -f db/migrations/0002_rls.sql

# Run the test suite (DB/Redis-dependent tests skip cleanly if unconfigured):
pytest

# Run the API:
uvicorn ai_gateway.api:app --reload --port 8000
```

Without any `.env` configured at all, `pytest` still runs and passes — 101
of the 111 tests need no external services (verified with a fully scrubbed
environment, not just an unset variable or two). The other 10 (5 Postgres
integration, 5 Redis integration) light up automatically once
`DATABASE_URL` / `REDIS_URL` are set — no implicit `localhost` fallback in
either suite, so "unconfigured" means the same thing for both.

## What's actually in here

```
src/ai_gateway/
  gateway.py              Central orchestrator — the one path every AI call goes through
  enums.py, errors.py      Shared vocabulary and exception hierarchy
  config.py                 Settings — every secret blank by default, fails loudly (not silently) when used unset
  models/
    registry.py              Model registry (capabilities, quality class, context limit, pricing)
    pricing.py                Versioned, append-only, Decimal-safe pricing
  providers/
    base.py                    Provider-independent interface
    groq_provider.py            Real Groq HTTP adapter (needs GROQ_API_KEY to actually call out)
    gemini_provider.py          Real Gemini HTTP adapter (needs GEMINI_API_KEY)
    mock_provider.py             Scriptable provider used ONLY by tests
  policy/policy.py           Per-operation policy: quality floor, models, budget, cache, priority
  routing/router.py          Capability -> quality -> context -> availability -> THEN cost
  resilience/
    retry.py                   Bounded exponential backoff + jitter
    circuit_breaker.py          HEALTHY -> DEGRADED -> OPEN -> RECOVERY_CHECK
    rate_limiter.py              Token bucket: in-memory + real atomic Redis (Lua script)
    concurrency.py                 Semaphore-based per-scope concurrency limits
    idempotency.py                  Duplicate-execution protection
  caching/
    cache.py                    In-memory + Redis-backed cache, WITH real request coalescing
    cache_key.py                  operation+provider+model+prompt_version+config_version+input hash
  cost/
    cost_engine.py               Decimal-safe cost calculation
    budget_engine.py              Platform/org/feature/user budgets, threshold-based degradation ladder
  telemetry/
    events.py                    Usage/cost/performance/quality events, correlated by request_id
    metrics.py                    Percentile latency stats (refuses to fake a P99 from 3 samples)
    anomaly.py                     Real z-score anomaly detection + labeled cost forecasting
  request/
    context.py                   Request identity
    lifecycle.py                   Enforced state machine (no ambiguous stuck states)
  validation/schema.py        AI output: schema validation -> semantic validation -> app
  security/redaction.py       Strips secret-shaped substrings before anything is logged
  db/repository.py            Async Postgres access, RLS-aware (tenant context per request)
  api.py                       FastAPI app — POST /v1/ai/execute
  admin_api.py                  FastAPI admin router — /v1/admin/* (bearer-token gated, audited)
  deps.py                       Shared gateway-instance wiring for api.py + admin_api.py

db/migrations/
  0001_init.sql              ai_requests, *_events, model registry, pricing, policies, budgets, alerts, audit log
  0002_rls.sql                 Row-Level Security — tenant isolation, verified live (see REPORT.md)

tests/            111 tests. Unit (no external deps) + integration (real Postgres, real Redis) + API (TestClient)
examples/legacy_migration_example.py   Before/after pattern for migrating an existing direct-provider call site
loadtest/locustfile.py                  Starting point for load testing a real deployment (not run here)
```

## Wiring this into the real CodeForge repository

1. **Classify your real operations.** `policy/policy.py`'s
   `build_example_policy_registry()` is illustrative — `hint_ladder.next_hint`,
   `code_coach.explain_error`, etc. are guesses at what those features do,
   not inspected fact. Replace it with policies reviewed against your
   actual Hint Ladder / Debugging Coach / Code Review Mode / Adaptive
   Challenge Engine / Technical Reports implementations.
2. **Point `DATABASE_URL` at your real Supabase project** and run the two
   migrations. If you already have `ai_*`-prefixed tables, rename the
   prefix first.
3. **Migrate call sites incrementally**, not all at once — see
   `examples/legacy_migration_example.py` for the before/after pattern and
   `REPORT.md`'s "Migration requirements" section.
4. **Fill in real pricing** in `models/pricing.py` (or better, load it from
   `ai_pricing_entries` via `db/repository.py`) — the seeded numbers are
   placeholders.
5. **Decide on Redis vs. in-memory** for caching/rate-limiting in
   production — `deps.py` currently wires the in-memory versions by
   default; swap in `RedisAICache` / `RedisTokenBucket` once `REDIS_URL`
   is set.

## Running against live Groq/Gemini

This sandbox has no network path to `api.groq.com` or
`generativelanguage.googleapis.com` and no real API keys, so the provider
adapters were never exercised against a live endpoint — see REPORT.md.
Once you set `GROQ_API_KEY` / `GEMINI_API_KEY` in `.env`, `GroqProvider`
and `GeminiProvider` will make real calls; their request/response shapes
were built and cross-checked against current vendor documentation, but you
should run a smoke test against your real keys before trusting them in
production.
