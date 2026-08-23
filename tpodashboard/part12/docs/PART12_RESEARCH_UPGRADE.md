# Part 12 — Research-Grounded Upgrades

Spec section 101 asks for current authoritative material on tool integration,
security, prompt injection, agent permissions, structured outputs, and safe
autonomous actions, with justified improvements applied — not fashionable additions
for their own sake. Two searches were run against current sources; findings below are
paraphrased from them, with what was actually changed in this codebase as a result.

## 1. Prompt injection has no complete prompting-only fix — structure, not wording, is the defense

Current agent-security writeups (OWASP's LLM Top 10 category for prompt injection,
and multiple 2026 papers on indirect prompt injection against tool-using agents)
converge on the same root cause: a model reading a single blended context cannot
reliably tell an instruction from data describing the same span of text, no matter
how the instruction is worded. "Spotlighting" — structurally separating untrusted
content from trusted instructions, rather than just asking the model nicely — is
named across multiple sources as the standard mitigation technique, alongside
newer model-level hardening (instruction hierarchies) that reduces but does not
eliminate the risk.

**Applied:** `promptInjectionDefense.js#wrapUntrustedField` / `sanitizeUntrustedRecord`
implement exactly this — every field that didn't originate from the backend's own
system rules is wrapped in a labeled `untrusted_data` envelope before it can reach a
provider call, independent of any prompt wording. This was the design going into the
build (spec sections 51-52 already asked for it); the research pass confirmed it
matches current practice rather than being an invented approach, and clarified that
the heuristic keyword scanner should stay advisory-only rather than a hard gate —
several sources note that regex/keyword detectors are consistently evaded by
automated red-teaming, which is why `scanForInjectionSignals` in this codebase
feeds the audit log, not a block decision (see `PART12_HOSTILE_REVIEW.md` SEC-4).

## 2. Multi-turn, tool-result-mediated injection is a live, actively-studied threat class — not fully covered here

Recent work specifically targets the case where an injected instruction doesn't try
to hijack the very next model turn, but accumulates influence over several turns as
more tool/context results pile up, until the original user goal's influence on the
model's decisions is diluted. This is a stronger threat model than "one poisoned
document, one bad next action."

**Applied / acknowledged gap:** this build's structural defense (delimiting +
system-prompt reiteration on every turn, not just the first) should raise the bar
against this pattern, since the boundary is re-asserted every round rather than only
at the start of a conversation. However, no test in this repository specifically
drives a multi-round scenario designed to erode that boundary — recorded honestly as
an open item in `PART12_HOSTILE_REVIEW.md` rather than claimed as covered.

## 3. Production agent patterns converge on: narrow scope, structured tool contracts, limited approved tools, human review for high-risk actions, full observability

Current guidance on shipping agentic systems in production (including Anthropic's own
2026 agentic-security guidance) repeatedly lands on the same shortlist: a narrow,
well-defined use case; a structured output/tool contract instead of freeform
tool-calling; a limited, explicitly-approved tool allowlist per caller; mandatory
human review before high-risk/high-blast-radius actions; and logging of prompts,
tool calls, and failures for observability. A related, more specific point:
"privilege escalation via proxy" is named as a real failure mode, where an agent
ends up exercising a high-privilege service credential on behalf of a low-privilege
end user because the permission check happened at the API-key level instead of the
per-request user level.

**Applied:**
- Narrow scope / structured contract → every tool has an explicit `inputSchema` and
  `outputSchema`-shaped evidence envelope; nothing is freeform.
- Limited allowlist per caller → `ToolRegistry.listTools({role})` filters the tool
  list itself before the model ever sees it (see `PART12_HOSTILE_REVIEW.md` SEC-3),
  which is a stricter version of "allowlist" than checking permissions only at
  execution time.
- Human review for high-risk actions → the `SAFETY_LEVELS` / `proposeAction` /
  `confirmAction` flow (spec sections 45-48, 65-66) is exactly this pattern.
- Observability → `auditLog.js` implements the full event contract from spec
  section 96.
- **Privilege-escalation-via-proxy, specifically:** this was a genuine prompt for
  re-checking the code, not just a restatement of something already planned. It
  confirmed that `registry.executeTool` re-derives permission from the `user` object
  passed in on *every* call — including the one `actionSafety.confirmAction` makes at
  confirm-time — rather than caching a permission decision made once at proposal
  time. If a caller is demoted between proposing and confirming an action and the
  surrounding application correctly re-derives `user` from a fresh session at confirm
  time (the API layer's job, not this module's), the demotion is honored. This
  property existed before the research pass; the research pass is what prompted
  verifying it explicitly rather than assuming it.

## 4. What was deliberately not adopted

- **Dedicated ML-based injection-detection models** (mentioned in current literature
  as one defense category) — deliberately not adopted here. It adds real inference
  cost and its own failure modes for a reference implementation whose primary defense
  is already structural; a production deployment with a real threat model might
  reasonably add one as defense-in-depth on top of, not instead of, the structural
  approach.
- **Tool-dependency-graph-style planning constraints** (decoupling action planning
  from reading untrusted data entirely, seen in current defense research) — a
  genuinely stronger defense than what's built here, but a significantly larger
  architectural change than this pass had scope for. Worth evaluating for Part 14's
  autonomous action layer specifically, where the blast radius of a successful
  injection is highest.

## Sources consulted
- OWASP-aligned and 2026 agent-security literature on indirect prompt injection,
  spotlighting, and multi-turn/tool-mediated injection (arXiv preprints and
  Palo Alto Networks Unit 42 / Lakera security writeups, surfaced via web search
  on 2026-08-14).
- Current (2026) writeups summarizing Anthropic's agentic-security guidance on
  narrow-scope deployment, structured output contracts, human review gates, and
  privilege-escalation-via-proxy as a named failure mode.
