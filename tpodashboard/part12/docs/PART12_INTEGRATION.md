# Part 12 — AI Placement Officer: Integration Guide

## 0. What this document is

This is the integration write-up required by spec section 98. It was produced in a
build session that had **no access to the real Part 1–11 codebases** — only the Part 12
build prompt itself and a memory note that Part 5 (interviews/results) had previously
been built. Everything below is written so that plugging this module into a real
PrepVista deployment is a matter of implementing one file's worth of service
contracts, not restructuring the AI layer. See `PART12_FINAL_REPORT.md` for the
feature-by-feature truth table this claim is checked against.

## 1. Architecture

```
User (TPO) ──▶ AIPlacementOfficer.handleMessage()
                 │
                 ├─ session.js          Layer 1-4 context (system rules, identity/
                 │                      permissions, UI context, trimmed history)
                 ├─ provider.toolCall() Layer 6: model decides tools or answers direct
                 ├─ registry.executeTool()   ← the ONE gate every tool call passes:
                 │     ├─ safety-level confirmation check
                 │     ├─ input schema validation
                 │     ├─ permission check (role)
                 │     ├─ handler execution (mock service today, real Part 1-11
                 │     │   service in production)
                 │     ├─ entity-scope filtering (tenant + department + self)
                 │     ├─ field minimization (strip PII by default)
                 │     └─ audit log entry
                 ├─ responseComposer.js  Answer / Evidence / Interpretation /
                 │                       Recommendation, with uncertainty surfaced
                 └─ session.js           assistant message persisted
```

For actions: `proposeAction()` → preview → `confirmAction()` → `registry.executeTool(...,
{confirmed:true})` → idempotent result. See `src/orchestrator.js`.

## 2. Provider abstraction

`src/providers/providerInterface.js` defines `AIProvider` (`generate`, `stream`,
`structuredOutput`, `toolCall`). Three implementations exist:

- `anthropicProvider.js` — real Anthropic Messages API (tool_use/tool_result blocks).
- `groqProvider.js` — real Groq OpenAI-compatible chat completions + function calling.
- `mockProvider.js` — **development/test fixture only**; refuses to run when
  `AI_PROVIDER=mock` and `NODE_ENV=production` (enforced in `config.js`, not just
  documented).

No file outside `providers/modelRouter.js` imports a concrete provider class or a
literal model name. Swapping providers or models is an environment-variable change.

## 3. Tool catalog

39 tools are registered across 12 categories in `src/tools/*.tools.js` (see
`module.manifest.json` for the count and `PART12_FINAL_REPORT.md` section G for the
full list against the ~150 tools the spec names). Each tool declares `permissions`,
`safetyLevel`, `scopeMode`, and an `inputSchema` — the registry enforces all four
before a handler ever runs; nothing about permission or safety is left to the model's
judgment (spec section 44).

## 4. Swapping in the real Part 1–11 services

Every tool handler calls into `src/services/mockServices.js`, which is organized
exactly like a set of Part 1-11 service modules would be (`students.*`,
`drives.*`, `interviews.*`, ...). To integrate for real:

1. Implement the same function signatures against the real Part 1-11 services —
   e.g. `drives.health({ institutionId, driveId })` should end up calling Part 3's
   drive service and Part 4's application service instead of `mockData.js`.
2. Delete `src/services/mockData.js` and `mockServices.js` mock implementation
   bodies; keep the function signatures.
3. Nothing in `src/tools/*.tools.js`, `registry.js`, `orchestrator.js`, or
   `responseComposer.js` needs to change — they only ever call the service functions
   by name, never touch mock data directly.
4. Wire `resolveEntity` (passed into `AIPlacementOfficer`) to real, permission-checked
   entity lookups so `buildContext()` in `session.js` can validate client-supplied
   `entityRefs` (current student/drive/etc. on screen) against the real database
   instead of trusting them.
5. Replace `createInMemorySessionStore()` with a real `ai_session`/`ai_message` table
   implementation matching the same five-method interface.
6. Replace `createAuditLog()`'s in-memory array with a durable, write-once sink.

## 5. Permission model

Four roles (`src/security/permissionGuard.js`): `TPO_ADMIN`, `DEPT_COORDINATOR`,
`MANAGEMENT`, `STUDENT`. **No recruiter role exists anywhere in this codebase** —
verified by `tests/permissionGuard.test.js`, not just asserted in prose (spec
sections 2, 15, 75).

