# PART14_INTEGRATION.md — PrepVista AI Action Engine

## 1. What this module is

`ai-actions` is the execution layer between "the AI understood what the TPO
wants" and "a real record changed." It owns nothing about students, drives,
applications, interviews, offers, or training — those stay in Parts 3-11. It
owns the *pipeline* every consequential action must pass through:

```
Natural Language → Intent → Action Plan → Permission Guard → Policy Guard
→ Impact Analyzer → Action Preview → Confirmation → Action Executor
→ Verification → Audit → Result
```

Everything in `src/` implements one stage of that pipeline. Nothing outside
`engine/actionEngine.ts` is allowed to change an action's status.

## 2. Action registry

| actionType | Category | Risk | Confirmation | Notes |
|---|---|---|---|---|
| `list_unapplied_students` | APPLICATION | READ | none | Executes immediately |
| `prepare_application_reminder` | COMMUNICATION | PREPARE | none | Draft only, no send |
| `create_tpo_task` | TASK | LOW_RISK_WRITE | policy-driven (PRE_APPROVED) | Auto-executes for human-initiated calls |
| `notify_student_result_published` | COMMUNICATION | LOW_RISK_WRITE | policy-driven (PRE_APPROVED, capped at 1 recipient) | Built for automation rules |
| `send_application_reminder` | COMMUNICATION | SENSITIVE_WRITE | always | Routes through `communicationService` (Part 9 stand-in) |
| `assign_training_to_cohort` | TRAINING | SENSITIVE_WRITE, escalates to HIGH_RISK above 200 records | always | Dynamic risk via `computeRisk` |
| `publish_interview_results` | INTERVIEW | HIGH_RISK | always, typed reason required | TPO_HEAD only; hard precondition: no pending results |
| `accept_offer` | OFFER | HIGH_RISK | always | STUDENT only, own record only |

Each is a self-contained `ActionDefinition` in `src/actions/`. Adding a new
action never requires touching the engine — only registering a new
definition in `src/actions/index.ts`.

## 3. Risk levels and what they guarantee

- **READ / PREPARE** — never require confirmation, never mutate domain state.
- **LOW_RISK_WRITE** — may auto-execute, but only per an explicit institution
  policy entry (`policyGuard.institutionPolicy.approvalModeByActionType`), and
  even then automation is capped by `maxAutonomousRecipients`.
- **SENSITIVE_WRITE / HIGH_RISK** — `confirmationRequired` is `true`
  unconditionally (`policyGuard.confirmationRequired`). No action definition,
  policy setting, or automation rule can turn this off. This is the load-bearing
  guarantee of the whole module and is covered directly by
  `tests/automation.test.ts`'s "never auto-executes... even if misconfigured" case.

Risk can also escalate dynamically: `assign_training_to_cohort.computeRisk`
promotes a cohort assignment from SENSITIVE_WRITE to HIGH_RISK once it would
touch more than 200 students, mirroring spec section 55's example that the
same action type can carry different real-world risk depending on scope.

## 4. The pipeline, stage by stage

1. **proposeAction(actionType, input, ctx)** — validates input against the
   action's zod schema, stamps `institutionId`/`userId` from the *authenticated*
   `ctx` (never from client input), computes the idempotency key, persists a
   `PROPOSED` action, then immediately calls `validateAction`.
2. **validateAction** — runs `checkPermission` → `checkPolicy` →
   `checkPreconditions` (if any) → `computeRisk` → builds the first preview →
   decides `confirmationRequired`. Ends in `READY_FOR_CONFIRMATION` or throws
   (leaving the action `FAILED` with a recorded reason).
3. **previewAction** — rebuilds the preview on demand (e.g. the UI reopening a
   pending action). Side-effect free by contract.
4. **confirmAction** — the *only* path to `CONFIRMED`. Rejects expired
   previews (`STALE_CONFIRMATION`) and, for SENSITIVE_WRITE/HIGH_RISK, rebuilds
   the preview and compares its hash against what the user actually saw
   (`STALE_DATA`) before allowing confirmation.
5. **executeAction** — checks the idempotency cache *first* (so retries of an
   already-executed action return the cached result regardless of the action's
   current terminal status), otherwise requires the correct pre-state, calls
   the action's `execute()`, and derives `SUCCEEDED` / `PARTIALLY_SUCCEEDED` /
   `FAILED` from the actual `ActionResultDetail` counts — never from whether an
   exception was thrown.
