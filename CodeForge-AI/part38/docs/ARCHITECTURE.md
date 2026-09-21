# Feature 38 — Technical Mastery Report — Architecture

## Why this document starts with a caveat

This was built with no CodeForge repository attached to the conversation —
no uploaded code, no connected repo. The master prompt's own contingency
plan (§87) is followed here: *"If [a referenced subsystem] does not exist:
inspect alternatives, determine the actual architecture, implement only
what is necessary, document the decision."* This document **is** that
decision record. Read it before wiring this into the real repo.

## The one idea everything else follows from

Feature 38 is a **reporting layer**, not an intelligence engine (brief
§2). Every number, level, and recommendation in a report has to come from
somewhere that already decided it. To make that a property of the code
rather than a promise in a comment, every one of those "somewhere"s is an
interface — a *port* — in `server/src/ports/index.ts`:

```
IdentityPort            — student/org lookup, access authorization
DataVersionPort         — "what's the current source data version"
MasterySystemPort       — overall mastery, skill mastery map
RoleReadinessPort       — readiness per target role
SkillGapPort            — role skill gaps
GrowthTrackingPort      — growth timeline + insights
NextBestActionPort      — recommended actions
CodingEvidencePort      — coding / debugging / reasoning evidence
ProjectEvidencePort     — project evidence
InterviewEvidencePort   — technical interview evidence
```

`server/src/adapters/fixture-adapters.ts` is the **only** file that
implements them, by reading `fixture_*` tables that stand in for
CodeForge's real Skill Signal Engine / Mastery Level System / Role
Readiness Engine / etc. Every method is a read — none of them compute a
level, a gap, or a readiness value; they return what's already in the
fixture table, exactly the way a real adapter would return what's already
in CodeForge's real services.

**Integrating into the real repo is: write one new file.** Implement the
same ten interfaces against the real services (probably by calling their
existing internal APIs), wire it into `src/http/routes-reports.ts` and
`src/jobs/worker-entry.ts` in place of `buildFixtureIntelligencePorts()`,
delete the `fixture_*` tables from `db/schema.sql`. Nothing in
`services/`, `domain/`, or `http/` needs to change, because none of it
knows or cares that the ports are fixture-backed.

## Pipeline

```
Collect (report-data-collector.ts)   — fan out to every port, in parallel where possible
   ↓
Assemble (report-assembler.ts)       — map into the validated DTO shape; the ONLY synthesis
   ↓                                    allowed here is presentational (see below)
Narrative (narrative/*.ts)           — AI attempt → fact-guardrail → deterministic fallback
   ↓
Validate (report-validator.ts)       — zod schema + cross-referential checks
   ↓
Publish (report-repository.ts)       — COMPLETED, with the DTO persisted as the report's content
```

Every value in the final DTO is traceable to a port call. `grep`-ing
`report-assembler.ts` for anything that looks like a calculation turns up
exactly two things, both deliberate and both documented inline:

1. **Strengths/weaknesses selection.** A "strength" is a skill the Mastery
   System already rated PROFICIENT+ with MODERATE+ evidence; a "weakness"
   is a skill already present in the Skill Gap Analysis's output. Nothing
   is scored — these are labels applied to values that were already
   authoritative.
2. **`gapStatus` per skill row**, computed by checking whether that skill
   appears in the (already-fetched) gaps list — again a label, not a
   calculation.

## Report lifecycle

`server/src/domain/state-machine.ts` defines the only legal transitions
(brief §12):

```
REQUESTED → QUEUED → GENERATING → VALIDATING → COMPLETED
                 ↓         ↓
             CANCELLED   FAILED
                          ↓
                       FAILED (terminal — no silent partial artifacts)
```

