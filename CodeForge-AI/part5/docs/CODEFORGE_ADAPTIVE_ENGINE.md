# CodeForge Adaptive Engine

## What this is

A real, working, tested implementation of the adaptive coding mastery loop:

```
Student → Challenge → Attempt → Real Execution → Deterministic Evaluation
  → Diagnosis → Evidence → Student Skill State → Gap Detection
  → Prerequisite Analysis → Mastery/Confidence/Trend → Learning Objective
  → Candidate Retrieval → Challenge Ranking → Recommendation
  → Student Attempt → New Evidence → Updated Skill State → (loop)
```

Every arrow in that loop is real code, exercised by real tests, in this repository — not a diagram of an intended design. See `CODEFORGE_FINAL_REPORT.md` for the honest phase-by-phase truth table of what's fully implemented vs. partial vs. out of scope.

## Why this exists as a fresh build, not an "integration"

This was built in response to a specification that assumed an existing "CodeForge AI" codebase with students, challenges, execution, and evaluation already in place. **No such repository existed in the environment this was built in** — the workspace was empty. Rather than pretend to integrate with something that wasn't there, this project:

1. Builds the **adaptive layer** (skill graph, mastery model, gap detection, recommendation engine) to real production-quality standards — this is the actual deliverable the spec cared about.
2. Builds the **minimal real scaffolding** around it (students, challenges, a sandboxed code execution engine, deterministic evaluation) — not a second product, just enough real infrastructure for the adaptive layer to consume genuine evidence instead of mocked data.
3. Keeps the seam between (1) and (2) clean and documented, so a real production evaluation/execution engine (the one the original spec assumed already existed) can be swapped in without touching the adaptive logic. See "Integration seam" below.

## Architecture discovered vs. implemented

**Discovered:** an empty workspace (`/mnt/user-data/uploads` and the home directory both contained nothing). Node 22.22, Python 3.12, and a working `node:sqlite` were confirmed present before any code was written (see `CODEFORGE_FINAL_REPORT.md` §1 for the exact commands run).

**Implemented:** a TypeScript/Node project, SQLite for this reference build (schema is Postgres/Supabase-compatible SQL — see `CODEFORGE_DATABASE.md`), Express API, real child-process code execution for JavaScript and Python, and the full adaptive pipeline described above.

## Directory layout

```
db/                    schema.sql (Postgres-compatible), rls_policies.sql (Supabase target)
src/
  types.ts             shared domain types
  config/              every threshold/weight the engine uses, in one place
  db/                  DB client + seed data (skill graph, roles, challenges, test cases)
  execution/           sandboxed JS/Python code execution
  evaluation/          compares real output to expected values; hidden-test protection
  diagnosis/           deterministic mistake classification from evaluation results
  evidence/            persists Evidence rows
  skillgraph/          data-driven skill graph queries
  mastery/             mastery/confidence/trend/contradiction estimators + state gating
  gaps/                gap type detection + prerequisite chain analysis
  difficulty/          difficulty adaptation + recovery paths
  recommendation/      candidate retrieval, ranking, intervention selection, orchestrator
  ai/                  Groq/Gemini provider abstraction, schema-validated, fails closed
  pipeline/             the closed-loop entrypoint (processAttempt)
  api/                  Express routes, JWT auth middleware
tests/                 unit, integration, and e2e tests (75 tests, all real — see below)
scripts/               seed.ts, runDemo.ts (produces dashboard-data.json from a real run)
dashboard/             a static dashboard rendering a real captured run
docs/                  this documentation set
```

## Integration seam (how to plug this into a real CodeForge deployment)

If a real CodeForge repository exists (Next.js + Supabase, per the spec's own hints — Supabase, RLS, "TPO", Groq/Gemini), integration is:

1. **Database**: apply `db/schema.sql` and `db/rls_policies.sql` to the real Supabase Postgres instance instead of SQLite. The schema was written in standard Postgres SQL for exactly this.
2. **Execution/evaluation**: if a real execution/evaluation engine already exists, replace `src/execution/` and `src/evaluation/` with calls into it, as long as the result still conforms to the `EvaluationResult` type in `src/types.ts`. Nothing downstream of evaluation cares how the result was produced.
3. **Students/challenges**: replace the minimal `students`/`challenges` tables with the real ones, keeping the same columns the adaptive engine reads (or add a thin view/adapter).
4. **Auth**: replace `src/api/middleware/auth.ts`'s demo JWT verification with real Supabase JWT verification. The pattern it enforces (identity from a verified token, never from the request body) does not change.
5. **AI**: set `AI_PROVIDER=groq` or `AI_PROVIDER=gemini` and the corresponding API key env var. The provider code is already written against each service's real API shape (see `src/ai/`).

Everything from the skill graph onward (`src/skillgraph/`, `src/mastery/`, `src/gaps/`, `src/difficulty/`, `src/recommendation/`) needs no changes to integrate — it only depends on the `Evidence`/`Challenge`/`Skill` types, not on how the surrounding system is built.

## Running it

```bash
npm install
npm run seed        # creates ./data/codeforge.db and populates the skill graph + challenges
npm run dev          # starts the API on http://localhost:3000
npm test             # 75 tests: unit + integration + e2e, real code execution throughout
npm run demo         # runs the full Phase 59 scenario against a real in-memory server,
                      # writes dashboard-data.json, prints a live transcript
```

See `CODEFORGE_FINAL_REPORT.md` for exact verification commands and real test output.
