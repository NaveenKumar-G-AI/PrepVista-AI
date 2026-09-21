# ACEAPT Feature 51 — Accuracy Training Engine

Precision / error-reduction / self-correction intelligence layer for
ACEAPT. Delivered as a standalone module (no ACEAPT repository was
available to extend — see `PRE_CODING_REPORT.md`), built to the same
conventions as this project's earlier features: real Postgres with
per-student row-level security, a deterministic core with AI used only for
wording, and a live-HTTP test walkthrough against a real running server.

**Read `PRE_CODING_REPORT.md` and `POST_IMPLEMENTATION_REPORT.md` first** —
they're the spec's own required deliverables (§146-147) and cover scope,
what was and wasn't built, and every real bug found while getting the tests
to pass.

## Quick start

```bash
npm install
cp .env.example .env        # fill in your Postgres + (optional) Anthropic key
./scripts/setup-db.sh       # provisions roles/db as a Postgres superuser, then migrates
npm test                    # 70 unit tests, no DB needed
npm run walkthrough         # boots the real server against your DB, 45 live checks
npm run dev                 # starts the API on :4051
```

No `ANTHROPIC_API_KEY`? Everything still works — see "AI is optional" below.

## Architecture

```
types/      plain interfaces — the vocabulary every other layer shares
domain/     pure functions: error recurrence, accuracy profiles, stability,
            contextual signals. No I/O, no framework. This is the
            "intelligence" the spec cares about most, and it's the most
            heavily unit-tested layer (§112-128 map ~1:1 to test files here).
policy/     composes domain outputs into one decision (AccuracyTrainingPolicyEngine):
            which intervention, what difficulty, fade or reassess, why.
ai/         Claude is asked for wording ONLY (§98-103) — never correctness,
            never a score. A narrow zod-validated output contract plus a
            deterministic template fallback mean the product works
            identically with or without a configured key.
ports/      inbound seams for F13/14, F29, F30, F31, F45, F48, F49, F50 —
            named by capability, not by number (see pre-coding report).
outbox/     outbound seams — signals for F36/37, F39/40, F48, F49, F50,
            and readiness, written atomically with the state change that
            produced them.
db/         Postgres access: three RLS-scoped roles, repositories per entity.
services/   orchestration — the only layer that touches domain + policy +
            ports + outbox + the database together.
api/        Express routes, thin validation (zod), centralized error mapping.
```

Dependency direction is strict: `domain` and `policy` never import from
`db`, `api`, or `ai`. Every test in `tests/unit/` proves this by construction
— none of them touch a database or the network.

## Data model

Four tables Feature 51 owns (`accuracy_training_session`,
`accuracy_training_attempt`, `accuracy_profile_snapshot`,
`accuracy_intervention`), one cross-feature `signal_outbox`, and three
underscore-prefixed fixture tables (`_fixture_student`, `_fixture_skill`,
`_fixture_question`) standing in for ACEAPT's real canonical tables. **When
integrating**: drop the fixture tables, and point `student_id` / `skill_id`
/ `question_id` at the real tables — nothing else in the schema changes,
since those columns were always plain UUIDs, never foreign keys into the
fixtures (only the fixtures' own internal references use real FKs).

## Security

Three Postgres roles, matching this project's established RLS pattern:

- `aceapt51_owner` — migrations only, never touches a live request.
- `aceapt51_app` — normal traffic, RLS-scoped to `app.student_id` (set via
  `set_config(...)` inside every request's transaction — **not** `SET
  LOCAL app.student_id = $1`, which doesn't accept bind parameters and was
  the first bug the live walkthrough caught).
- `aceapt51_service` — background/cross-student work (outbox dispatch,
  reporting).

RLS is `FORCE`d on every table, not just enabled — a defensive habit from a
real bug caught on an earlier ACEAPT feature (a table owner is exempt from
its own RLS policies by default in Postgres). The live walkthrough proves
isolation with a raw SQL query from a second student's connection, not just
an application-level 404.

Auth itself is an explicit placeholder — see the comment at the top of
`src/api/middleware/auth.ts` for exactly what to replace.

## AI is optional

`src/ai/AnthropicAccuracyAdapter.ts` is called for wording only — the
message that accompanies a right/wrong answer, the "why this focus"
explanation, the session-completion summary. It:

1. Returns a deterministic template immediately if `ANTHROPIC_API_KEY` is
   unset — no network call is even attempted.
2. Falls back the same way on any network failure or non-2xx response.
3. Validates the model's JSON against a **one-field** schema (`{"message":
   string}`) and falls back if it doesn't parse — any other field the model
   invents (an intervention type, a score) is parsed and discarded, never
   trusted, per §98-100.

The live walkthrough runs entirely with no key configured and asserts the
exact fallback template text came back over real HTTP.

## Frontend

Five React/TypeScript components in `frontend/`, designed around one
signature device — a horizontal **calibration scale** (tick marks + a
filled reading + a target notch) used everywhere an accuracy number
appears, instead of the generic circular-progress-ring look. Full rationale
in `frontend/styles/tokens.css`'s header comment: cool paper/ink palette
instead of the common warm-cream AI-dashboard look, IBM Plex Mono reserved
specifically for numeric readouts (a calibration-instrument detail, not
decoration), ruled/hairline layout instead of a card-shadow kit.

Merge `frontend/tailwind.theme.extend.js` into the host app's Tailwind
config, import `frontend/styles/tokens.css` once, then use the components —
they call `frontend/lib/api.ts`, which expects `NEXT_PUBLIC_ACCURACY_API_URL`
(or edit the constant directly) and a bearer token in `localStorage` as a
placeholder, same caveat as the backend auth.

## What's genuinely done vs. what's a seam

Everything in `domain/` and `policy/` is real, tested logic with no
placeholders — error recurrence, accuracy evidence-gating, the speed/
novelty/assistance signals, the repair ladder. What's necessarily a seam
(because the other 50 features don't exist in this environment): the eight
inbound ports and the outbound signal contract. Two of the eight ports
(`PersonalMistakeBankPort`, `ErrorPatternIntelligencePort`) have working
default logic backed by Feature 51's own data; the rest are honest
placeholders. `POST_IMPLEMENTATION_REPORT.md` §11 and §20 spell out exactly
which is which — nothing here claims more than it does.
