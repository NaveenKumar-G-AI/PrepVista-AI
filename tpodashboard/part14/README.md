# PrepVista AI — Part 14: AI Action Engine

A reference implementation of the human-in-the-loop, permission-first action
execution layer described in the Part 14 spec. This turns AI intent into
real, audited system changes without ever letting the model own
authorization, policy, or transaction integrity.

## Quick start

```bash
npm install
npm run typecheck   # strict TypeScript, zero errors
npm test            # 28 tests: happy paths + red-team + hostile-review attacks
npm run demo        # runs the section-91-style TPO walkthrough end to end
```

## What's here

```
src/
  types/action.types.ts       state machine, risk levels, ActorContext
  registry/actionDefinition.ts the contract every action must implement
  engine/actionEngine.ts       propose -> validate -> preview -> confirm -> execute -> audit
  permissions/                 role/scope guards + institution policy
  security/sanitize.ts         prompt-injection / confirmation-spoofing defense notes
  db/                          in-memory stand-in for the real Part 1-11 database
  services/                    stand-ins for Part 9 (comms), Part 7 (training), Part 5/6 (interview/offer)
  actions/                     one action per risk level, fully wired
  automation/                  trigger -> condition -> action rule engine
  api/server.ts                thin Express wrapper (POST /actions, .../confirm, .../execute, ...)
  demo.ts                      runnable walkthrough
tests/
  actionEngine.test.ts          state machine + happy paths
  security.redteam.test.ts      unauthorized access, cross-tenant, injection, idempotency, staleness
  hostileReview.test.ts         the two real bugs found and fixed during review (see below)
  automation.test.ts            autonomous vs human-gated automation

module.manifest.json            per spec section 80
PART14_INTEGRATION.md           how Part 12/13 and Parts 3-11 plug in
PART14_HOSTILE_REVIEW.md        actual attack findings, fixes, and what's deliberately left open
PART14_RESEARCH_UPGRADE.md      current external guidance (OWASP LLM Top 10, Stripe idempotency) and what changed as a result
```

## The one guarantee that matters most

`SENSITIVE_WRITE` and `HIGH_RISK` actions require explicit human confirmation,
unconditionally. No action definition, no institution policy setting, no
automation rule can turn this off — `tests/automation.test.ts` proves a
deliberately misconfigured "autonomous" rule still can't bulk-send without a
human clicking confirm.

## Truth table (spec section 92.AI)

| Capability | Status |
|---|---|
| Propose -> validate -> preview -> confirm -> execute -> audit pipeline | IMPLEMENTED |
| Permission + policy + precondition guards | IMPLEMENTED |
| Idempotency (incl. concurrent-call safety) | IMPLEMENTED |
| Stale confirmation expiry + stale-data revalidation | IMPLEMENTED |
| Partial-failure reporting with real counts | IMPLEMENTED |
| Department-scope narrowing (never broadening) | IMPLEMENTED |
| Permission re-check at confirm/execute time | IMPLEMENTED (added during hostile review) |
| Automation rule engine w/ approval modes | IMPLEMENTED (single example rule wired; rule persistence is in-memory) |
| Rollback for reversible actions | NOT IMPLEMENTED (extension point defined, no action uses it) |
| Real Part 3/5/6/7/9 service integration | DEVELOPMENT/TEST ONLY (typed stubs standing in for the real services — swap-in point documented in PART14_INTEGRATION.md) |
| Persistent (non-in-memory) storage | NOT IMPLEMENTED (in-memory repositories; schema/migration seam documented) |
| HTTP API surface | IMPLEMENTED (Express router; auth middleware is a stub `resolveActor`) |

Nothing above is described as autonomous unless it is actually gated by
`institutionPolicy` and covered by a test proving it can't escalate beyond
that gate.
