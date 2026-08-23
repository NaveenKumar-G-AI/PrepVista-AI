# PrepVista AI — Part 16 Integration Kit

Part 16 is a hardening/reconciliation pass over your real Parts 1–15
codebase, which I can't see from this chat. So instead of generic
contracts that need to be taken on faith, everything here is a working
reference implementation, run against realistic fixture data (18 students,
2 institutions, a full application→interview→offer→joining→verified-outcome
funnel, and a handful of deliberately broken records) and actually
executed — not just written.

```
node run-part16-demo.mjs
```

reproduces every number in `docs/VERIFIED-RUN-OUTPUT.txt` yourself: **43
checks, 43 passed, 0 failed**, across tenant isolation, RBAC, event
ordering/idempotency, status transitions, data integrity, the fake-code
scanner, and the full §72 "wow flow" (signal → narrow → prepare → confirm
→ execute → verify → reconcile) with real students, a real drive, and real
before/after counts. Zero dependencies — plain Node, no `npm install`.

In the spirit of §35/§68/§82/§84 (don't claim recoverability you haven't
verified, don't invent benchmarks, don't claim zero issues without
checking) — nothing in this kit's docs asserts a number that
`run-part16-demo.mjs` didn't actually produce.

## Layout

```
fixtures/seed.mjs          Two institutions, full funnel, seeded broken records
lib/events.mjs             Canonical event registry, envelope, idempotency, ordering (§24-27)
lib/rbac.mjs                Role × resource × action matrix, tenant check first, no recruiter role (§10, §38)
lib/stateMachines.mjs       Legal status transitions per domain (§34)
lib/tenantIsolation.mjs     Cross-institution access check + test suite (§8)
lib/dataIntegrity.mjs       11 orphan-record checks, SQL-shaped comments included (§33)
lib/aiOrchestration.mjs     Signal detection → prepare → confirm → execute → verify (§72/§91)
scripts/scan-fake-features.mjs   Fake/demo/mock static scanner — CLI or importable (§35-36)
legacy-code-sample/         Two files seeded with real fake-markers, so the scanner has something to prove itself against
run-part16-demo.mjs         Runs everything above end to end, prints PASS/FAIL + a truth table
docs/DEMO_SCRIPT.md         The TPO demo, using this run's actual numbers
docs/RELEASE_CHECKLIST.md   Honest truth table — what's verified here vs. still repo-dependent
docs/PART16_RECONNAISSANCE.md   Template for the one part that needs your real repo
docs/VERIFIED-RUN-OUTPUT.txt    Raw captured output of the last run
```

## Wiring it into your real codebase

This is plain JavaScript (ES modules, zero dependencies), matching how
Part 8 was built. The logic — the RBAC matrix shape, the event envelope,
the transition tables, the orphan-record checks — is the part to port into
your actual services; the fixture data is only here so everything above is
provably correct rather than asserted.

Three pieces work unmodified against your real repo right now:
- `scripts/scan-fake-features.mjs <your-src-dir>`
- `lib/dataIntegrity.mjs`'s checks, once you point them at your real
  arrays/query results instead of fixture data (each has a SQL-shaped
  comment for when you're ready to run them against Postgres/MySQL
  directly)
- `lib/tenantIsolation.mjs`'s `getResource` pattern, once wired to your
  real auth context and DB lookup

What's genuinely not attempted here: real performance numbers, an actual
accessibility pass, a live security pentest, and the design-system
consolidation (§17–20) — that one needs eyes on your actual screens, not a
guess at your tokens.
