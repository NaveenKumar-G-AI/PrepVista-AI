# Security

## Identity: never trust the client

Every protected route (`src/api/middleware/auth.ts`) derives `req.studentId` from a **verified JWT** — never from the request body or query string. `POST /api/attempts` accepts a `studentId` field in its Zod schema **only if you smuggle it in**; the actual handler ignores it entirely and uses `req.studentId!`. This is tested directly and adversarially in `tests/integration/security.test.ts`: a request authenticated as student A that tries to submit `{ studentId: 's2', ... }` in the body is verified to be attributed to A, not B, by inspecting the database row afterward — not just by checking the HTTP response.

This demo issues its own JWTs via `POST /api/auth/demo-login` for the seeded demo students, which is **intentionally simple/insecure** — anyone can log in as any seeded student by id, with no password. This is appropriate for a reference build with synthetic demo accounts and is called out here explicitly so it is never mistaken for a production auth design. In a real deployment, `requireAuth` would verify a Supabase-issued (or equivalent) JWT instead; the pattern it enforces downstream — identity from a verified token, ownership-filtered queries everywhere — does not change.

## Ownership enforcement

Every data-access function that reads or writes student-specific data takes the authenticated student id as a parameter and filters by it — `evidence`, `student_skill_state`, `recommendations`, and `attempts` are never queried without a `WHERE student_id = ?` clause tied to the authenticated identity. `POST /api/recommendations/:id/accept` additionally checks that the recommendation belongs to the requester and returns `404` (not a silent no-op, not a `403` that would confirm the id exists) otherwise.

Tested directly: `tests/integration/security.test.ts` gives student B real evidence, then confirms student A's `/api/history/:skillId` call for that same skill returns an **empty** timeline — not an error, not B's data — while confirming B can see their own.

## Row Level Security (Postgres/Supabase target)

`db/rls_policies.sql` contains real Postgres RLS policies for the production target: students can `SELECT`/`UPDATE` only their own row, `SELECT`/`INSERT` only their own attempts, and `SELECT` (never write) their own evidence/skill-state/recommendations. Writes to `evidence`, `student_skill_state`, and `recommendations` are granted **only to the server-side service role** — no RLS `INSERT`/`UPDATE` policy exists for the authenticated role on those tables at all (default-deny), because students must never be able to write their own mastery data directly.

**This SQL is not executed against the SQLite database used by this reference build** — SQLite has no RLS engine. The equivalent boundary is enforced in the application layer instead (the ownership checks described above). This is documented as a defense-in-depth expectation: in a real Postgres/Supabase deployment, apply both layers — RLS as the database-level backstop, app-layer checks as the primary enforcement — not one instead of the other.

## Hidden tests and expected answers are never exposed

`challenge_test_cases.expected_json` is read only inside `src/evaluation/evaluator.ts`, server-side, for comparison — it is never serialized into any API response. `src/execution/runner.ts` (the untrusted-code sandbox) never even receives `expected` values, only `input`, so there is no code path by which a hidden answer could leak through the execution boundary. `toClientSafeResult()` additionally strips hidden test cases' input/actual/error fields from the attempt response, replacing them with just `{ testCaseId, passed, timedOut, category: 'hidden', runtimeMs }`. `GET /api/challenges/:id` filters to non-hidden test cases only, and only returns `input`, never `expected`, for those. Tested directly in `tests/integration/security.test.ts` and `tests/integration/pipeline.test.ts` (the "overfit" test: a submission crafted to pass all 3 visible cases still fails, because the 4th, hidden case is genuinely evaluated server-side).

## Idempotency (Phase 52)

`attempts` has a `UNIQUE(student_id, client_attempt_id)` constraint. `processAttempt()` checks for an existing row with that key first and returns the original result unchanged — a double-click, refresh, or network retry with the same client-generated id can never create two attempts or double-count evidence, even if the retried request carries different code. Tested in `tests/integration/pipeline.test.ts`.

## Data integrity (Phase 51)

Foreign keys are enabled (`PRAGMA foreign_keys = ON`) and enforced — every `evidence`, `attempts`, `diagnoses`, `evaluation_results`, and `recommendations` row requires a real parent row to exist first (this was verified the hard way: an early test that tried to insert evidence without first inserting the corresponding attempt was correctly rejected by the database, and the test was fixed to match the real insert order — see `CODEFORGE_FINAL_REPORT.md`). `student_skill_state` has a composite primary key `(student_id, skill_id)`, so it is updated via `ON CONFLICT`, never duplicated.

## What is NOT implemented

- Rate limiting / abuse protection on the API.
- CSRF protection (moot for a pure JSON API consumed by a non-browser-form client, but would matter if a cookie-based session were introduced).
- A hardened, multi-tenant code-execution sandbox (see `CODEFORGE_FINAL_REPORT.md` for the honest scope of the execution engine — it is a real, working sandbox for this reference build's bounded challenge set, not a production-grade isolation layer).
