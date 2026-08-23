/**
 * Defense against prompt injection, action injection, and confirmation spoofing
 * (spec sections 65-67).
 *
 * The architectural defense is NOT "detect and strip bad text" — that is only a
 * secondary, defense-in-depth measure applied here for display purposes. The real
 * defense is structural:
 *
 *  1. Retrieved/imported text (a JD, a student note, a spreadsheet cell, a document,
 *     a tool result) is NEVER parsed by the action engine as an instruction. It can
 *     only ever land inside a typed `input` field of an action whose schema, risk
 *     level, permission checks and policy checks are fixed by the action's
 *     registered definition (registry/actionRegistry.ts) — never by the content
 *     itself (section 66: "Only the authorized user intent plus approved action
 *     schema can initiate actions").
 *
 *  2. The ONLY way an action reaches CONFIRMED is `ActionEngine.confirmAction()`,
 *     which is only reachable from an authenticated user session / approved API
 *     flow (Part 12's UI confirm button, or an equivalent authenticated API call).
 *     No code path anywhere lets a string like "Confirmed." found in a document,
 *     tool result, or model output move an action's status. Grep the engine: the
 *     word "CONFIRMED" only ever appears as a status literal assigned inside
 *     confirmAction() (section 67).
 *
 * This module's `containsSuspiciousDirective` / `wrapUntrustedText` helpers exist
 * only to make injected directive-like text visibly inert when it is echoed back
 * into a human-facing preview (e.g. quoting a JD inside a drafted message) — they
 * are not what prevents the injection from taking effect.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the)? ?previous instructions/i,
  /you are now/i,
  /disregard (the )?(above|prior|previous) (policy|rules|instructions)/i,
  /system\s*:/i,
  /\bconfirmed\b.{0,20}\bexecute\b/i,
  /\bapprove(d)?\b.{0,20}\ball\b/i,
  /send (this|the) (confidential|private) data/i,
];

export function containsSuspiciousDirective(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

/**
 * Wrap externally-sourced text before it is echoed into a human preview, labeling
 * it as untrusted data. This never grants the text any authority — it purely
 * improves human legibility of what the AI is quoting versus authoring.
 */
export function wrapUntrustedText(label: string, text: string): string {
  const flagged = containsSuspiciousDirective(text);
  const tag = flagged ? `${label} — CONTAINS DIRECTIVE-LIKE TEXT, TREATED AS INERT DATA` : label;
  return `[${tag}] ${text}`;
}
