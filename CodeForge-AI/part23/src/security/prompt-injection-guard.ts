// ============================================================================
// Prompt injection defense (Section 43)
// ============================================================================
// Source code, comments, variable names, hypotheses, debugging notes, and
// project descriptions are all untrusted content. This module:
//   1. Wraps untrusted text in explicit delimiters for inclusion in a prompt
//      (paired with a system-level instruction — see ai/prompts.ts — that
//      content between these delimiters is DATA, never a new instruction).
//   2. Flags (never silently strips) content that looks like an injection
//      attempt, so callers can log / rate-limit / refuse as appropriate,
//      without false-positiving on ordinary debugging text.
// ============================================================================

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the) (previous|prior|above) instructions?/i,
  /disregard (all|any|the) (previous|prior|above) (instructions?|rules?)/i,
  /\byou are now\b/i,
  /reveal (the )?(hidden|secret) (test|tests|solution|answer)/i,
  /show (me )?(the )?(reference|hidden) solution/i,
  /\bsystem prompt\b/i,
  /act as (an?|the) (dan|jailbreak)/i,
  /\bsudo\b[^.]{0,20}\b(mode|override)\b/i,
  /forget (your|all) (instructions|rules|guidelines)/i,
  /print (your|the) (system|instructions)/i,
  /new instructions?:/i,
];

export interface InjectionScanResult {
  suspicious: boolean;
  matchedPatterns: string[];
}

export function scanForInjection(text: string): InjectionScanResult {
  const matched: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) matched.push(pattern.source);
  }
  return { suspicious: matched.length > 0, matchedPatterns: matched };
}

/** Wraps untrusted content with explicit, hard-to-spoof delimiters for prompt inclusion. */
export function wrapUntrusted(label: string, content: string): string {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_");
  return [`<untrusted-${safeLabel}>`, content, `</untrusted-${safeLabel}>`].join("\n");
}

export interface GuardedInput {
  wrapped: string;
  scan: InjectionScanResult;
}

/** Convenience: scan + wrap in one call for any single piece of student-authored text. */
export function guardStudentText(label: string, content: string): GuardedInput {
  return { wrapped: wrapUntrusted(label, content), scan: scanForInjection(content) };
}
