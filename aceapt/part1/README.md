# ACEAPT AI — Feature 1: AI Onboarding

The personalization gateway into ACEAPT. Not a registration form: a short, adaptive
conversation that turns a student's real preparation situation into structured context the
future Diagnostic Engine, Skill Intelligence, AI Tutor, and Mastery Engine can consume —
without ever confusing what the student *believes* about themselves with what's actually
*measured*.

This is a real, runnable full-stack app — not a mockup. Every screenshot-able state in it is
backed by a real database write, a real validation pass, and a real (if intentionally simple)
session mechanism. Where something genuinely isn't built yet — the diagnostic engine itself —
the app says so on screen instead of faking it.

---

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. That's it — no separate migrate/setup step. `.env` ships with a
working SQLite `DATABASE_URL` already filled in; the database file and its tables are created
automatically on first request (see `src/lib/db.ts`).

To turn on AI-generated summaries, put a real key in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Everything works with this left blank — see "AI summary + deterministic fallback" below.

```bash
npm run build   # production build (also runs TypeScript's full type check)
npm run test    # 29 unit tests over the branching engine, validation, and summary generation
```

---

## What existed before this

Nothing — this was a from-scratch build, not a change to an existing codebase. The prompt's
"inspect the existing codebase" step (section 42) doesn't apply; there was no prior
architecture, design system, or data model to respect. Every convention below (Next.js App
Router + TypeScript + Tailwind, the SQLite repository, the session mechanism) was chosen fresh
for this feature, and is documented here precisely so a real Feature 2 can be built consistently
with it.

---

## Architecture decisions

**Next.js 15 (App Router) + TypeScript, one project, front and back end together.** The
onboarding flow needs server-side persistence, validation, and an outbound API call (Anthropic)
that can't run in the browser — a single full-stack app is simpler to run and reason about than
a separate frontend/backend pair for a feature this scoped.

**better-sqlite3 instead of Prisma, and why that's not a compromise you're stuck with.**
`prisma/schema.prisma` is written and documents the intended production data model in full,
but it isn't the live path: `prisma generate` needs to download a query engine binary from
`binaries.prisma.sh` at install time, and that host returned `403 Forbidden` in the sandboxed
environment this build was verified in. Rather than ship something untested, the live
persistence layer (`src/lib/db.ts`) is hand-written SQL over `better-sqlite3` — a real,
synchronous, file-backed SQLite database with the identical table shape as the Prisma schema.
Every query lives behind `src/lib/onboarding/service.ts`, so switching to Prisma+Postgres later
is a rewrite of that one file's internals, not a change to any API route, component, or type.
If your own environment has normal internet access, `prisma generate` may well work fine there —
it just couldn't be honestly verified here.

**Fonts via `<link>` tags, not `next/font/google`.** Same root cause: `next/font/google` fetches
font files at *build time*, requiring access to `fonts.googleapis.com`, which this sandbox also
couldn't reach. Classic `<link>` tags (`src/app/layout.tsx`) produce the identical visual result
at runtime and let the build be verified end-to-end. If you have unrestricted build-time
internet access, swapping back to `next/font/google` is a one-file change.

**Session identity: signed anonymous cookie, not a login system.** There's no email/password or
OAuth here — seeding one would need its own provider keys, which conflicts with "leave keys
blank." What's actually implemented: on first visit, middleware (`src/middleware.ts`) issues a
random student ID, HMAC-signs it (`src/lib/session.ts`, Web Crypto, `SESSION_SECRET`), and sets
it as an `httpOnly` cookie. Every request re-verifies that signature before trusting the ID.
Concretely, this means a client cannot set `Cookie: aceapt_sid=<someone-else's-id>` and read that
student's data — without `SESSION_SECRET` they can't forge a valid signature, so a tampered
cookie just results in a fresh, empty identity, never someone else's context. That is a real,
verifiable property (see "What was actually tested" below) — it is not, however, a full
authentication system with password reset, multi-device login, or account recovery. Swap
`src/lib/session.ts` for real auth (NextAuth, Clerk, institutional SSO) whenever that's needed;
nothing else in the codebase reads cookies directly, so the change is contained to that file.

