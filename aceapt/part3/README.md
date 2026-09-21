# ACEAPT — Feature 3: Adaptive Skill Intelligence Engine

A real, runnable reference implementation. No existing ACEAPT repo was
available to integrate against, so this is a fresh, stack-agnostic-by-design
build: Node/TypeScript backend, React/TypeScript frontend, zero external
services required. Every number you see running it is computed by the actual
engine from seeded evidence — nothing on screen is hardcoded demo text.

## Quickstart

```bash
npm install
npm run seed   # loads the demo scenario (see below)
npm run dev    # builds the frontend, then starts the server
```

Open **http://localhost:4000**. Run `npm test` to run the test suite
(31 tests, no server needed to start it yourself — the auth tests spin one
up on a random port and tear it down).

## The demo scenario

One seeded student (`demo-student-1`) with:

- **Feature 1** (self-perception): Quantitative = strong, Logical = weak.
- **Feature 2** (evidence): 39 scored attempts across 10 skills, deliberately
  varied — some skills well-evidenced and strong, some well-evidenced and
  weak, one with contradictory session-to-session results, one accurate-but-
  slow, one with a single data point, one with none at all.

Loading the page computes, live, from that evidence:

- **Percentage Fundamentals** and **Ratio**: strong, well-evidenced, no gap.
- **Percentage Application**: an application gap — the foundation is there,
  application isn't, and it's flagged as the #1 recommended focus because it
  also feeds Profit & Loss downstream.
- **Profit & Loss**: also gapped, and the engine surfaces a prerequisite
  insight connecting it back to Percentage Application.
- **Time & Work**: contradictory evidence (perfect one session, zero the
  next) — flagged `INCONSISTENT_EVIDENCE`, not averaged away.
- **Circular Seating**: accurate but consistently slow — a speed gap, not an
  accuracy gap.
- **Logical Reasoning**: strong and well-evidenced, despite being self-rated
  "weak" — surfaced as a hidden strength. This is the same scenario the
  original spec's own Phase 40 demo describes.
- **Contextual Vocabulary**: one data point — capped, not scored.
- **Data Sufficiency**: zero evidence — Not Assessed, not zero.

## Architecture

```
src/
  domain/     Types + the skill taxonomy and relationship graph (seed data)
  store/      In-memory repository with JSON snapshot persistence
  engine/     capability.ts, gaps.ts, priority.ts, perception.ts, trust.ts,
              and profile.ts, which orchestrates all of them into a
              StudentSkillProfile
  ai/         Structured output contract (zod), the deterministic template
              provider, and the validate-or-fall-back narrative service
  api/        Express routes, session-derived auth, server wiring
  seed.ts     The demo scenario above
test/         31 tests across every engine module plus live authorization
              and idempotency tests against a real running server
web/          React/TypeScript frontend (esbuild-bundled, no dev server
              needed — it's served as static files by the same Express app)
```

Full design rationale (evidence-strength gating table, gap-type trigger
table, the priority formula, the self-perception matrix, the AI contract) is
in the conversation this was built from — this README covers the
as-built specifics; that covers the as-designed reasoning.

## What's real vs. stubbed

Everything **except one thing** is real: the taxonomy, the relationship
graph, evidence ingestion, the capability/evidence-strength gating, gap
detection, prerequisite reasoning, the priority engine, self-perception
comparison, contradiction detection, freshness decay, historical progress
events, the AI output contract and validator, authorization, and the UI are
all live code, covered by tests, exercised by the demo.

The one deliberate stub: **no external LLM is called.** `TemplateProvider`
(`src/ai/provider.ts`) is a deterministic, slot-filled provider that reads
the same `StudentSkillState` fields a real model would and is the
**production-safe default**, not a placeholder — Phase 21 of the original
spec asks for exactly this ("the student must never receive 'AI failed'").
To wire in a real model:

```typescript
class ClaudeProvider implements AIProvider {
  name = 'claude';
  async generateInsight(input: NarrativeInput) {
    // call your LLM, return the raw (unvalidated) JSON
  }
}
// pass `new ClaudeProvider()` instead of `new TemplateProvider()` in routes.ts
```

`generateNarrative()` already validates whatever comes back against the same
zod schema, checks the cited evidence actually belongs to the student, and
falls back to `TemplateProvider` on any failure — that machinery doesn't
change.

## Known limitations (found by actually running it, not guessed)

- **Foundation/application/transfer is scored *within* a skill's own
  tagged evidence, not across skills.** A skill that is application-only by
  taxonomy (most are) will always show empty foundation evidence for
  itself — that's expected, and gap detection accounts for it (it walks
  foundation → application → transfer and flags the first weak point rather
  than requiring the prior level to be "solid"). But it means "foundation"
  here answers "is this skill's own easier evidence solid?", not "is the
  prerequisite skill solid?" — that cross-skill question is what the
  prerequisite/relationship engine answers instead. Worth confirming this
  split matches how Feature 2 actually tags question difficulty before
  wiring this to real data.
- **The demo relationship graph is small (5 edges)**, so downstream impact
  is close to binary in this build. The mechanism scales with a richer
  graph; the numbers just won't look as graded until the real taxonomy is
  loaded.
- **Persistence is a JSON file, not a database** — intentional for a
  prototype (see Phase 42, "don't overengineer"), but every method on
  `Repository` maps 1:1 to an indexed query a real table would need, so
  swapping it is a matter of re-implementing that interface, not redesigning
  the engine layer above it.
- **Auth is a header, not a session.** `demoSessionAuth` is explicitly
  commented as a stand-in — swap it for whatever already verifies Feature
  1/2's sessions.
- **No retention-check or transfer-evidence UI flow yet** — the data model
  supports `source: 'retest'` and the `VERIFIED` evidence tier, but nothing
  in this build schedules a retest. That's intentionally left as the
  extension point Phase 17/18 describe, not built out.

## What turns this into the real Feature 3

1. Your actual repo — Feature 1 and Feature 2's code and schema, so entity
   names and folder structure match what's already there.
2. Feature 1's real self-perception output shape.
3. Feature 2's real evidence shape — critically, whether questions are
   already tagged foundation/application/transfer, and what the difficulty
   scale and timing capture actually look like.
4. Whatever AI provider (if any) Feature 1/2 already call.
5. The real design system/component library, so the UI matches ACEAPT
   rather than this build's own visual language.
