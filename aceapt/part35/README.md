# ACEAPT — Feature 35: Career Conversion & Failure-Recovery Intelligence

A standalone Next.js implementation of the P0 scope from the Feature 35 brief: a
closed loop of **outcome → evidence → pattern → bottleneck → recovery →
reassessment → updated trajectory**, built so a rejection becomes the next
piece of intelligence instead of a dead end.

No existing ACEAPT codebase was supplied with the brief, so this is a fresh,
self-contained build rather than an extension of anything — see
["Integration points"](#integration-points) below for where it is designed to
be wired into the real product.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional — see "AI configuration" below
npm run seed                 # optional — loads the demo scenario from Section 58
npm run dev
```

Open `http://localhost:3000`. It redirects to `/career`.

The app is fully usable with **zero configuration** — every AI-narrated piece
of copy has a deterministic fallback, so an empty `ANTHROPIC_API_KEY` never
breaks anything, it just means the prose is template-based instead of
model-generated (see "AI configuration").

## AI configuration

Nothing is hardcoded. Copy `.env.example` to `.env.local` and set:

- `ANTHROPIC_API_KEY` — leave blank to run on deterministic copy only.
- `AI_MODEL` — defaults to `claude-sonnet-5` if unset. For high volume, cost-sensitive
  usage, `claude-haiku-4-5-20251001` is a reasonable swap.

**Nothing trust-critical depends on the AI.** The "What We Know" / "What We
Don't Know" lists, evidence tags, pattern strength, bottleneck detection, and
recovery action mapping are all computed by deterministic code in
`src/lib/engines/*`. The AI (`src/lib/ai/*`) only ever does two things, both
constrained to facts the deterministic layer already established:

1. Turns those facts into a short, calmer paragraph of prose.
2. Classifies raw recruiter-feedback text into one of the twelve failure
   categories — or returns `null` rather than guess.

If the AI is unreachable, unconfigured, or returns something that fails
schema validation, every caller has a template-based fallback ready — see
`buildFallbackSummary` / `buildFallbackRationale`. The product never shows a
broken page because a model call failed (Section 57).

## What's built (P0)

| Brief section | Where |
|---|---|
| 1. Outcome recording | `POST /api/career/outcomes`, `/career/outcomes/new` |
| 2. Stage tracking | `application_stages` per opportunity, ordered + custom label |
| 3. Conversion funnel | `lib/engines/funnel.ts`, `/career/funnel` |
| 4. Evidence collection | `outcome_evidence`, evidence tags everywhere |
| 5. Outcome analysis | `lib/ai/outcomeAnalysis.ts` |
| 6. Known vs unknown | "What We Know" / "What We Don't Know" on `/career/outcomes/[id]` |
| 7. Bottleneck identification | `computeFunnelFromEntries` bottleneck detection |
| 8. Recovery recommendation | `lib/engines/recovery.ts` (1 primary + ≤2 supporting, per category) |
| 9. Recovery status | `recommended → started → completed`, `/career/recovery/[id]` |
| 10. Updated trajectory | `trajectory_notes`, written on plan-created / completed / reassessed |

Plus two cheap P1 items that the data model already supports for free:

- **Same-mistake detector** (Section 18) — flags a repeated, unhelped
  recommendation on the recovery plan page.
- **Career Journey timeline** (Section 21) — `/career/journey`, built by
  chronologically rendering real recorded events, nothing synthesized.

## What's intentionally not built

Per the brief's own P1/P2 ladder (Sections 43–44: *"do not prematurely
implement P2 complexity"*), the following are out of scope here, not
accidentally missing:

- **Success pattern engine, What-Changed comparison, Conversion Profile**
  (Sections 19/20/22) — these need real usage history across many students to
  be trustworthy; building them against a single demo student would mean
  either faking confidence or shipping something that always says "not
  enough data," neither of which is worth the surface area yet.
- **TPO/institutional dashboards, trainer loop** (Sections 28–29) — a
  different persona and permission model entirely; belongs in its own pass
  once the student-facing loop has real data flowing through it.
- **Feature 33/34 integration** (opportunity strategy feedback, trajectory
  intelligence) — those features don't exist yet either. `trajectory_notes`
  is the seam Feature 34 would read from.

## Architecture

```
src/
  app/
    career/…              server-rendered pages (App Router)
    api/career/…           the same operations as a clean REST surface
  components/
    ui/                     Card, Button, Tags (the evidence-tag system), EmptyState
    career/                 FunnelChart
    nav/                    AppShell
  lib/
    types.ts                domain types — the contract every layer shares
    constants.ts             stage labels, failure-category labels, controllability map
    db/
      schema.sql             documented target relational schema (see below)
      store.ts                low-level JSON file persistence
      repository.ts           the ONLY module anything else talks to for data
    engines/
      funnel.ts               conversion funnel + bottleneck (pure + DB wrapper)
      pattern.ts               rejection pattern detection (pure + DB wrapper)
      recovery.ts               category -> recovery action mapping
      sameMistake.ts            repeated-ineffective-recommendation detector
    ai/
      client.ts                Anthropic wrapper, never throws
      outcomeAnalysis.ts        deterministic analysis + AI narrative + classification
    auth.ts                   integration point (see below)
    validation.ts              zod schemas for every mutating route
tests/
  engines.test.ts             unit tests for the pure engine functions
scripts/
  seed.ts                    dev-only fixture data (Section 58's demo scenario)
```

Server Components call the repository/engine layer directly (no HTTP
round-trip to its own API); the `/api/career/*` routes expose the same
operations over HTTP for anything else that needs them (mobile client,
future TPO tooling, etc.) and are the ones documented against Section 55's
API shape.

## Integration points

Three places are deliberately built as swappable seams rather than as if a
real ACEAPT backend existed:

1. **Database** — `src/lib/db/store.ts` is a local JSON file. Every other
   module only imports from `src/lib/db/repository.ts`, so swapping storage
   is contained to one file plus the intended relational shape documented in
   `src/lib/db/schema.sql`. The JSON store is dev/local-only — it will not
   survive a serverless/multi-instance deploy.
2. **Auth** — `src/lib/auth.ts`'s `getCurrentStudent()` resolves a single
   pinned demo student instead of a real session (`DEV_STUDENT_ID` in
   `.env.local`). Every API route already calls `assertOwnership()` on every
   resource it touches, so once this function reads a real session instead,
   the authorization behavior underneath does not need to change.
3. **Design system** — no existing ACEAPT design tokens were supplied, so
   `tailwind.config.ts` defines a small, deliberate one (see below) rather
   than inventing something disconnected from a real system later.

## Design notes

The visual language is an "evidence ledger": paper/ink neutrals, a single
measured pine-green for confirmed signal and a clay ochre reserved for
"unknown / needs investigation" — deliberately *not* a red-alarm color, since
a rejection is information, not a failure grade (Section 24). The recurring
evidence tags (`Direct Evidence` / `Repeated Signal` / `Possible Contributor`
/ `Unknown`) are the one consistent device tying every screen back to the
brief's central rule: nothing on screen claims more certainty than the
evidence actually supports.

Fonts are a system stack (serif display / sans body / mono for data and
tags) rather than a webfont import, so the app has zero external network
dependency at build or runtime — swap in `next/font/google` freely if you'd
rather.

## Testing

```bash
npm test
```

Covers the deterministic engines directly (funnel math, pattern-strength
thresholds, bottleneck detection, the same-mistake detector, and that every
recovery template stays within "1 primary + ≤2 supporting"). API routes and
UI are exercised manually via `npm run dev` + `npm run seed`; wiring up
Playwright for the flows in Section 56 is a reasonable next step once this
sits on a real database.

## Notes on scope decisions

- **Stage model**: a student records the *furthest* stage reached and what
  happened there; every earlier canonical stage is filled in as cleared
  automatically. This keeps the recording form to one honest sentence
  ("I reached Technical Round and was not selected") instead of asking
  someone to fill in a multi-stage form by hand.
- **Recovery plans are always creatable for a rejection**, even with no
  identifiable category — in that case the category is `EXTERNAL_UNKNOWN`
  and the primary action is explicitly "gather more evidence," never a
  fabricated diagnosis (Section 25: unknown is a valid result).
- **Withdrawals and offers don't get failure-diagnosed** — there is nothing
  to diagnose when nothing went wrong.