**A data-driven flow engine instead of one component per question.** `src/lib/onboarding/flow.ts`
defines every step as data — id, type, options, an optional `isVisible(ctx)` predicate — and
`StepRenderer.tsx` switches on step *type* (`SINGLE_SELECT`, `MULTI_SELECT`, etc.), never on step
*id*. Adding a new question, or a new branch, means editing the config array, not writing a new
component. Two real branches are wired up end-to-end as proof: the "what's been difficult"
question only appears if the student has prepared before, and progress ("06 / 13") recomputes
live against whatever's actually visible.

---

## Design direction

Two visual modes, used deliberately rather than uniformly: a calm, light "workspace" (white
cards, hairline borders) for the thirteen question steps, and a dark "ink" surface reserved for
exactly three beats — arriving (Welcome), understanding (the AI summary reveal), and
transitioning (the diagnostic hand-off). Two accent colors carry real meaning rather than
decorating: signal blue marks anything **self-reported** (confidence ratings, preferences);
warm copper marks anything related to **future measured capability** (the diagnostic-intro
screen, the small two-tone "perception gauge" mark next to the confidence step). Type is
Newsreader (headlines, one italic line of emphasis per key screen), IBM Plex Sans (everything
else), and IBM Plex Mono (the few numbers that function like instrument readouts — step
progress, day counts).

---

## The core principle, enforced structurally

*Self-reported information is not measured skill.* This isn't just copy — it's encoded in the
type system. `StudentOnboardingContext` (`src/lib/onboarding/types.ts`) has two separate,
differently-shaped fields:

```ts
selfPerceivedConfidence: SelfPerceivedConfidence; // LOW | DEVELOPING | MODERATE | STRONG | VERY_STRONG
measuredCapability: MeasuredCapability;           // 0–1 floats, always null from this feature
```

No code path in this feature writes to `measuredCapability` — it exists so the shape is visible
to anyone integrating against the contract, and so Feature 2 doesn't have to bolt an
untyped field on later. The database mirrors this: `OnboardingContext.measuredQuantitative` /
`measuredLogical` / `measuredVerbal` / `measuredTimePressure` /`measuredAt` /
`sourceDiagnosticId` are declared now, always `NULL`, ready for an additive migration.

The same discipline shows up in the AI summary system prompt (see below) and in the required
disclaimer line, which appears verbatim on the summary screen: *"Your answers tell me how you
see your preparation today. Your diagnostic will measure what you can actually do."*

---

## AI summary + deterministic fallback

`src/lib/onboarding/summary.ts` exports `generateOnboardingSummary(context)`, which **always**
resolves with usable text — it cannot throw, and the caller never has to render an "AI failed"
state:

1. If `ANTHROPIC_API_KEY` is unset, or the request errors, times out (8s), or returns a non-200 —
   it silently falls back to `buildDeterministicSummary(context)`, a template-driven paragraph
   built purely from the structured fields the student actually answered. This is the path
   that's active by default, since the shipped `.env` leaves the key blank.
2. If a key is configured, it calls `POST https://api.anthropic.com/v1/messages`
   (model `claude-sonnet-5` by default, overridable via `ANTHROPIC_MODEL`) with a system prompt
   that explicitly forbids inventing facts, claiming strength/weakness, promising a score, or
   implying a diagnostic has happened — enforced by instruction on this path, and enforced
   structurally on the deterministic path (it can only ever echo fields that exist).

Both paths end with the same self-perception-vs-measured-capability sentence. Neither path is
presented to the student as better or worse than the other — the UI shows a single neutral
caption ("Prepared from your answers") regardless of which one ran.

---

## Data contract for Feature 2 (and beyond)

```ts
// src/lib/onboarding/service.ts
export async function getStudentOnboardingContext(
  studentId: string
): Promise<StudentOnboardingContext>
```

This is the entire integration surface. `src/app/diagnostic/page.tsx` — a real, separate route —
calls this exact function and renders a few fields from the result, which is the actual proof
that the contract works: that page has no access to the wizard's React state, no query params
carrying data across, nothing UI-specific. It reads the database through the same function
Feature 2 will use, the same way, from a different feature.

`/diagnostic` today is an honest placeholder: it says outright that the Diagnostic Engine isn't
built, and shows exactly what it *would* receive. It never fabricates a diagnostic result.

---

## Adaptive flow

Screens, in order (`src/lib/onboarding/flow.ts`):

Welcome → Goal → Objective → Timeline (+ optional date) → Experience → Previous preparation →
*(if prepared before)* What's been difficult → Confidence map → Daily availability → Study
schedule\* → Assistance preference\* → Difficulty preference\* → Pain point → Target score\* →
AI-generated summary → Diagnostic introduction → *(hands off to /diagnostic)*

