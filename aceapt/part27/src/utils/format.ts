import type { ForecastRange } from "../domain/types.js";

export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

export function round(n: number): number {
  return Math.round(n);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Always an integer percent — never fake precision like "79.284%" (spec section 17). */
export function formatPercent(n: number): string {
  return `${round(clamp(n))}%`;
}

export function formatRange(r: ForecastRange): string {
  return `${round(clamp(r.low))}\u2013${round(clamp(r.high))}%`;
}

/**
 * Blocks unsupported employment/placement claims from ever reaching a student
 * (spec sections 19 & 70 are explicit and repeated: Feature 27 predicts
 * measurable capability readiness, never "you'll get placed" / "X% chance of
 * a job" / "you'll clear <company>"). This is applied to any AI-generated
 * narrative before it's shown — see engines/explanationEngine.ts — as a
 * defense-in-depth check on top of the prompt instructions given to the model.
 */
const BANNED_EMPLOYMENT_PATTERNS: RegExp[] = [
  /\bplac(ed|ement)\b.{0,25}\b(job|company|offer|role)\b/i,
  /\b(job|company|offer|role)\b.{0,25}\bplac(ed|ement)\b/i,
  /\bchance of (getting|being) (hired|placed|selected)\b/i,
  /\bwill (get|land|clear|crack|pass)\b.{0,20}\b(job|offer|interview|placement)\b/i,
  // Catches "you will clear/crack <Company>" even when no generic noun like
  // "job"/"offer" appears — this is the spec's own explicit example ("You
  // will clear TCS."). Heuristic (proper-noun shaped token after the verb),
  // so it may over-trigger on rare unrelated phrasing — that's an acceptable
  // trade-off for a fallback safety guard, since a false positive just means
  // falling back to the deterministic explanation, never a broken response.
  /\bwill (clear|crack)\b\s+[A-Z]/,
  /\bguarantee[ds]?\b.{0,20}\b(job|placement|offer|selection|hire)\b/i,
  /%\s*chance of (placement|being placed|getting placed|selection|getting hired)/i,
  /\byou('ll| will) be hired\b/i,
];

export class EmploymentClaimError extends Error {
  constructor(matchedText: string) {
    super(`Generated text contains an unsupported employment/placement claim: "${matchedText}"`);
    this.name = "EmploymentClaimError";
  }
}

/** Throws EmploymentClaimError if the text asserts an employment/placement
 * outcome. Feature 27 only ever speaks in terms of capability/assessment
 * readiness (section 19) — this is enforced in code, not just prompted for. */
export function guardAgainstEmploymentClaims(text: string): void {
  for (const pattern of BANNED_EMPLOYMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      throw new EmploymentClaimError(match[0]);
    }
  }
}
