# ACEAPT — Feature 36: Career Execution Intelligence

Turns career intelligence into one clear next action, helps the student execute it, and adapts the plan from what actually happened. Built as a standalone, production-quality Next.js app because no existing ACEAPT repository was provided to extend — see **Integrating into the real ACEAPT** below for how this is meant to merge into one.

No external service is required to run this. The AI layer (Anthropic API) is optional — leave the key blank and every feature still works from deterministic logic; add the key later for richer natural-language rationale, decomposition, and weekly narratives.

---

## Quick start

```bash
npm install
cp .env.example .env.local        # keys stay blank — fill in ANTHROPIC_API_KEY whenever you want to
npm run seed                      # creates a demo student mid-journey
npm run dev                       # http://localhost:3000
```

Sign in with the seeded demo account: **demo@aceapt.app / demo1234**

- `npm run build && npm run start` — production build (verified clean, all 28 routes).
- `npm run db:reset` — wipes the local SQLite file and reseeds.
- `npm run typecheck` — `tsc --noEmit` across the whole app.

The database is a single SQLite file at `data/aceapt.db`, created automatically on first run. No external database or infra needed.

---

## What "next gen level" meant in practice

The brief asked for a huge amount of enterprise scaffolding (cohort dashboards, trainer loops, full security/perf test suites, 19-section design docs). Rather than produce a shallow pass over all of it, this build implements the **full P0 core loop and nearly all of P1** at real depth — working code, not placeholders — and leaves P2 (institutional dashboards, calendar integration, autonomous planning) as a documented extension point, exactly as the spec's own prioritization says to (`Section 69: Do not implement P2 complexity prematurely`).

## The execution loop, as implemented

```
GOAL → PRIORITY → ACTION → EXECUTE → EVIDENCE → MEASURE → LEARN → ADAPT → NEXT ACTION
```

1. **Goal → Action Compiler** (`lib/services/actionCompiler.ts`) turns a target role into 2 milestones, a weekly objective each, and 3–5 concrete actions — via AI when a key is set, via a role-aware deterministic template otherwise. Tops up the candidate pool automatically as it runs low.
2. **Priority engine** (`lib/services/priorityEngine.ts`) is fully deterministic and explainable — bottleneck alignment, opportunity urgency, time fit, personal pace, dependency readiness. It never shows a raw score to the student (spec section 9); it surfaces the *reasons* that won, either phrased by AI or by a deterministic phrase table.
3. **Session planner** (`lib/services/sessionPlanner.ts`) builds phase timelines per action type and implements "I only have 20 minutes" (condenses or swaps) and "I have 2 hours" (packs a sequence) as one unified, explainable flow.
4. **Evidence service** (`lib/services/evidenceService.ts`) distinguishes self-reported from measured completion, computes "did it work" by comparing against the capability's *other* prior results (not itself — see note below), and adapts difficulty up/down.
5. **Blocker system** (`lib/services/blockerService.ts`) either spawns a small unblocking action (gating the original via the same parent/child mechanism used for dependency intelligence) or defers, depending on the reason — never both, never a guilt-toned message.
6. **Plan health / friction / momentum / weekly review** are qualitative by design (`ON_TRACK`, `NEEDS_ADJUSTMENT`, …), never a fake percentage or streak counter.

A real bug was caught and fixed during testing: an action already marked self-reported-complete would, on receiving its first *measured* evidence, briefly compare that score against itself (since it already counted as "completed" for its capability) and report `NO_CHANGE` instead of the correct `INSUFFICIENT_DATA`. Fixed in `evidenceService.ts` by excluding the action's own record from its capability's prior-score history — verified via a live HTTP re-test after the fix.

## AI usage and graceful degradation

`lib/ai/client.ts` wraps the Anthropic Messages API (`ANTHROPIC_API_KEY`, model set via `ANTHROPIC_MODEL`, defaults to `claude-sonnet-5`). Every call:
- Has a 15s timeout and a single retry, and **returns `null` rather than throwing** on any failure.
- Is only ever given real data already in the database and is explicitly instructed never to invent activity, scores, deadlines, or feedback (spec section 56) — see the shared trust-rule preamble in `lib/ai/prompts.ts`.
- Has a deterministic fallback in the calling service, so the answer is always produced either way; the UI never surfaces an "AI unavailable" error to the student.

This was tested with no key set at all (the default `.env.example` state) — the full loop, including goal decomposition, rationale, blocker handling, and weekly narrative, works correctly end to end on the deterministic paths alone.

## Data model

SQLite (`better-sqlite3`), schema in `src/lib/db/schema.sql`: `users`, `career_goals`, `capability_areas`, `milestones`, `weekly_objectives`, `opportunities`, `commitments`, `action_items`, `execution_sessions`, `action_evidence`, `action_outcomes`, `execution_blockers`, `plan_adjustments`, `execution_events` (the audit-log / "career execution memory"), `weekly_review_cache`, `execution_preferences` (the personal pace model). Every table is scoped by `user_id`; every repository query filters by it server-side — the frontend never supplies an id that grants access.

