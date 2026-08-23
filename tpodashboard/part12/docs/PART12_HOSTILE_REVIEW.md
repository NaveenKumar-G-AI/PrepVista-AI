# Part 12 — Hostile Engineering Review

Reviewed as: principal AI architect, security engineer, and student-privacy reviewer,
against the actual code in this repository (not a generic checklist). One finding
below (SEC-5) was found by writing a probe script against the real registry and
observing real leakage, then fixed and covered by a new regression test in the same
session — see the diff trail in `tests/tenantIsolation.test.js`.

## Findings

### SEC-1 — CRITICAL (verified closed): tool execution has exactly one path
**Claim to attack:** does anything call a tool's `handler` without going through
`ToolRegistry.executeTool`, bypassing schema validation, permission checks, or audit?
**Result:** No. Grep confirms `.handler(` is only invoked from inside `registry.js`.
`orchestrator.js`'s tool loop, `briefing.js`, and `actionSafety`'s confirm path all
call `registry.executeTool(...)`. This is enforced by code structure, not just
convention — no other module imports a tool handler directly.
**Status:** No change needed; covered by `tests/toolRegistry.test.js`.

### SEC-2 — HIGH (documented gap, not a code fix): entity-ref resolution fails closed but is untested end-to-end
**Claim to attack:** can a client force the AI to "see" an entity (student/drive on
screen) it isn't authorized for, by supplying a fabricated `entityRefs` value?
**Result:** `session.js#buildContext` only adds a ref to context if
`resolveEntity(type, id, user)` returns a truthy value; the default `resolveEntity` in
`orchestrator.js` is `() => null`, so **by default every entity ref is dropped**. This
is a safe fail-closed default, but it also means spec section 11's page-aware
behavior ("if the TPO is on Student 1042 and asks 'why is this student's readiness
low', the AI should retrieve that student's context without being told the ID again")
is architecturally supported but **not exercised end-to-end** in this build, because
there is no real permission-checked entity lookup to wire in without Parts 1–11.
**Status:** Left as-is. A production integration must supply a real `resolveEntity`
and add an integration test proving a spoofed `entityRefs` value is dropped, not
resolved.

### SEC-3 — LOW (strength, noted so it isn't lost in a refactor): tool visibility is permission-filtered before the model ever sees it
`ToolRegistry.listTools({ role })` filters by permission before tools are handed to
`provider.toolCall()` — a `STUDENT`-role turn (were one ever wired up) would receive
an **empty tools array**, not a full catalog with denials happening at call time. This
means even a fully-compromised or adversarially-prompted model cannot request a tool
it was never shown. Confirmed via `tests/toolRegistry.test.js`'s `listTools` test.
Worth preserving explicitly in review because it's a property that's easy to
accidentally break by "helpfully" passing the full catalog and relying on
`executeTool`'s permission check alone as defense.

### SEC-4 — MEDIUM (by design, documented): the injection heuristic scanner is advisory only
`scanForInjectionSignals` is pattern-matching and is not used to block content —
current literature (see `PART12_RESEARCH_UPGRADE.md`) is consistent on this being the
right call: regex-based detection is trivially evaded, and treating it as a hard gate
would create false confidence while adding friction for legitimate text that happens
to contain a flagged phrase. The **actual** defense is structural: untrusted content
is delimited (`wrapUntrustedField`) and the system prompt reiterates the
data/instruction boundary on every call (spec sections 51–52). Residual risk: an
attacker who understands the delimiting scheme could attempt to inject text that
mimics an `untrusted_data` boundary itself ("prompt smuggling" via fake delimiters).
Not tested in this pass — flagged as a real gap for the eval suite this build did not
have room to build out (spec section 78).

### SEC-5 — HIGH (found and fixed in this session): department scope was only enforced on tools whose items were student records
**Claim to attack:** a Department Coordinator's scope is supposed to apply
everywhere, not just to student lists. Probed `get_offers` and `get_top_improvers`
directly against the live registry as a CSE-scoped coordinator.
**Result before fix:** `get_offers` returned offers for **all four departments**
(offer records had no `department` field, so `checkEntityScope`'s department check —
which only runs `if (entity.department)` — silently no-opped). `get_top_improvers`
had no department filtering at all, `scopeMode: 'none'`, and returned improvers from
every department regardless of caller scope.
**Fix applied:** `mockData.js#makeOffer` now stamps each offer with the owning
student's department at creation time; `mockServices.js#topImprovers` now accepts and
applies a `department` filter; `readiness.tools.js#get_top_improvers` now forces
`scopedDept(user, params.department)` and switched to `scopeMode: 'list'` so the
registry's entity-scope filter is a second, independent check on top of the
service-level filter (defense in depth — if the service-level filter is ever removed
by a future edit, the registry-level one still catches it).
**Status:** Closed. Regression test added in `tests/tenantIsolation.test.js` —
*"department scope also applies to list tools whose items are not student records
themselves."* Re-ran the full suite (41/41 pass) and the demo script after the fix to
confirm no narrative numbers changed.
**Lesson for the truth table:** this is exactly the kind of bug a checklist-only
review misses — every individual tool "looked" permission-checked because
`scopeMode` was set, but the underlying data didn't carry the field the check needed.
The fix generalizes: **any new tool whose `scopeMode` is `'list'` or `'single'` must
have its handler return items that actually carry `institutionId`/`department`/
`studentId`**, or the scope check silently does nothing. This should become a
required field in code review for every new tool, not just a one-time fix.

### OPS-1 — MEDIUM (documented, not fixed): audit log and session store are in-memory only
Both `createAuditLog()` and `createInMemorySessionStore()` lose all data on process
restart. Fine for this build and for local development; not acceptable for a real
audit requirement (spec section 76 implies audit records need to survive). Both are
written as small, swappable interfaces specifically so a durable implementation can
replace them without touching any caller — see `PART12_INTEGRATION.md` section 4.

### OPS-2 — LOW: audit payload minimization is a denylist, not an allowlist
`auditLog.js#NEVER_LOG_KEYS` blocks a fixed set of key names (`phone`, `email`, ...)
from being written. Every current caller in this codebase only ever passes small,
deliberately-chosen metadata objects (never a raw `params` or `data` blob), so this
denylist is currently a backstop, not the primary protection. But it would silently
fail to catch a future caller that logs a differently-named sensitive field (e.g.
`studentPhoneNumber`) or a nested object containing one. **Recommendation for
Part 13+:** move to an explicit per-event-type allowlist of loggable fields rather
than a global denylist, once the real event payloads are known.

### PRIV-1 — LOW: no tool returns a student's contact info, even to TPO_ADMIN
`includeSensitiveFields` exists but no tool currently opts into it. Intentional
(data minimization is the safer default), but it means there is currently no tool at
all that returns a student's phone/email, even to a TPO_ADMIN who might legitimately
need it to call a student directly. Not a vulnerability — an over-restriction.
Flagged so a future pass doesn't "fix" it by turning `includeSensitiveFields` on
broadly instead of adding one narrowly-scoped, explicitly-audited tool for that
specific need.

## Attempted and failed attacks (worth recording so they aren't re-attempted blind)

- **Tenant crossover via guessed ID**: fetching a real `studentId` from institution A
  while authenticated as institution B's admin → correctly returns filtered/denied
  (`tests/tenantIsolation.test.js`).
- **Double-send via retry**: confirming the same action proposal twice → second call
  returns `replayed: true` with the identical result, no second message sent
  (`tests/actionConfirmation.test.js`, and demonstrated live in `demo/run_demo.js`).
- **Unconfirmed write**: calling `send_message` directly without a prior
  `proposeAction`/`confirmAction` → refused with `CONFIRMATION_REQUIRED`, verified via
  direct `registry.executeTool` call, a live HTTP call, and a unit test.
- **Cross-user confirm**: user B attempting to confirm user A's proposal → rejected.
- **Extra/smuggled input field**: a tool call with `additionalProperties:false` and an
  unexpected field → rejected before the handler runs (`INVALID_INPUT`), not silently
  ignored.

## Not attempted in this pass (acknowledged gap, not claimed as covered)
Multi-turn indirect injection where the injected instruction spans several tool
results (the temporal-causal-takeover pattern described in current research — see
`PART12_RESEARCH_UPGRADE.md`) was not built into the eval suite here — the structural
defense (everything untrusted is delimited every turn) should mitigate it, but this
repository does not contain a test that proves it under a multi-round adversarial
scenario. Recommended as the first addition to a real follow-up review once a real
provider is wired in.