- Tool-level: each tool's `permissions` array is checked before the handler runs.
- Entity-level: `checkEntityScope` enforces institution isolation on every entity a
  handler returns, plus department scope for `DEPT_COORDINATOR` and self-scope for
  `STUDENT`.
- Field-level: `minimizeFields` strips phone/email/address/salary/documents/IDs from
  every tool result unless a tool explicitly opts in AND the caller is `TPO_ADMIN`.
- A Department Coordinator's `department` filter is **forced** server-side
  (`tools/shared.js#scopedDept`), never taken from the request — a coordinator asking
  for another department gets their own department's data back, not an error and not
  the other department's data.

## 6. Evidence, uncertainty, and missing-data handling

Every tool result is wrapped as `{ success, data, source: { module, tool,
generated_at } }` (spec section 26). `responseComposer.js` surfaces three cases
explicitly rather than papering over them:

- **Tool failure** → the composer says so and does not guess.
- **Entity not found** → services return `null`; composer says "I couldn't find X."
- **Partial data** → e.g. `get_training_effectiveness` explicitly reports when
  fewer students have assessment data than completed the program, and scopes any
  improvement figure to only the assessed subset (spec section 31's own worked
  example, reproduced exactly by the mock dataset).

## 7. Action safety and idempotency

Five levels (`src/security/actionSafety.js`, spec section 66): `READ`(0), `PREPARE`(1),
`LOW_RISK_WRITE`(2), `SENSITIVE_WRITE`(3), `HIGH_RISK`(4). `registry.executeTool`
refuses to run a tool at level ≥2 (by default policy) unless called with
`{confirmed:true}`, which only `actionSafety.confirmAction` ever passes — there is no
other path to a confirmed execution. Confirming the same proposal twice replays the
cached result instead of re-executing (spec section 90); this was verified with a
literal double-confirm in `tests/actionConfirmation.test.js` and in the demo script.

## 8. Prompt/tool-output injection defense

Two layers (`src/security/promptInjectionDefense.js`):

1. **Structural** — any field originating outside the backend's own system rules is
   wrapped as `{ type: 'untrusted_data', label, content }` before it can reach a
   provider call, and a fixed system-prompt clause (`buildSystemGuard()`) is appended
   to every turn stating that such content is data, never instructions. This is the
   "spotlighting" pattern used across current agent-security guidance (see
   `PART12_RESEARCH_UPGRADE.md`).
2. **Heuristic** — `scanForInjectionSignals` flags common override phrasing for the
   audit log only; it is never used to silently block content, because pattern
   matching is trivially evaded and treating it as a real control would be false
   confidence.

## 9. Events and audit

`src/security/auditLog.js` implements the full event contract from spec section 96
(`AI_SESSION_CREATED` … `AI_PERMISSION_DENIED`) as an append-only, in-memory log with
field minimization applied before anything is written. In production this becomes a
durable, write-once store (see `PART12_HOSTILE_REVIEW.md`, finding OPS-1) — the
`record()`/`list()` interface would not need to change.

## 10. Known simplifications (see truth table for the full list)

- The tool-call loop supports multiple rounds architecturally, but `mockProvider`
  only ever plans one round (it can't reason about intermediate results — a real
  model can, and the same orchestrator code path already supports it).
- No `LOW_RISK_WRITE` (level 2) tool was implemented in this pass, so that branch of
  `requiresConfirmation()` is exercised by unit test but not by the demo.
- Streaming (`provider.stream()`) falls back to a single non-streamed call in both
  real provider implementations.
- HTTP layer (`src/server.js`) is a thin, dependency-free reference implementation
  covering the five routes in `module.manifest.json` — it was started and exercised
  live over `localhost` during this build (see `PART12_FINAL_REPORT.md` section AC),
  not just written.

## 11. Integration with Parts 13–15

The build prompt names Parts 13–15 as forthcoming but this session had no text for
them beyond passing references (Part 14 = "autonomous action layer", section 95).
The design choices most likely to matter for that integration:

- **Part 14 (autonomous actions)**: the `ActionSafety` propose/confirm/idempotency
  machinery is already the general-purpose action framework, not a one-off for
  `send_message` — a new autonomous-trigger layer should call
  `AIPlacementOfficer.proposeAction`/`confirmAction` (or a policy-driven
  auto-confirm wrapper around them) rather than building a second execution path,
  per spec section 95's explicit instruction not to duplicate the action framework.
- **Part 13 / 15**: whatever they cover, new tools register into the same
  `ToolRegistry` via `registerTool()` and inherit permission/schema/audit/safety
  handling automatically — no orchestrator change is anticipated for adding tools.
