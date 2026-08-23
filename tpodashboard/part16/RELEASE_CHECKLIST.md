# PrepVista AI — Part 16 Release Readiness

## Severity classification (§75)

**CRITICAL — blocks release, no exceptions:** tenant leak · auth bypass ·
student privacy breach · duplicate financial/placement outcome · corrupted
database · unauthorized AI action

**HIGH — blocks release:** major broken workflow · report mismatch
(dashboard ≠ report ≠ verified outcome) · fake production metric ·
duplicate message · incorrect offer/joining state · major data integrity
issue

Medium/Low are tracked but don't block.

## Truth table (§90) — this kit specifically

Honest status for what's actually in `prepvista-part16/`, not the whole
platform. Re-run `node run-part16-demo.mjs` any time to reproduce every
number below yourself — that's the point of it existing.

| Capability | Status | Evidence |
|---|---|---|
| Tenant isolation logic (§8) | IMPLEMENTED, demo-verified | 10/10 checks passed against 2 fixture institutions — `lib/tenantIsolation.mjs` |
| RBAC matrix, 6 roles (§10) | IMPLEMENTED, demo-verified | 7/7 checks passed, incl. cross-department and cross-student denial — `lib/rbac.mjs` |
| No-recruiter guard (§1) | IMPLEMENTED, demo-verified | `assertNotRecruiterRole('recruiter')` throws, verified |
| Event envelope + idempotency + ordering (§24–27) | IMPLEMENTED, demo-verified | duplicate event no-op'd; out-of-order JOINING_CONFIRMED rejected then accepted once OFFER_ACCEPTED logged — `lib/events.mjs` |
| Status transition guards (§34) | IMPLEMENTED, demo-verified | 4/4 legal/illegal transitions correctly allowed/blocked — `lib/stateMachines.mjs` |
| Data integrity scan (§33) | IMPLEMENTED, demo-verified | all 11 orphan-record checks correctly caught their seeded violation — `lib/dataIntegrity.mjs` |
| Fake/demo-code scanner (§35–36) | IMPLEMENTED, demo-verified | found all 7 seeded markers across 2 sample files, both as an importable function and a CLI — `scripts/scan-fake-features.mjs` |
| AI signal → prepare → confirm → execute → verify (§72/§91) | IMPLEMENTED, demo-verified | full transcript in `docs/VERIFIED-RUN-OUTPUT.txt`; every number in it is computed, not typed in |
| Report/outcome reconciliation (§44) | IMPLEMENTED, demo-verified | verified joinings = reported outcomes = 1, checked by code not eyeballed |
| Real repo reconnaissance (§4) | NOT ATTEMPTED | needs your actual Parts 1–15 codebase — see `PART16_RECONNAISSANCE.md` |
| Design-system consolidation (§17–20) | NOT ATTEMPTED | needs eyes on your actual screens, not a guess at your tokens |
| Real performance numbers (§57–59, §84) | NOT ATTEMPTED | needs your running app under real load |
| Accessibility pass (§20) | NOT ATTEMPTED | needs your actual rendered screens |
| Live security pentest (§63–67) | NOT ATTEMPTED | this kit's RBAC/tenant logic is a reference implementation, not a substitute for testing your actual auth layer |

## Release checklist (§87), scoped to what carries over from this kit

- [x] Tenant isolation passes — extend `lib/tenantIsolation.mjs`'s resource
      list to every resource type once wired to your real API
- [x] RBAC passes for the six roles as modeled — walk `lib/rbac.mjs`'s
      matrix against your actual screens next; it's a starting point, not
      gospel
- [x] No recruiter access — call `assertNotRecruiterRole()` from wherever
      your real user-creation/import path lives
- [~] No synthetic data in this kit's own code — checked, not assumed: running
      `node scripts/scan-fake-features.mjs . --include-tests` from inside
      `prepvista-part16/` actually returns 28 hits across 6 files. Every one
      is legitimate on inspection — `fixtures/seed.mjs` is fixture-seeding
      code and is *supposed* to say "seed"; `scan-fake-features.mjs`'s own
      hits are its pattern list matching its own literal search terms;
      `run-part16-demo.mjs`'s hits are prose describing the scan/demo
      process itself. This is the scanner doing exactly what §36 asks —
      flagging candidates for a human to triage, not returning a verdict.
      Don't skip that triage step once it's pointed at your real repo, where
      the hits won't all be this easy to explain away
- [ ] No synthetic data in *your* production code — run the same scanner
      against your real repo; it hasn't seen it yet
- [ ] Dashboard numbers verified against source records — same mechanism as
      `reconciliationCheck()`, applied to your real tables
- [ ] All migrations / production build / full test suite — needs your repo
- [ ] Background jobs, audit immutability, imports/exports — needs your repo
- [ ] Golden path (§11) verified end to end on real data, not fixture data

## Integration manifest skeleton (§85)

For your real `PART16_INTEGRATION.md`: capture per module (Parts 1–15)
ownership, dependencies, APIs exposed/consumed, events emitted/consumed
(seed the list from `lib/events.mjs`'s `CANONICAL_EVENTS`), shared models
touched, background jobs owned, auth/permission hooks (seed from
`lib/rbac.mjs`'s `MATRIX`), and deployment assumptions.
