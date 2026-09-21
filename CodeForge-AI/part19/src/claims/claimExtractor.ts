import type { Claim, ClaimType, ClaimImportance, Result } from "../types.js";
import type { AIProvider } from "../ai/provider.js";

interface PatternRule {
  claimType: ClaimType;
  importance: ClaimImportance;
  regex: RegExp;
}

// Rule-based first pass. Deliberately conservative: each rule matches a
// concrete technical marker (a Big-O token, a named data structure, an
// algorithm keyword), not just "sounds technical". This runs with zero AI
// calls, so the extractor never *needs* a live key to produce claims.
const RULES: PatternRule[] = [
  { claimType: "COMPLEXITY", importance: "CORE", regex: /\bO\(\s*[^)]{1,20}\)|linear time|quadratic time|constant time|logarithmic time|exponential time/i },
  { claimType: "SPACE_COMPLEXITY", importance: "IMPORTANT", regex: /\b(auxiliary|extra|additional)\s+(space|memory)\b|space complexity/i },
  { claimType: "ALGORITHM", importance: "CORE", regex: /two[- ]pointer|sliding window|binary search|hash(ing|-?map|-?table|-?set)?|dictionary|\bsort(ing)?\b|\bBFS\b|\bDFS\b|backtrack|greedy|dynamic programming|\bDP\b|recursion|recursiv(e|ely)|divide and conquer|brute[- ]force|linear scan/i },
  { claimType: "DATA_STRUCTURE", importance: "IMPORTANT", regex: /\b(array|hash ?map|hash ?set|\bmap\b|dictionary|\bset\b|stack|queue|heap|\btree\b|\bgraph\b|linked list)\b/i },
  { claimType: "EDGE_CASE", importance: "SUPPORTING", regex: /\bempty\b|edge case|\bnull\b|\bnone\b|single element|duplicate|negative|boundary|out of bounds/i },
  { claimType: "CONTROL_FLOW", importance: "SUPPORTING", regex: /\bloop\b|iterat(e|ion|ing)|\bwhile\b|for each|each element|recursively calls/i },
  { claimType: "IMPLEMENTATION_DECISION", importance: "IMPORTANT", regex: /\bI (chose|used|decided|picked|opted)\b|because I need(ed)?/i },
  { claimType: "CORRECTNESS", importance: "IMPORTANT", regex: /\bensures?\b|guarantee(s)?|\binvariant\b|correctly|correctness|works? (when|because)/i },
  { claimType: "OPTIMIZATION", importance: "SUPPORTING", regex: /optimi[sz](e|ation|ed)|improves? efficiency|reduces? complexity|faster|avoids? (rescanning|repeated)/i },
];

const GENERIC_PHRASES = [
  /optimal approach/i,
  /improves? efficiency/i,
  /reduces? complexity/i,
  /uses? a data structure/i,
  /handles? edge cases/i,
];
// A concrete marker that, if present in the SAME sentence, means the vague
// phrase is actually backed by something specific (a name, a Big-O token).
const CONCRETE_MARKER = /\bO\([^)]*\)|hash ?map|hash ?set|\barray\b|\bstack\b|\bqueue\b|\bheap\b|\btree\b|\bgraph\b|binary search|sliding window|two[- ]pointer/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

let counter = 0;
function nextClaimId(): string {
  counter += 1;
  return `claim_${Date.now().toString(36)}_${counter}`;
}

/** Deterministic rule-based extraction — no AI, always available. */
export function extractClaimsRuleBased(reasoningText: string): Claim[] {
  const sentences = splitSentences(reasoningText);
  const claims: Claim[] = [];

  for (const sentence of sentences) {
    for (const rule of RULES) {
      if (rule.regex.test(sentence)) {
        const isGeneric = GENERIC_PHRASES.some((p) => p.test(sentence)) && !CONCRETE_MARKER.test(sentence);
        claims.push({
          claimId: nextClaimId(),
          claimType: rule.claimType,
          originalText: sentence,
          normalizedMeaning: sentence.trim(),
          importance: rule.importance,
          confidence: isGeneric ? 0.5 : 0.8,
          isGeneric,
        });
      }
    }
  }
  return claims;
}

export interface ExtractClaimsInput {
  reasoningText: string;
  aiProvider: AIProvider;
}

/**
 * Full extraction pipeline: rule-based pass first (deterministic, always
 * runs), then an optional AI-assisted refinement pass. If the AI call fails
 * or returns an invalid shape, the pipeline degrades gracefully to the
 * rule-based claims rather than failing the whole request — a claim that
 * regex found is still a real claim even if the semantic layer is down.
 */
export async function extractClaims(input: ExtractClaimsInput): Promise<Result<{ claims: Claim[]; aiAssisted: boolean }>> {
  const trimmed = input.reasoningText?.trim() ?? "";
  if (!trimmed) {
    return { ok: false, reason: "NO_REASONING", message: "No reasoning text was submitted." };
  }

  const ruleBasedHints = extractClaimsRuleBased(trimmed);

  const aiResult = await input.aiProvider.extractClaims({ reasoningText: trimmed, ruleBasedHints });
  if (!aiResult.ok) {
    // Graceful degradation — documented, not silent: aiAssisted:false tells
    // the caller (and the report's confidence banding) that only the
    // deterministic pass ran.
    return { ok: true, value: { claims: ruleBasedHints, aiAssisted: false } };
  }
  return { ok: true, value: { claims: aiResult.value.claims, aiAssisted: true } };
}
