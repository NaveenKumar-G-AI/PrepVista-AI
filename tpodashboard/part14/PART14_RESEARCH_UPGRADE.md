# PART14_RESEARCH_UPGRADE.md

Research pass against current (2025-2026) authoritative guidance on agentic
action safety, tool authorization, idempotency, and prompt injection, and the
concrete changes made to this implementation as a result.

## 1. OWASP Top 10 for LLM Applications (2025 edition)

The 2025 edition keeps **LLM01: Prompt Injection** at the top of the list and
substantially expands **LLM06: Excessive Agency**, reflecting the shift from
LLMs answering questions to LLMs calling tools, sending messages, and making
decisions. The core idea behind LLM06 is straightforward: <cite index="5-1">handing an agent more tools, wider permissions, or the freedom to act without a human checking in than its job actually calls for is what turns it into an attack surface in the first place</cite>. OWASP's countermeasures follow directly from that: <cite index="3-1">keep each integration's capabilities and access as narrow as the task allows, and put a mandatory human checkpoint in front of anything with real-world consequences, like sending a message or running a command</cite>.

**How this maps onto Part 14, and what changed:**
- *Narrow, fixed tool surface* — this was already the design (action registry,
  section 43-44 of the spec), and the research pass reaffirmed it rather than
  changing it: `ActionRegistry` is the only source of callable actions, and
  each one declares its own schema, permission check, and risk level. There is
  no generic "run this tool" escape hatch.
- *Mandatory human approval for high-impact actions* — already implemented via
  `confirmationRequired` for `SENSITIVE_WRITE`/`HIGH_RISK`, which is
  unconditional and cannot be overridden by institution policy or automation
  config (`policyGuard.confirmationRequired`). The automation-engine test
  suite (`tests/automation.test.ts`) specifically proves a misconfigured
  `PRE_APPROVED` rule cannot bypass this for a sensitive action.
- **Change made:** one of OWASP's prompt-injection mitigations is essentially
  a labeling discipline — <cite index="6-1">keep untrusted material visually and structurally set apart so it can't quietly steer the conversation</cite>. That's what motivated `security/sanitize.ts`'s `wrapUntrustedText`, which now labels any externally-sourced text (a JD, a drive notice, a document) before it is echoed into a human-facing preview, so a reviewer can visually distinguish "the AI is quoting this" from "the AI is asserting this."

OWASP's own framing is also a useful caution against overclaiming: because of <cite index="6-1">the inherently probabilistic way these models work, nobody has a guaranteed way to block prompt injection outright</cite>. That is why this implementation does not rely on text-pattern detection as its actual defense — `containsSuspiciousDirective` is explicitly documented as *display-only*, defense-in-depth. The real defense is structural: no code path lets any string content, from any source, substitute for an authenticated `confirmAction()` call. This is consistent with recent adversarial research on indirect prompt injection in agentic tool-use settings, which finds attack success climbs steeply with the number of attempts an agent is allowed against a target — reinforcing that per-request text filtering alone is not a sufficient control and the state machine itself must be the backstop.

## 2. Idempotency key design (Stripe's pattern, the closest thing to an industry standard)

There is no ratified IETF standard for idempotency keys — <cite index="17-1">a draft specification for an idempotency-key header circulated in the httpapi working group but lapsed before ever reaching RFC status</cite> — but Stripe's approach is the de facto reference implementation. Two points from it informed this build:

- **Retention window.** Stripe's own documentation notes that <cite index="16-1">keys age out of their system on a rolling 24-hour basis, and a key reused after it's been pruned is simply treated as a brand-new request</cite>. The in-memory `IdempotencyRepository` in this reference build has no eviction (acceptable for a demo process lifetime), but `PART14_INTEGRATION.md` now calls this out explicitly as a required production change: back it with a table indexed on `(institution_id, idempotency_key)` with a TTL job, sized to comfortably exceed realistic client retry windows.
- **What gets cached.** <cite index="18-1">Stripe records whatever came back from the very first call under a given key — success or error alike — and simply replays that same recorded outcome for every later call using that key</cite>. This implementation deliberately does **not** follow that part of the pattern: `ActionEngine.executeAction` only writes to `idempotencyRepo` on a definitively observed outcome from the underlying service (`SUCCEEDED`/`PARTIALLY_SUCCEEDED`/a result with a `detail`), not on an engine-level exception. The reasoning: our `execute()` calls are synchronous stand-ins with no partial/ambiguous failure mode, so it's safer to let a genuinely failed attempt (e.g. a transient service exception) be retried outright rather than freeze in a failure state. **Flagged as a required design decision for the real Part 9/7/5/6 integrations**: if the real provider call can fail in an *ambiguous* way (timeout after the message may or may not have sent), the underlying service — not just this engine — needs its own idempotency key handling exactly like Stripe's, because from the engine's point of view a thrown exception and "sent-but-we-didn't-hear-back" look identical. `communicationService.ts` and `trainingService.ts` already include a second idempotency check inside the stub service itself for exactly this reason, as defense in depth.

## 3. Human-in-the-loop as a structural property, not a UX suggestion

The unifying theme across the OWASP LLM06 guidance and the indirect-injection research is that "ask the human" only works as a security control if the approval step is unconditionally reachable and unconditionally required for the actions that need it — not a default the model can talk its way around. Concretely, this shows up in the implementation as:

- `confirmationRequired` for `SENSITIVE_WRITE`/`HIGH_RISK` is computed in `policyGuard.ts` and is **not** one of the fields an `ActionDefinition` can override away — `confirmationOverride` can only be used by an action to make itself *more* conservative, never less (no action in the catalog uses it to skip confirmation for a sensitive/high-risk action).
- The automation rule engine can only reach autonomous execution through the same `ActionEngine.executeAction` path a human uses, so it inherits every guard rather than bypassing them (verified in `tests/automation.test.ts`).

## 4. Net changes made after this research pass

1. Added `wrapUntrustedText` labeling of externally-sourced text in previews (`security/sanitize.ts`, used in `prepareApplicationReminder.ts`).
2. Documented (in `PART14_INTEGRATION.md`) the production requirement for a bounded-retention, indexed idempotency table rather than the in-memory map used here.
3. Documented the deliberate divergence from Stripe's "cache failures too" pattern, and pushed the ambiguous-failure case down to the underlying Part 9/7 service stubs, where it actually belongs once those become real network calls.
4. Confirmed (no change needed) that the fixed action registry and unconditional confirmation gate already satisfy OWASP's core LLM06 mitigations — this was a validation of the original design against current guidance, not a gap.

## Sources consulted
- OWASP Top 10 for LLM Applications, 2025 edition — prompt injection and excessive agency entries.
- Stripe: idempotency key documentation and engineering blog on designing idempotent APIs.
- Recent (2026) academic work on indirect prompt injection attack success rates in agentic tool-use settings, cited via arXiv preprints found during this search pass.
