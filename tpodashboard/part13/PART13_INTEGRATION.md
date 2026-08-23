# Part 13 — Proactive Placement Intelligence: Integration Guide

## What this is

A standalone reference implementation of the Continuous Placement Radar
described in the Part 13 master prompt: signal registry, priority engine,
deduplication, escalation, anomaly/small-sample safeguards, clustering,
role-based delivery, briefings, and reference API + UI for the TPO,
Student, and Management attention centers.

It was built in an isolated sandbox with **no access to your actual
repository, database, event bus, or Parts 1-12 code, and no network
access**. Everything that could be built and verified for real *was* —
see "What I verified for real" below. Everything that genuinely needs
your live stack is left as a clearly-typed interface or a loudly-stubbed
function, never a fabricated implementation. That split is the point of
this document.

## Architecture

```
Real event OR scheduled tick
        |
        v
DetectorRegistry.getForEvent() / .all()   <-- modules/proactive/eventRouter.ts
        |                                      only relevant detectors run (section 67)
        v
Detector.runScheduled(ctx)                <-- modules/proactive/detectors/*.ts
        |                                      reads via DataSourcePort — real data in, real data out
        v
SignalCandidate[]
        |
        v
commitCandidates()                        <-- modules/proactive/detectorFramework.ts
        |
        v
upsertSignal()                            <-- services/dedup/deduplicationEngine.ts
   - looks up existing OPEN signal by dedup key
   - computes priority via calculatePriority()   <-- services/priority/priorityEngine.ts
   - creates OR merges in place (section 15)
        |
        v
ProactiveSignal (persisted)               <-- services/signals/repository.ts
        |
        +--> escalationEngine.runEscalationSweep()   (scheduled — time-based severity bump)
        +--> signalClustering.clusterSignals()       (groups correlated open signals)
        +--> briefingGenerator.generate*()           (pure aggregation for daily/EOD/weekly/mgmt)
        |
        v
audience.renderForAudience() / filterSignalsForAudience()   <-- role-based filtering, ALWAYS applied
        |
        v
API routes (api/proactive/**) --> UI (ui/**)
        |
        v
NotificationIntent --> publishNotificationIntent() --> Part 9 (stub — wire this)
```

Detectors never touch the repository directly, and never compute severity
or priority themselves — `commitCandidates()` is the only write path, and
`calculatePriority()` is the only priority math, anywhere in the module.
That's deliberate: it's what makes section 65's rule ("Database/events ->
Signal engine -> Verified signal -> AI explanation," never "LLM
imagination -> Alert") structurally true rather than just a comment.

## How to wire this into your real repo

1. **Copy the folders in as-is.** They already match the ownership
   boundaries your own spec defines in section 84
   (`modules/proactive/**`, `services/**`, `api/proactive/**`,
   `tests/proactive/**`, `prisma/**`).
2. **Implement `DataSourcePort`** (`modules/proactive/detectorFramework.ts`)
   against your real Part 1-12 queries. This is the one piece that
   genuinely needs your database — nobody outside your repo can write it
   for real. Every detector in this bundle only calls methods on this
   interface, so once it's implemented, all 13 shipped detectors work
   against real data with no further changes.
3. **Replace `api/proactive/_shared.ts`**: `requireRole` (wire to your
   real auth/session) and `getRepository` (swap `InMemorySignalRepository`
   for a Prisma-backed adapter — sketch included at the bottom of
   `services/signals/repository.ts`).
4. **Merge `prisma/part13_proactive_signals.prisma`** into your schema,
   adjust `@map`s to your naming convention, run your own migration.
5. **Register detectors and run them on a schedule**:
   ```ts
   const registry = new DetectorRegistry();
   registry.register(applicationEligibleNotApplied);
   registry.register(interviewResultPending);
   registry.register(offerDeadlineApproaching);
   registry.register(joiningConfirmationMissing);
   registry.register(trainingLowAttendance);
   registry.register(readinessSignificantDecline);
   registry.register(companyRelationshipStale);
   registry.register(dataQualityUnverifiedOutcome);
   registry.register(managementPlacementTargetGap);
   registry.register(applicationRateImproved);
   registry.register(readinessMilestoneReached);
   registry.register(trainingCompletionImproved);
   // then, per institution/season, on a timer:
   await runScheduledDetectors(registry, ctx);
   ```
