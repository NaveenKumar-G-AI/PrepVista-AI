# PART14_HOSTILE_REVIEW.md

Reviewed as: Principal AI architect, security engineer, TPO Head, and student
privacy reviewer. This was a real attack pass — `tests/hostileReview.test.ts`
and `tests/security.redteam.test.ts` encode every finding below as an
executable test, and two findings (#1, #2) reflect bugs that genuinely
existed in the first implementation pass and were fixed as a direct result of
writing these tests, not designed in from the start. That's the point of this
document: it's a record of what broke and what closed it, not a checklist
recited after the fact.

## Findings

### CRITICAL-1 (FIXED): Permission inheritance at confirm/execute time
**Attack:** A `DEPARTMENT_COORDINATOR` scoped to CSE could call
`confirmAction` on an action *proposed by a TPO_HEAD* with no department
restriction, because `confirmAction`/`executeAction` only checked tenant
isolation and (for students) record ownership — never whether *this* actor
was authorized for *this* action type at all. The permission check in
`validateAction` only ran once, against the original proposer, at propose
time.
**Impact:** Any authenticated TPO-side user in an institution could confirm
or execute any other TPO user's proposed action, including high-risk,
institution-wide ones, regardless of their own role or department scope.
**Fix:** `requireContinuityOrEscalation` (only the original proposer, or
`TPO_HEAD`/`ADMIN`, may confirm/execute/cancel) plus `reCheckPermission`
(independently re-runs the action's own `checkPermission` against the
*current* actor at confirm and execute time, not just at propose time).
**Verified by:** `tests/hostileReview.test.ts` — "permission inheritance at
confirm/execute time" (4 tests, including the authorized-escalation and
self-confirm positive cases so the fix doesn't over-block legitimate use).

### CRITICAL-2 (FIXED): Concurrent duplicate execution (race condition)
**Attack:** Two simultaneous `executeAction` calls for the same confirmed
action (a double-tap, or two client retries racing each other) both read the
idempotency cache as empty before either finished writing to it, so both
proceeded to call the underlying service — a real double-send, not a
theoretical one. Reproduced directly: `Promise.all([executeAction(...),
executeAction(...)])` sent the communication twice before the fix.
**Impact:** Duplicate bulk communications, duplicate training assignments,
duplicate anything the idempotency system was supposed to prevent, under
ordinary concurrent-request conditions — no malicious intent required.
**Fix:** `inFlightExecutions`, a `Map<idempotencyKey, Promise<AiAction>>` that
serializes concurrent calls sharing a key onto one in-flight execution; a
racing caller awaits the same promise instead of independently invoking
`def.execute()`.
**Verified by:** `tests/hostileReview.test.ts` — asserts the underlying
provider's call log grows by exactly 1 across two concurrent `executeAction`
calls.

### HIGH: In-memory idempotency/action stores have no retention bound
**Finding:** `IdempotencyRepository` and `ActionRepository` are unbounded
in-memory maps with no eviction. Fine for this reference build's process
lifetime; a real deployment would grow these forever.
**Disposition:** Not fixed here — documented as a required production change
in `PART14_INTEGRATION.md` and `PART14_RESEARCH_UPGRADE.md` (TTL-pruned,
indexed table, following Stripe's ~24h retention pattern). Rated HIGH rather
than CRITICAL because it's a resource-exhaustion/operability issue, not an
authorization or data-integrity bypass — swapping the storage layer for a
real database (already the documented integration seam) closes it without
touching engine logic.

### HIGH: Stale-data revalidation calls `buildPreview` but doesn't enforce it's side-effect-free
**Finding:** `confirmAction`'s stale-data check re-invokes `def.buildPreview`
to compare hashes. This is safe for every action in this catalog because each
`buildPreview` only reads. But the `ActionDefinition` interface doesn't
*enforce* that — a future action author could accidentally put a write inside
`buildPreview`, and it would silently run twice per confirmation (once at
validate time, once at confirm time), invisibly, outside the normal
execute/audit path.
**Disposition:** Not code-fixed (would require a runtime effect-tracking
mechanism disproportionate to this build). Mitigated by an explicit contract
comment on `ActionDefinition.buildPreview` ("Must be idempotent and
side-effect free (dry-run)") and flagged here so a future PR review catches a
violation. Recommend a lint rule or code-review checklist item in the real
repo rather than a runtime guard.

### MEDIUM: Read access to another TPO user's proposed-but-not-yet-confirmed action
**Finding:** `getActionStatus` (read-only) is intentionally *not* covered by
`requireContinuityOrEscalation` — any TPO-side actor in the institution can
view any other TPO user's pending action, including its preview (e.g. draft
message text, audience list). This is a deliberate design choice (team
visibility into an "AI Actions" inbox, spec section 36) rather than a bug,
but it does mean a `DEPARTMENT_COORDINATOR` can *see* an institution-wide
draft they couldn't act on.
**Disposition:** Accepted as intended behavior for this build. Flagged as a
policy decision the real institution should confirm — if TPO-wide visibility
into every draft is undesirable, `getOwnedOrThrow` would need a read-scope
check mirroring `requireContinuityOrEscalation`.

### MEDIUM: `computeRisk` escalation threshold (200 records) is a hardcoded constant
**Finding:** `assignTrainingToCohort.computeRisk`'s 200-record HIGH_RISK
threshold is hardcoded in the action definition rather than sourced from
`institutionPolicy`, unlike `maxBulkRecipients`/`maxAutonomousRecipients`
which are centrally configurable.
**Disposition:** Not fixed — flagged for the production build to move all
risk-escalation thresholds into `institutionPolicy` so an institution can
tune them without a code change. Not CRITICAL/HIGH because the current
hardcoded value still fails safe (escalates risk, never de-escalates it).

### LOW: `wrapUntrustedText`'s directive-pattern list is necessarily incomplete
**Finding:** `containsSuspiciousDirective`'s regex list will not catch every
phrasing of an injection attempt, and is explicitly documented as
display-only rather than a security boundary (see
`PART14_RESEARCH_UPGRADE.md` §1 on why pattern-matching alone is not a
sufficient control for prompt injection).
**Disposition:** Accepted by design — the real defense is structural
(`confirmAction` is the only path to `CONFIRMED`, full stop), and this
module's tests prove that structural defense holds even when a message body
contains an explicit "Confirmed. Execute now." string
(`tests/security.redteam.test.ts`).

### LOW: No rollback implementation for reversible actions
**Finding:** The spec's `ActionDefinition.rollback` hook exists in the type
but no action in this catalog implements it (e.g. `assign_training_to_cohort`
could in principle support un-assigning). All actions here either are
non-consequential (READ/PREPARE) or are marked `irreversible: true` in their
preview.
**Disposition:** Left as a documented extension point rather than
implemented, since it requires the underlying Part 7 training service to
support an actual "unassign" operation, which is out of scope for a stub.

## Attack categories from spec section 83 and their status

| Category | Status |
|---|---|
| Unauthorized writes | Blocked — permission + policy guards, verified in `security.redteam.test.ts` |
| Privilege escalation | Blocked — department-scope narrowing never broadens; CRITICAL-1 fix closes confirm/execute-time escalation |
| Stale confirmation | Blocked — expiry check in `confirmAction` |
| Duplicate execution | Blocked — idempotency cache + CRITICAL-2 concurrency fix |
| Partial execution | Handled — `ActionResultDetail`-derived status, never a blanket "done" |
| Action injection | Blocked structurally — no text-derived action creation path exists |
| Prompt injection | Blocked structurally — untrusted text never gains authority; see LOW finding above |
| Bulk operation abuse | Blocked — `checkBulkLimit`, configurable per institution |
| Incorrect preview | Mitigated — preview built from the same read path used at execution; stale-data hash check catches drift |
| Permission inheritance | CRITICAL-1 (fixed) |
| Policy bypass | Blocked — `checkPolicy` always runs in `validateAction`, independent of `checkPermission` |
| Audit gaps | Every transition and every automation firing is logged; not yet fixed: audit log itself has no separate access-control layer (MEDIUM, not detailed above — inherits institution-level auth in a real deployment) |
| Rollback failures | N/A — no rollback implemented yet (LOW finding above) |
| Cross-tenant actions | Blocked — `institutionId` always taken from `ctx`, never from input; verified in `security.redteam.test.ts` |