Every write to a report's status goes through `assertValidTransition`
first (`report-repository.ts`'s `transitionStatus`), so an illegal jump
throws instead of corrupting state. `test/unit/state-machine.test.ts`
exercises every edge (including that terminal states have zero legal
exits).

Generation is asynchronous: the HTTP handler creates a row and returns
immediately (`QUEUED`); a worker process (`src/jobs/worker-entry.ts`)
polls for queued rows and does the actual collect/assemble/narrate/
validate work. `src/jobs/queue.ts`'s `processNext` is what the worker
calls — tests call it directly (`drainQueue`) instead of depending on
real timing.

## Freshness vs. lifecycle status — two different things

`ReportLifecycleStatus` (REQUESTED…COMPLETED) describes *this report's own
generation*. `ReportFreshnessStatus` (UP_TO_DATE / STALE / …) describes
*whether the world has moved on since this report was generated* — it's
computed live, on every read (`report-cache.ts`'s `computeFreshness`), by
comparing the report's stored `sourceDataVersion` against the *current*
value from `DataVersionPort`. A report is never mutated to mark it stale;
staleness is a property of "now," recomputed each time, so nothing ever
silently presents outdated data as current (brief §42-43).

## AI narrative — how "AI cannot override structured truth" is enforced

```
Validated DTO (minus narrative)
   ↓
buildNarrativeFacts()      — trims to the minimum needed for prose (brief §39):
   ↓                          no internal IDs, no raw evidence refs, no org data
Anthropic Messages API     — real call, server/src/services/narrative/ai-client.ts
   ↓                          (correct x-api-key / anthropic-version headers — this
   ↓                          runs in the user's own backend, not a claude.ai artifact
   ↓                          sandbox, so unlike an in-artifact call it has to send its
   ↓                          own auth)
validateNarrativeResult()  — guardrail.ts: rejects the WHOLE narrative if it states a
   ↓                          mastery/readiness level other than what's in the facts, or
   ↓                          claims a project/interview that doesn't exist
   ├─ valid ─────────────→ used, narrative.source = "ai"
   └─ invalid or the API call failed/is unconfigured
        ↓
      buildFallbackNarrative()  — built directly from the same facts by string
        ↓                         templates; valid by construction
      narrative.source = "fallback"
```

The guardrail (`test/unit/guardrail.test.ts`) is unit-tested against
*adversarial* input — a hand-written string that claims "SQL is Advanced"
when the facts say Developing — rather than hoping a live model
hallucinates on demand during a test run. It doesn't do naive "any level
word within N characters of a skill name" matching (an earlier version of
this file did, and it produced false positives whenever two skills were
mentioned near each other in one sentence — including in the fallback
template's own output). It attributes each mastery-level mention to
whichever skill mention is nearest to it and checks only that pairing.

No `ANTHROPIC_API_KEY` was provided in this session (per your instruction
to leave it blank), so only the fallback path has been exercised live
end-to-end. The AI path is implemented to the real API contract but
untested against a live response in this environment — see
`ENGINEERING_SUMMARY.md`.

## Access control

Two axes, checked in this order, always (`services/access-control.ts`):

1. **Tenant.** `report.orgId !== user.orgId` → denied, full stop, before
   anything else is even evaluated (brief §47).
2. **Relationship.** STUDENT → only their own; TRAINER → only students
   linked via `fixture_trainer_student`; TPO / INSTITUTION_ADMIN → any
   student in their org; ADMIN → **no content access**, status/audit only
   (brief §5's split between student-facing content and operational
   controls).

Every denial — wrong student, wrong org, or a report ID that doesn't
exist at all — throws the exact same `ReportAccessDeniedError`, mapped to
the same generic 403 body. There is no way to distinguish "not yours"
from "doesn't exist" from the outside, which is what prevents using the
report endpoint to enumerate valid report IDs (brief §54, §79).

## What's fixture/placeholder vs. real Feature 38 code

| Real Feature 38 code (ships as-is)                          | Placeholder (replace before production)                    |
|---------------------------------------------------------------|--------------------------------------------------------------|
| `domain/`, `services/`, `jobs/`, `http/routes-reports.ts`, `http/app.ts` | `adapters/fixture-adapters.ts` and the `fixture_*` tables |
| `report-export-pdf.ts`                                        | `http/middleware.ts`'s `requireAuth` (session verification) |
| `narrative/*` (AI call + guardrail + fallback)                 | `db/database.ts` (SQLite → the org's real Postgres/etc.)    |
| all of `web/src/components/report/*`                          | `web/src/report-theme.css` (real design tokens)              |

## Data layer note

Node's built-in `node:sqlite` (still experimental as of this Node
version) backs the reference build — chosen over Prisma specifically
because this sandbox has no network access to Prisma's engine-binary CDN,
and over `better-sqlite3` because that needs a native compile step this
sandbox also can't reliably do. `src/db/database.ts` exposes exactly three
functions (`run`/`all`/`one`) that every repository in the codebase uses;
swapping to Postgres is replacing the body of that one file, not touching
callers.