6. **Wire `jobs/scheduledJobs.ts`'s three jobs** (`runEscalationSweepJob`,
   `runEvidenceFreshnessSweepJob`, `runDailyBriefingJob` +
   `runEndOfDayBriefingJob` + `runWeeklyIntelligenceJob`) into whatever job
   runner Parts 1-12 already use.
7. **Implement `publishNotificationIntent`** to call your real Part 9
   enqueue function. This is the *only* place a signal leaves this module.
8. **Part 12 (AI):** feed it `ProactiveSignal` objects as-is and let it
   narrate/explain — never let it compute severity, priority, or evidence
   itself (section 65). The registry + priorityEngine + evidence are the
   single source of truth Part 12 should read from, not reason about.
9. **Part 14 (actions):** consume `signal.recommendedAction`. Every one
   shipped in this bundle already has `requiresConfirmation: true`
   (section 59/60) — Part 14 owns actually executing it, Part 13 never
   does.
10. **Part 15 (forecasting):** `services/anomaly/anomalyEngine.ts`'s
    `detectTrend` / `compareToBaseline` are generic enough to reuse
    directly as forecasting inputs.

## Extending the 13 remaining registered-but-not-implemented signal types

Every signal type in `SIGNAL_REGISTRY` — implemented or not — already has
real severity, audience, cooldown, escalation, and freshness policy. To
add a detector for, say, `INTERVENTION_OVERDUE`:

1. Add the `DataSourcePort` method you need (e.g. `getOverdueInterventions`).
2. Write a `Detector` object in the matching `modules/proactive/detectors/*.ts`
   file (or a new one) that returns `SignalCandidate[]` from real data.
3. Register it. That's it — dedup, priority, escalation, audience
   filtering, and the attention-center UI all pick it up automatically,
   because they all key off the registry and the `ProactiveSignal` shape,
   never off a hardcoded detector list.

## Truth table (section 88's own format, applied honestly)

| Area | Status | Notes |
|---|---|---|
| Signal registry, all 15 categories | **IMPLEMENTED** | 26 signal types registered with full policy metadata (severity, audiences, cooldown, escalation ladder, freshness budget) |
| Detectors | **PARTIALLY IMPLEMENTED** | 13 of 26 registered types have real, tested detector logic; the other 13 are registered extension points — see above |
| Priority engine | **IMPLEMENTED** | Deterministic; tested against the spec's own two worked examples from section 12 |
| Deduplication | **IMPLEMENTED** | Tested — second detection of the same problem updates in place, never fans out |
| Escalation | **IMPLEMENTED** | Tested — time-based ladder per signal type, never touches snoozed/resolved signals |
| Cooldown | **PARTIALLY IMPLEMENTED** | Policy defined per signal type in the registry; the notification-throttling side (as opposed to the signal-record dedup, which *is* fully implemented) needs wiring into however Part 9 tracks "last notified" |
| Evidence + freshness | **IMPLEMENTED** | Every candidate carries `evidenceMeta.dataAsOf`/`isStale`; `runEvidenceFreshnessSweepJob` re-checks it over time |
| Small-sample / anomaly safeguards | **IMPLEMENTED** | Tested |
| Trend detection | **IMPLEMENTED** | Tested — single-point swings return `INSUFFICIENT_DATA`, not a trend |
| Signal clustering | **IMPLEMENTED** | Tested — correlation-based grouping only, never asserts causation |
| Role-based delivery | **IMPLEMENTED** | One function (`audience.ts`) enforced everywhere — API routes, briefings, UI |
| TPO Attention Center | **IMPLEMENTED (UI reference)** | Needs wiring to the real API route + your auth; could not be fully typechecked in this sandbox (see below) |
| Student Attention Center | **IMPLEMENTED (UI reference)** | Same caveat |
| Management Intelligence panel | **IMPLEMENTED (UI reference)** | Same caveat |
| Positive intelligence | **IMPLEMENTED** | 3 detectors (application rate, readiness milestones, training completion), all trend + baseline backed |
| Briefings (daily/EOD/weekly/management) | **IMPLEMENTED** | Pure aggregation over real signals, no fabricated content path |
| `NotificationIntent` -> Part 9 | **CONTRACT DEFINED, NOT WIRED** | `publishNotificationIntent` is a stub — the one real integration point |
| Scheduled jobs | **FUNCTIONS IMPLEMENTED, SCHEDULER NOT WIRED** | No cron/queue infrastructure exists in this sandbox |
| `DataSourcePort` adapters | **INTERFACE DEFINED, NOT IMPLEMENTED** | Needs your real DB/Parts 1-12 code — this is the one piece nobody outside your repo can write |
| Auth | **STUB — THROWS BY DESIGN** | Forces you to wire real auth before these routes can run; won't silently pass as "working" |
| Prisma schema | **REFERENCE PROVIDED, NOT MIGRATED** | No live DB in this sandbox |
| Repository reconnaissance (section 7) | **NOT DONE** | No access to your actual repo — nothing here claims to have inspected code that was never available |
| Hostile review / red-team / load testing against your real stack (sections 75-79) | **NOT DONE HERE** | Needs your repo, DB, event bus, and real data volumes |