6. **getActionStatus / cancelAction** — read and cancel, both tenant- and
   owner-scoped.

Every stage writes to the audit log (`engine/auditLogger.ts`) with actor,
role, session, and before/after status.

## 5. Confirmation and staleness

- Preview validity window: 5 minutes (`PREVIEW_VALIDITY_MINUTES`).
- Stale-data detection compares a stable hash of the rebuilt preview against
  the hash the user confirmed against — any change in scope, counts, or
  message content forces a fresh review rather than acting on outdated
  numbers (spec section 34).
- Confirmation can only originate from `ActionEngine.confirmAction`, called
  from an authenticated session. See `security/sanitize.ts` for why no
  document, tool result, or model output can ever satisfy this.

## 6. Idempotency

Keys are derived deterministically from `(institutionId, userId, actionType,
input)`, bucketed by calendar day (`util/ids.ts:genIdempotencyKey`). This
means: a network retry of the same action record is deduped; a *second*,
independently-proposed action with identical actor/type/input on the same day
is *also* deduped at execute time, because it hashes to the same key. See
`PART14_RESEARCH_UPGRADE.md` for the production hardening this needs
(bounded, indexed, TTL-pruned storage — the in-memory map here is a stand-in).

## 7. Partial failure

`ActionResultDetail` always carries `{requested, succeeded, failed, skipped,
errors[]}`. The engine derives the terminal status from these counts, so a
40/42 training assignment reports `PARTIALLY_SUCCEEDED` with an honest count,
never a blanket "done." See `sendApplicationReminder`'s and
`assignTrainingToCohort`'s `execute()` implementations.

## 8. Permission and policy model

- `permissions/permissionGuard.ts` — role gates (`requireRole`) and department
  scope narrowing (`resolveDepartmentScope`, which only ever *shrinks* a
  requested scope to what the actor is authorized for, never grows it) and
  student-record ownership (`requireOwnStudentRecord`).
- `permissions/policyGuard.ts` — bulk limits, approval modes, and the
  unconditional confirmation rule for sensitive/high-risk actions.
- Every `ActorContext` is assumed to come from the authenticated backend
  session. Nothing in this module reads role/institution/scope from request
  bodies.

## 9. Automation rules

`automation/automationRuleEngine.ts` implements the future-safe abstraction
from spec section 50: `trigger → condition → action`, gated by
`approvalMode`. Automation proposes actions through the exact same
`ActionEngine` a human uses — it has no privileged bypass — so a
`PRE_APPROVED` rule pointed at a sensitive action still lands in
`READY_FOR_CONFIRMATION` and waits for a human, and every autonomous run is
tagged with its `automationRuleId` in both the action record and the audit
trail.

## 10. Integration with Part 12 (conversational AI)

Part 12 should call exactly the seven methods exported from `src/index.ts`:
`proposeAction`, `validateAction`, `previewAction`, `confirmAction`,
`executeAction`, `getActionStatus`, `cancelAction`. It should never construct
an `AiAction` object itself, never set a status, and never call an action's
`execute()` directly.

## 11. Integration with Part 13 (proactive signals)

A Part 13 signal with a `recommended_action` should call `proposeAction` with
the recommended `actionType`/`input` and then hand the resulting action id to
the UI for the standard preview → confirm → execute flow. Part 13 must not
call `confirmAction` or `executeAction` on the user's behalf.

## 12. Integration with Parts 3-11

This build stubs the real services in `src/services/`:
`communicationService.ts` (Part 9), `trainingService.ts` (Part 7),
`domainServices.ts` (`interviewService`/Part 5, `offerService`/Part 6,
`taskService`). Swapping in the real Parts 3-11 implementations is a matter of
replacing these files' internals while keeping their exported function
signatures — no action definition or engine code needs to change.

## 13. Production hardening checklist (beyond this reference build)

- Replace `db/actionStore.ts` and `db/seed.ts` with real repositories backed
  by the institution's database of record; add the `ai_action`,
  `ai_action_audit`, and `automation_rule` tables from `module.manifest.json`.
- Add TTL-based pruning to the idempotency store (see
  `PART14_RESEARCH_UPGRADE.md`).
- Wire `api/server.ts`'s `resolveActor` to the institution's real
  authentication/session middleware.
- Add rate limiting and per-institution concurrency limits around
  `executeAction` for large bulk operations (spec section 68).
- Replace the synchronous, in-process execution model with a queue for very
  large bulk actions (spec section 58: queued → processing → completed, with
  real progress, not a simulated progress bar).
