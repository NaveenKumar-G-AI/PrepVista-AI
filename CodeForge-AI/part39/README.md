# CodeForge AI Cost & Performance Controls

A centralized AI gateway, policy engine, and operations dashboard for controlling AI cost, performance, and reliability — model routing, budgets, quotas, rate limiting, concurrency control, retries, circuit breaking, caching, and observability, all behind one execution surface.

> **Where this came from:** this was built from a standalone build spec ("Feature 39") that assumed an existing "CodeForge" codebase to integrate into. No such codebase was provided, so this ships as a complete, independent service with a clean integration seam (`AIGateway.execute()` / `POST /api/execute`) rather than being wired into application code that doesn't exist yet. See `docs/COMPLETION_REPORT.md` for the full account of what's real, what's tested, and what's out of scope.

## What's actually here

- **A working TypeScript gateway** (`src/gateway/AIGateway.ts`) implementing policy resolution, budget/quota enforcement, rate limiting, concurrency control, context management, caching, model routing, retries, circuit breaking, and fallback — all with real, passing tests, not stubs.
- **A REST API** (Express) exposing execution, analytics, model/provider/policy/budget/quota management, alerts, audit log, and emergency controls.
- **A Postgres schema** (`migrations/001_init.sql`) for production persistence, alongside in-memory implementations that let the whole system run with zero external dependencies for local dev and testing.
- **An operations dashboard** (`dashboard/index.html`) — a single self-contained static file, no build step, no external JS framework.
- **114 automated tests** across unit and integration levels, all passing (see `docs/COMPLETION_REPORT.md` for exact numbers and what each layer covers).

## Quick start

```bash
npm install
cp .env.example .env      # all secrets are blank by default — fill in what you have
npm run build
npm start                 # or: npm run dev (ts-node, no build step)
```

The server listens on `:4039` by default. Open `http://localhost:4039/dashboard/` — it connects to the gateway automatically via a local dev-auth mode (see below), no real identity provider required to explore it.

Run the tests:

```bash
npm test              # 114 tests
npm run typecheck
```

## Running with nothing configured

Every external dependency is optional and fails safe when absent:

| Missing config | What happens |
|---|---|
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | That provider reports itself `UNAVAILABLE`; routing skips it. The bundled `mock` provider is always available so the gateway is fully exercisable with zero keys. |
| `DATABASE_URL` | Falls back to in-memory repositories. Fine for one process; state doesn't survive a restart and isn't shared across instances. |
| `REDIS_URL` | Cache, rate limiter, and concurrency controller run in-memory — single-process only. |
| `JWT_SECRET` | The API accepts an `x-dev-auth: {"userId":"...","organizationId":"...","role":"..."}` header instead of a real bearer token — **only** when `NODE_ENV !== production**, checked in code, not just by convention. |
| `EMERGENCY_CONTROL_PASSPHRASE` | The kill-switch endpoint returns `503` rather than accepting a weaker authorization. |

This means you can `npm install && npm start` and immediately exercise the entire request lifecycle — routing, budgets, caching, retries, circuit breaking — against the mock provider before ever touching a real API key or database.

## Wiring in real infrastructure

1. **A real AI provider**: set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`. `src/providers/AnthropicProvider.ts` and `OpenAIProvider.ts` are complete adapters against the documented Messages / Chat Completions APIs — they have not been exercised against live traffic from this environment (no key was available while building this), so validate against your own account before depending on them in production.
2. **Postgres**: run `migrations/001_init.sql`, set `DATABASE_URL`. The application talks to storage through small repository-shaped classes (`BudgetEngine`, `PolicyEngine`, `Telemetry`, `AuditLog`, `ModelRegistry`) — a Postgres-backed implementation of each needs to be written behind the same surface. This has **not** been done in this pass; see `docs/COMPLETION_REPORT.md`.
3. **Redis**: set `REDIS_URL` once you're running more than one instance — `CacheLayer`, `RateLimiter`, and `ConcurrencyController` need Redis-backed implementations for correctness across a fleet (they're correct and race-safe within a single process today, not across processes).
4. **Real auth**: point `JWT_SECRET` (and optionally `JWT_ISSUER`) at the same signing secret your real identity provider already uses, so this gateway authenticates against the same identity rather than a parallel one.
5. **Integrating an existing app**: call `POST /api/execute` (or import `AIGateway` directly and call `.execute()` in-process) from wherever your application currently calls a model provider SDK. That's the entire integration surface by design — see "Architecture" in `docs/ARCHITECTURE.md`.

## Project layout

```
src/
  types/            shared enums & interfaces (the one source of truth for capability/task/error names)
  errors/           normalized error taxonomy + secret redaction
  config/           the only place environment variables are read
  providers/        provider-neutral adapter interface + Anthropic/OpenAI/Mock implementations
  registry/         model registry, seeded with sourced (not invented) pricing
  policy/           policy engine (Global→Org→Feature→Task) + validator
  routing/          deterministic, capability-aware model selection
  budget/           budget + quota engines (atomic reserve/settle/release)
  traffic/          rate limiter, concurrency controller
  reliability/       retry engine, circuit breaker, fallback router
  cache/            tenant/user-isolated, versioned response cache
  context/          token-budget enforcement (truncate or reject, never silently drop)
  cost/             the one place cost is computed from tokens + pricing
  telemetry/        per-request metrics, audit log, anomaly detection
  gateway/          AIGateway orchestrator + emergency controls
  api/               Express server, middleware, REST routes
migrations/          Postgres schema
dashboard/            static operations console
tests/                114 tests: unit + integration + HTTP-level
docs/                 architecture notes + the engineering completion report
```

## Notes on the pricing in `src/registry/seedModels.ts`

Pricing was looked up against provider pricing pages and cross-checked across sources on 2026-08-22 (see `pricingSource`/`pricingAsOf` per model) — it was researched, not invented, but it **will** drift. That's exactly why pricing lives in one versioned, swappable place instead of being hardcoded into cost-calculation logic: update the registry (or, in production, the `ai_model` table) and every cost figure downstream picks it up automatically, while historical records keep referencing the `pricingVersion` that was actually in effect when they were recorded.