## What I verified for real, in this sandbox

- **Typecheck:** every file under `services/`, `modules/`, `jobs/`, and
  `tests/` passes `tsc --noEmit` cleanly (TypeScript 6.0.3, strict mode).
- **Tests:** `tests/proactive/*.test.ts` — 23 tests, all passing, run for
  real via `tsx --test` (Node's built-in test runner). They cover:
  - the spec's own two priority worked examples from section 12, encoded
    as literal assertions (2 days/3 students -> MEDIUM; 4 hours/400
    students -> CRITICAL);
  - deduplication (repeat detection updates in place; different entities
    don't merge; a resolved signal doesn't reabsorb the next detection;
    a dedup refresh never downgrades severity an escalation already
    raised);
  - escalation (overdue signals jump straight to the right rung; fresh
    signals don't escalate; snoozed signals are skipped);
  - small-sample and trend safeguards (insufficient samples are flagged,
    not alarmed; single-point swings aren't trends; sustained moves are);
  - clustering (3+ related signals across 2+ categories in the same
    department cluster; 2 signals in one category, or signals spread
    across departments, don't).
- **API routes** (`api/proactive/**/*.ts`) have no structural TypeScript
  errors beyond the expected "Next.js isn't installed in this sandbox"
  noise (`next/server` can't be resolved offline) — every other line
  typechecks clean.
- **UI components** (`ui/*.tsx`) could **not** be fully typechecked: this
  sandbox has no network access to install `@types/react` or Next.js, and
  neither ships its own type declarations in the base image here. The
  errors that do appear when checking them are 100% attributable to that
  one missing package (`JSX.IntrinsicElements` unresolved, cascading into
  downstream implicit-`any`) — I reviewed them manually for structural
  correctness (balanced JSX, correct prop shapes, valid syntax) rather
  than claiming a clean typecheck I couldn't actually produce.

## What I deliberately did not do, and why

This sandbox has no access to your actual repository, database, event
bus, or Parts 1-12 code, and no network access. So, unlike what section 7
of the master prompt asks for:

- No "Phase 0 reconnaissance" of your real repo happened, and nothing
  above claims otherwise.
- Detectors are written against a documented `DataSourcePort` interface,
  not real queries — I did not guess at or fabricate what your Part 4
  application data actually looks like.
- No Postgres instance was started, no real migration ran, no load test
  against thousands of students happened, and your real lint/test/build
  pipeline was never run — all of that needs your actual stack.
- The hostile-review, red-team, and research-upgrade passes (sections
  75-79) are a *process* the spec asks for against a live, integrated
  system with real data — running that process against synthetic data in
  an empty sandbox would only produce synthetic findings, which felt
  worse than being direct about the limitation. The safeguards those
  passes are meant to produce (dedup, small-sample guards, snoozed-signal
  exclusion, audience isolation, evidence freshness) are built in and
  tested; the adversarial review of your specific real deployment is
  still a step worth doing once this is wired up.