## Auth and security

Email/password (bcrypt) issuing an httpOnly, `SameSite=Lax` JWT cookie. Every `/api/career/*` route calls `requireUserId(request)` before touching the database — there is no path from a client-supplied id to another student's data. `JWT_SECRET` is blank by default; a clearly-logged insecure dev default is used locally, with a console warning in production so it can't go unnoticed.

## API reference

```
POST /api/auth/register            { email, password, name }
POST /api/auth/login               { email, password }
GET  /api/auth/me
POST /api/auth/logout

GET  /api/career/goal
POST /api/career/goal              { title, targetRole }        → runs the compiler

GET  /api/career/execution/today                                → primary + supporting + momentum + time budget + opportunities + health
GET  /api/career/execution/plan                                 → full live plan (milestones, objectives, queued/in-progress/completed)
GET  /api/career/execution/time-budget
POST /api/career/execution/time-budget      { availableMinutes }
POST /api/career/execution/time-available   { minutes }         → "I only have N minutes" / "I have N hours"
GET  /api/career/execution/health                                → plan health + friction
GET  /api/career/execution/review                                → weekly review + narrative
GET  /api/career/execution/changes                                → "what changed"
GET  /api/career/execution/graph                                  → career action graph (nodes/edges)

POST /api/career/execution/actions/:id/start     { minutes? }
POST /api/career/execution/actions/:id/complete  { actualMinutes? }
POST /api/career/execution/actions/:id/defer     { reasonCode }
POST /api/career/execution/actions/:id/block     { reasonCode, reasonNote? }
POST /api/career/execution/actions/:id/evidence  { evidenceQuality, scoreValue?, resultSummary?, notes? }

GET  /api/career/opportunities
POST /api/career/opportunities     { title, organization?, eventDate?, opportunityType }
GET  /api/career/commitments
POST /api/career/commitments       { title, commitmentType, eventDate, loadLevel? }
```

## Screens

All 12 from the spec are implemented and wired to real data: **Today** (`/today`, the command center — the primary action visually dominates, per section 7), **Live Career Plan** (`/plan`), **Career Time Budget** (`/time-budget`), **Action Session** (`/session/[actionId]` — the one deliberate dark "focus mode" screen, see design note below), **Action Result** (`/result/[actionId]`), **I'm Blocked** (`/blocked/[actionId]`), **What Changed** (`/changed`), **Weekly Review** (`/review`), **Plan Health** (`/health`), **Career Action Graph** (`/graph`, hand-laid-out SVG, no layout library), **Upcoming Opportunity Preparation** (`/opportunities`). "Your Next Move" (screen 2) is the hero of Today rather than a separate route — the spec's own examples show them as the same content, and splitting them would have meant two screens showing the same card.

**Design.** Deliberately not the generic "AI app" look: a cool paper/steel palette (not cream+terracotta) with a single brass "signal" accent used only for the primary action and active states, IBM Plex Sans/Mono + Bricolage Grotesque (self-hosted via `@fontsource`, so the production build has zero external font requests), and mono tabular numerals for every piece of time/count data — the one deliberate structural motif, since this is fundamentally an app about time and evidence. The Session screen is the one screen that inverts to a dark instrument panel, because it's the one screen meant for uninterrupted focus.

## Not built (by design, not oversight)

- **TPO / cohort dashboards, trainer loop** (spec sections 61–62): explicitly P2 ("do not implement prematurely"). The data model already carries `institution_id` on `users` so this can be added later without a schema migration of existing tables.
- **Chat-first copilot UI**: the spec explicitly says not to build one (section 48). The "what should I work on right now" capability is the `time-available` endpoint + the Today screen, not a chat window.
- **Commitments (exam/personal events)** are captured (model + API) but not yet factored into automatic reprioritization or the deadline-collision compressed-plan generator (sections 33–34) — a clean, isolated next step once real academic-calendar integration exists.
- **Calendar integration, autonomous planning** (P2, section 69).

## Integrating into the real ACEAPT

This was built greenfield because no existing codebase was provided — per the reuse-first principle (section 71), here is what should happen on integration rather than doing it speculatively now:
- Replace `lib/db/repoUsers.ts` and `lib/auth.ts` with calls into ACEAPT's real user/auth system; every other repository function only depends on a `userId` string, so nothing else needs to change.
- `capability_areas` and `opportunities` are Feature 36's local, compatible stand-ins for what Features 35 and 33 would produce. Point `getCurrentBottleneck` / `listUpcomingOpportunities` at the real Feature 35/33 tables (or sync into these ones) instead of seeding them locally.
- Everything under `lib/services/*` is framework-agnostic business logic with no Next.js-specific code in it — it can be lifted into a different API layer directly if ACEAPT isn't Next.js.
