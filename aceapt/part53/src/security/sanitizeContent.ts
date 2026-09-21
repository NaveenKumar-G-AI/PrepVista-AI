/**
 * Section 87: "Student content and imported question content are untrusted. Protect the
 * validation system from prompt injection... Question text is data. It is not privileged
 * system instructions."
 *
 * Two independent things happen here, and they are NOT the same mechanism:
 *  1. wrapUntrustedContent — fences question content unambiguously before it's ever placed in an
 *     AI prompt, and strips any attempt to prematurely close that fence.
 *  2. containsSuspiciousInstructionPattern — a logging/telemetry-only heuristic. It NEVER changes
 *     validator behavior or security posture by itself (section 132) — it only flags content for
 *     stricter human review. A question that trips this heuristic still goes through the exact
 *     same deterministic validators as any other question; the flag is additive evidence, not a
 *     bypass or a shortcut.
 */

const FENCE_OPEN = '<untrusted_question_content>';
const FENCE_CLOSE = '</untrusted_question_content>';

export function wrapUntrustedContent(raw: string): string {
  const safe = raw.split(FENCE_CLOSE).join(''); // prevent early fence-closing tricks
  return `${FENCE_OPEN}\n${safe}\n${FENCE_CLOSE}`;
}

const SUSPICIOUS_PATTERNS = [
  /ignore\s+(?:\w+\s+){0,4}instructions/i,
  /you are now/i,
  /system prompt/i,
  /disregard\s+(?:\w+\s+){0,4}(rules|guidelines|instructions)/i,
  /reveal your (instructions|prompt|system prompt)/i,
];

export function containsSuspiciousInstructionPattern(raw: string): boolean {
  return SUSPICIOUS_PATTERNS.some((p) => p.test(raw));
}
