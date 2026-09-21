# Hidden Test Engine

A secure, server-authoritative hidden-test evaluation engine for coding
assessment platforms — versioned problems, sandboxed execution,
deterministic verdicts, anti-leakage result filtering, AI-assisted (but
never AI-judged) test generation, and mutation-based test-suite quality
validation.

**Read `docs/ARCHITECTURE.md` first**, especially §0 and §9 — this was
built as a standalone codebase (no existing "CodeForge" repository was
present to integrate with), and that document is explicit about what's
real/tested versus simplified.

## Requirements

- Node.js 20+
- PostgreSQL 14+ (developed against 16)
- Linux with `bubblewrap` (`bwrap`) and support for user + network
  namespaces, for the sandbox. Tested on Ubuntu 24.04.
- Python 3 and Node.js available on `PATH` inside the sandbox (both are
  used as candidate-code interpreters).

## Setup

```bash
npm install

# Copy and fill in — everything sensitive starts empty on purpose.
cp .env.example .env.local

# One-time host setup for the sandbox (see docs/ARCHITECTURE.md#4-sandbox):
sudo useradd --system --no-create-home --shell /usr/sbin/nologin sandboxrunner
sudo mkdir -p /var/lib/hidden-test-engine/sandbox
sudo chown sandboxrunner:sandboxrunner /var/lib/hidden-test-engine/sandbox
sudo mkdir -p /opt/hidden-test-engine
sudo cp sandbox-runtime/execute.sh /opt/hidden-test-engine/execute.sh
sudo chmod +x /opt/hidden-test-engine/execute.sh

# Database. DATABASE_URL_ADMIN needs a role that can create
# roles/schemas for local dev; on real Supabase, skip 0000_*.sql and run
# 0001+ as the Supabase migration runner instead (see the file header).
npm run db:migrate
npx tsx scripts/seed.ts              # fixture users for local dev/tests
npx tsx scripts/seed-demo-problem.ts # the worked example used by every demo script

npm run dev   # http://localhost:3000
```

## Verifying it for yourself

Every one of these actually executes against a real Postgres instance and
a real sandbox — none of it is mocked:

```bash
npm test                              # 48 unit + integration tests
npx tsx scripts/sandbox-safety-demo.ts   # runs real timeout/memory-bomb/fork-bomb/
                                          # network-probe/output-flood programs and
                                          # prints the actual outcome of each
npx tsx scripts/rls-security-demo.ts     # 15 real attack attempts (IDOR, direct
                                          # hidden-table access, impersonation,
                                          # immutability bypass) against real RLS
npx tsx scripts/e2e-demo.ts              # 5 real candidate solutions (correct,
                                          # subtly buggy, inefficient, resource
                                          # violator, malicious probe) run through
                                          # the full pipeline against 13 real
                                          # hidden tests
npx tsx scripts/ai-generation-demo.ts    # AI proposes 5 test ideas, the validation
                                          # pipeline accepts/rejects each with a
                                          # concrete reason
npx tsx scripts/mutation-demo.ts         # generates 6 mutants of the reference
                                          # solution, runs the real hidden suite
                                          # against each, reports the real
                                          # detection rate
npm run build                            # production Next.js build (real
                                          # typecheck across engine + API + UI)
```

## Layout

```
db/migrations/        SQL migrations — schema, RLS, immutability triggers, grants
lib/engine/           verdicts, scoring, comparators, safe-result serializer, orchestrator
lib/sandbox/          the sandbox runner + language adapters
lib/ai/               provider abstraction + AI-proposal validation pipeline
lib/mutation/         mutators + mutation-testing harness
lib/db/               connection pooling (role-scoped), audit logging, fixtures
lib/http/             session resolution (STUB — see docs/ARCHITECTURE.md#9)
app/api/               Next.js route handlers
app/                   the workspace UI
tests/unit/            pure-function tests (comparators, scoring)
tests/integration/     real DB + real sandbox + real HTTP-route tests
scripts/               migration runner, seeders, and every demo script above
docs/ARCHITECTURE.md   full design doc, including known limitations
```

## Environment variables

See `.env.example` for the full list with comments. Nothing sensitive is
filled in — `DATABASE_URL`, Supabase keys, `GROQ_API_KEY`, and
`GEMINI_API_KEY` are all left empty for you to fill in.