\* optional, skippable without penalty. Progress ("`06 / 13`") only counts question steps and
recomputes against whichever are currently visible, so it never lies when a branch appears.

**Save/resume**: every answer is written to the database as it's given (`PATCH
/api/onboarding/step`), not batched at the end. A student who closes the tab mid-flow and
returns sees "Welcome back — your journey is partially configured" and resumes at the first
unanswered required question, not the beginning.

**Editing**: after completion, every recap row on the summary screen has an inline Edit control.
Submitting an edit doesn't revert the completed status or send the student back through the
whole flow — it bumps `contextVersion`, timestamps `lastEditedAt`, logs `ONBOARDING_EDITED`
instead of the field's normal event, and regenerates the summary (verified live — see below).

---

## Validation & security

- Every step payload is validated server-side with Zod (`src/lib/onboarding/validation.ts`)
  before it touches the database — the client's local "is this complete enough to submit" check
  is a UI convenience only, never the source of truth.
- `studentId` is never read from the request body or a query param. It's derived exclusively
  from the verified session cookie (`src/lib/session.ts`), so one student cannot address another
  student's context by guessing or supplying an ID.
- A failed save only affects the step being saved. Earlier answers are already committed rows;
  the client also keeps the student's in-progress selection locally so retrying doesn't require
  re-selecting anything.

## What was actually tested

Beyond the 29 automated unit tests (`npm run test` — branching logic, Zod schemas, the
deterministic summary generator), the built app was run as a real server and exercised over real
HTTP end to end, including:

- Full onboarding, step by step, with real persistence — confirmed by reading the raw SQLite
  file afterward (not just trusting the API's response).
- The 11 expected events landing in `OnboardingEvent` in the correct order, and *only* for
  successful saves (a rejected 422 submission correctly logged nothing).
- `daysAvailable` computed correctly from a real target date against the server's actual clock.
- Completion → deterministic summary generation → the exact required disclaimer sentence present.
- `/diagnostic` blocked (redirected home) for an incomplete student, and rendering real recovered
  context for a completed one.
- A forged/unsigned session cookie: confirmed it resolves to a **fresh, empty** identity rather
  than another student's data.
- Editing a field after completion: `isEdit: true`, `contextVersion` incremented, summary
  regenerated with the new answer reflected in the new text.
- Server-rendered HTML inspected directly for all three entry states (fresh / resuming /
  already-completed) to confirm the right screen renders without a client-side flash.

## Known limitations

- **Session is anonymous, not authenticated.** See "Session identity" above. Fine for a
  prototype/demo; needs a real identity provider before production.
- **No admin/analytics view.** Events are genuinely recorded (`OnboardingEvent` table) but
  there's no dashboard to browse them yet — query the SQLite file directly, or build one against
  the same table.
- **Prisma isn't live**, for the network reason explained above. The schema is accurate and
  ready; it just wasn't the path this build could verify.
- **No automated browser/E2E test** (Playwright, etc.) — verification was real HTTP requests
  against the running server plus direct database inspection, not a simulated browser session.
  That would be the natural next addition.
- **Single-instance SQLite** — fine for a prototype or small deployment, not for multi-instance
  horizontal scaling. The service-layer boundary is what makes moving to Postgres later
  low-risk, not a promise that today's storage scales.
- **English only**, no i18n layer yet.

## Demo flow

1. `npm install && npm run dev`, open `http://localhost:3000`.
2. Land on Welcome → **Start My Journey**.
3. Pick **Campus Placement**, a primary objective, a **within 1 month** timeline (try adding an
   optional date — watch the day count compute).
4. Answer experience and previous preparation as **anything other than "Never"** — watch the
   "what's been difficult" question appear, proving the branch.
5. Fill the confidence map, daily availability, and pain point; skip the optional steps to see
   that skipping truly costs nothing.
6. Watch the brief "putting together your starting point" moment, then the summary screen —
   structured recap, narrative paragraph, the self-perception line, editable rows.
7. Click **Discover My Aptitude Level** → the diagnostic-introduction screen → **Begin
   Diagnostic** → a real route change to `/diagnostic`, which is honest about not being built yet
   while proving it already has everything it will need.
8. Reload `http://localhost:3000` at any point mid-flow to see save/resume in action.
