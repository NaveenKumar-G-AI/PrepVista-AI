import type { Claim, ClaimVerification, Evidence, EvidenceStrength, VerificationStatus, ProblemSpec } from "../types.js";
import type { AstFacts } from "../analysis/astAnalyzer.js";
import { detectPatterns, normalizeAlgorithmClaim, type DetectedPattern, type CanonicalPattern } from "../analysis/patternDetector.js";
import type { ComplexityEstimate } from "../analysis/complexityEstimator.js";
import type { AIProvider } from "../ai/provider.js";

export interface VerifierContext {
  facts: AstFacts;
  patterns: DetectedPattern[];
  complexity: ComplexityEstimate;
  problem?: ProblemSpec;
  aiProvider: AIProvider;
}

function verification(claimId: string, status: VerificationStatus, confidence: number, evidence: Evidence[], explanation: string): ClaimVerification {
  return { claimId, status, confidence: Math.max(0, Math.min(1, confidence)), evidence, explanation };
}

// ── ALGORITHM ───────────────────────────────────────────────────────────

export function verifyAlgorithmClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  const target = normalizeAlgorithmClaim(claim.originalText);
  if (!target) {
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "Could not map this claim's wording to a recognized algorithm category from text alone.");
  }
  const match = ctx.patterns.find((p) => p.pattern === target);
  if (match) {
    return verification(claim.claimId, "SUPPORTED", strengthToConfidence(match.confidence), [
      { evidenceType: "AST_EVIDENCE", strength: match.confidence, description: match.rationale, sourceLocation: match.location },
    ], `The implementation matches the claimed "${target}" pattern.`);
  }
  if (ctx.patterns.length > 0) {
    const best = ctx.patterns[0]!;
    return verification(claim.claimId, "CONTRADICTED", strengthToConfidence(best.confidence), [
      { evidenceType: "AST_EVIDENCE", strength: best.confidence, description: best.rationale, sourceLocation: best.location },
    ], `The claim describes "${target}", but the strongest evidence in the implementation points to "${best.pattern}" instead.`);
  }
  return verification(claim.claimId, "UNVERIFIED", 0.3, [], `Claimed "${target}", but no confident structural pattern was detected either way.`);
}

// ── DATA_STRUCTURE / IMPLEMENTATION_DECISION ────────────────────────────

const KIND_SYNONYMS: Array<[string, "Map" | "Set" | "Array" | "Object"]> = [
  ["hash map", "Map"],
  ["hashmap", "Map"],
  ["hash table", "Map"],
  ["dictionary", "Map"],
  ["hash set", "Set"],
  ["array", "Array"],
  ["list", "Array"],
  ["object", "Object"],
  ["map", "Map"],
  ["set", "Set"],
];

function claimedKind(text: string): "Map" | "Set" | "Array" | "Object" | null {
  const lower = text.toLowerCase();
  for (const [phrase, kind] of KIND_SYNONYMS) {
    if (lower.includes(phrase)) return kind;
  }
  return null;
}

const PURPOSE_OPS: Record<string, string[]> = {
  lookup: ["has", "get"],
  membership: ["has"],
  check: ["has"],
};

export function verifyDataStructureClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  const kind = claimedKind(claim.originalText);
  const lowerText = claim.originalText.toLowerCase();

  // Stack / queue semantic claims map onto the bfs/dfs shape detectors.
  if (/\bstack\b/.test(lowerText)) {
    const dfs = ctx.patterns.find((p) => p.pattern === "dfs");
    if (dfs) return verification(claim.claimId, "SUPPORTED", strengthToConfidence(dfs.confidence), [{ evidenceType: "AST_EVIDENCE", strength: dfs.confidence, description: dfs.rationale, sourceLocation: dfs.location }], "A push+pop (LIFO) shape supports the stack claim.");
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "No push+pop (stack) usage shape was detected, but this claim type has partial detector coverage.");
  }
  if (/\bqueue\b/.test(lowerText)) {
    const bfs = ctx.patterns.find((p) => p.pattern === "bfs");
    if (bfs) return verification(claim.claimId, "SUPPORTED", strengthToConfidence(bfs.confidence), [{ evidenceType: "AST_EVIDENCE", strength: bfs.confidence, description: bfs.rationale, sourceLocation: bfs.location }], "A push+shift (FIFO) shape supports the queue claim.");
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "No push+shift (queue) usage shape was detected, but this claim type has partial detector coverage.");
  }
  if (/\btree\b|\bgraph\b|linked list/.test(lowerText)) {
    return verification(claim.claimId, "UNVERIFIED", 0.2, [], "This engine does not yet have a structural detector for this data structure — extend analysis/astAnalyzer.ts to cover it.");
  }

  if (!kind) {
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "Could not identify a specific data structure name in this claim.");
  }

  const direct = ctx.facts.dataStructures.find((d) => d.kind === kind);
  if (direct && direct.operations.length > 0) {
    const purposeNote = checkPurposeMatch(lowerText, direct.operations);
    return verification(
      claim.claimId,
      purposeNote.ok ? "SUPPORTED" : "PARTIALLY_SUPPORTED",
      purposeNote.ok ? 0.85 : 0.6,
      [{ evidenceType: "AST_EVIDENCE", strength: "STRONG", description: `${kind}${direct.variableName ? ` "${direct.variableName}"` : ""} is used with operations: ${direct.operations.join(", ")}.`, sourceLocation: direct.location }],
      purposeNote.ok ? `${kind} usage matches the claim.` : purposeNote.reason
    );
  }
  if (direct && direct.operations.length === 0) {
    return verification(claim.claimId, "PARTIALLY_SUPPORTED", 0.4, [{ evidenceType: "AST_EVIDENCE", strength: "WEAK", description: `${kind} is declared but no operations on it were detected.`, sourceLocation: direct.location }], `${kind} is declared but its usage couldn't be confirmed.`);
  }

  // Object-literal-as-hashmap nuance: claim says Map/dictionary, code uses a
  // populated Object literal instead — a legitimate JS idiom, not a mismatch.
  if (kind === "Map") {
    const obj = ctx.facts.dataStructures.find((d) => d.kind === "Object" && d.operations.length > 0);
    if (obj) {
      return verification(claim.claimId, "PARTIALLY_SUPPORTED", 0.55, [{ evidenceType: "AST_EVIDENCE", strength: "MODERATE", description: "A plain object literal is used with bracket-notation access, functioning like a hash map, though a native Map was not used.", sourceLocation: obj.location }], "An object literal is doing hashmap-like work; consider naming it that way explicitly next time.");
    }
  }

  // Positive evidence of a *different* concrete kind doing the main work.
  const otherPrimary = ctx.facts.dataStructures.find((d) => d.kind !== kind && d.operations.length > 0);
  if (otherPrimary) {
    return verification(claim.claimId, "CONTRADICTED", 0.6, [{ evidenceType: "AST_EVIDENCE", strength: "MODERATE", description: `A ${otherPrimary.kind} is the actively-used structure; no ${kind} usage was found.`, sourceLocation: otherPrimary.location }], `Claimed ${kind}, but the code's actively-used structure is a ${otherPrimary.kind}.`);
  }

  return verification(claim.claimId, "UNVERIFIED", 0.3, [], `No ${kind} usage was found, and no other structure was found to positively contradict the claim.`);
}

function checkPurposeMatch(lowerClaimText: string, actualOps: string[]): { ok: boolean; reason: string } {
  for (const [purposeWord, requiredOps] of Object.entries(PURPOSE_OPS)) {
    if (lowerClaimText.includes(purposeWord)) {
      const hasIt = requiredOps.some((op) => actualOps.includes(op));
      return hasIt
        ? { ok: true, reason: "" }
        : { ok: false, reason: `The claim describes ${purposeWord} use, but the recorded operations (${actualOps.join(", ")}) don't include a lookup-style call.` };
    }
  }
  return { ok: true, reason: "" };
}

export const verifyImplementationDecisionClaim = verifyDataStructureClaim;

// ── COMPLEXITY / SPACE_COMPLEXITY ───────────────────────────────────────

type ComplexityClass = "O(1)" | "O(log n)" | "O(n)" | "O(n log n)" | "O(n^2)" | "O(n^3)" | "O(2^n)" | "O(n!)";
const LADDER: ComplexityClass[] = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3)", "O(2^n)", "O(n!)"];

export function normalizeComplexityText(raw: string): ComplexityClass | null {
  let t = raw.toLowerCase().replace(/²/g, "^2").replace(/³/g, "^3").replace(/\s+/g, "");
  // A sentence can mention more than one O(...) term (e.g. "that lookup is
  // O(1), so the whole approach runs in O(n)") — the later mention is
  // usually the concluding, overall claim, so prefer the last match rather
  // than the first.
  const allMatches = t.match(/o\([^)]+\)/g);
  const bigO = allMatches ? [null, allMatches[allMatches.length - 1]!.slice(2, -1)] : null;
  if (bigO) {
    const inner = bigO[1]!;
    if (/^1$/.test(inner)) return "O(1)";
    if (/^log\(?n\)?$|^logn$/.test(inner)) return "O(log n)";
    if (/^n$/.test(inner)) return "O(n)";
    if (/^n\*?log\(?n\)?$|^nlogn$/.test(inner)) return "O(n log n)";
    if (/^n\^?2$|^n\*n$|^n2$/.test(inner)) return "O(n^2)";
    if (/^n\^?3$|^n\*n\*n$|^n3$/.test(inner)) return "O(n^3)";
    if (/^2\^?n$/.test(inner)) return "O(2^n)";
    if (/^n!$/.test(inner)) return "O(n!)";
    return null;
  }
  if (/constanttime/.test(t)) return "O(1)";
  if (/logarithmictime/.test(t)) return "O(log n)";
  if (/lineartime/.test(t)) return "O(n)";
  if (/quadratictime/.test(t)) return "O(n^2)";
  if (/cubictime/.test(t)) return "O(n^3)";
  if (/exponentialtime/.test(t)) return "O(2^n)";
  return null;
}

function strengthToConfidence(s: EvidenceStrength): number {
  return { DIRECT: 0.95, STRONG: 0.85, MODERATE: 0.65, WEAK: 0.4, INSUFFICIENT: 0.2 }[s];
}

function verifyComplexityLike(
  claim: Claim,
  actualClassText: string,
  actualStrength: EvidenceStrength,
  actualRationale: string,
  evidenceType: "COMPLEXITY_EVIDENCE"
): ClaimVerification {
  const claimed = normalizeComplexityText(claim.originalText);
  const actual = normalizeComplexityText(actualClassText) ?? (LADDER.includes(actualClassText as ComplexityClass) ? (actualClassText as ComplexityClass) : null);
  if (!claimed) {
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "Could not parse a specific complexity class from this claim's wording.");
  }
  if (!actual) {
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "The analyzed complexity class could not be normalized for comparison.");
  }
  const evidence: Evidence[] = [{ evidenceType, strength: actualStrength, description: `Analyzed: ${actualClassText}. ${actualRationale}`, sourceLocation: null }];
  if (claimed === actual) {
    return verification(claim.claimId, "SUPPORTED", strengthToConfidence(actualStrength), evidence, `Claimed ${claimed} matches the analyzed ${actual}.`);
  }
  const dist = Math.abs(LADDER.indexOf(claimed) - LADDER.indexOf(actual));
  if (dist === 1) {
    return verification(claim.claimId, "PARTIALLY_SUPPORTED", strengthToConfidence(actualStrength) * 0.7, evidence, `Claimed ${claimed}, analyzed ${actual} — a one-step difference on the growth-rate ladder, not a fundamental mismatch.`);
  }
  const severityNote = claim.importance === "CORE" || claim.importance === "IMPORTANT" ? "This is a significant mismatch." : "";
  return verification(claim.claimId, "CONTRADICTED", strengthToConfidence(actualStrength), evidence, `Claimed ${claimed}, but the analyzed complexity is ${actual}. ${severityNote}`.trim());
}

export function verifyComplexityClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  return verifyComplexityLike(claim, ctx.complexity.time, ctx.complexity.timeConfidence, ctx.complexity.rationale, "COMPLEXITY_EVIDENCE");
}

export function verifySpaceComplexityClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  return verifyComplexityLike(claim, ctx.complexity.space, ctx.complexity.spaceConfidence, ctx.complexity.rationale, "COMPLEXITY_EVIDENCE");
}

// ── EDGE_CASE ────────────────────────────────────────────────────────────
// Static-guard-based, positive-only: absence of a guard is not treated as a
// contradiction, since many correct solutions handle emptiness implicitly.
// Wire an ExecutionAdapter (adapters/adapters.ts) for a stronger, direct
// EXECUTION_EVIDENCE-backed version of this verifier.

export function verifyEdgeCaseClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  const lower = claim.originalText.toLowerCase();
  if (/\bempty\b/.test(lower)) {
    if (ctx.facts.emptyGuardLocations.length > 0) {
      const loc = ctx.facts.emptyGuardLocations[0]!;
      return verification(claim.claimId, "SUPPORTED", 0.6, [{ evidenceType: "AST_EVIDENCE", strength: "MODERATE", description: "An explicit guard clause checks for emptiness/absence.", sourceLocation: loc }], "An explicit guard supports the empty-input claim.");
    }
    return verification(claim.claimId, "UNVERIFIED", 0.35, [], "No explicit empty-input guard was found. This does not necessarily mean it's mishandled — wire an ExecutionAdapter to verify this claim directly against a real empty-input run instead of guessing from static shape alone.");
  }
  return verification(claim.claimId, "UNVERIFIED", 0.3, [], "This edge case has no matching static detector. Wire an ExecutionAdapter for direct, execution-backed edge-case verification.");
}

// ── CONTROL_FLOW ─────────────────────────────────────────────────────────

export function verifyControlFlowClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  const lower = claim.originalText.toLowerCase();
  const assertsSinglePass = /each element (is |gets )?(processed|visited|scanned|checked) once|single pass|one pass|only (loops?|iterates?) (through|over).*once|process(es|ed)? (it |the (array|input|list) )?once/.test(lower);
  if (assertsSinglePass) {
    if (ctx.facts.maxLoopDepth <= 1) {
      const loopLoc = ctx.facts.loops[0]?.location ?? null;
      return verification(claim.claimId, "SUPPORTED", 0.75, [{ evidenceType: "CONTROL_FLOW_EVIDENCE", strength: "STRONG", description: "Maximum loop nesting depth is 1 — consistent with a single pass over the input.", sourceLocation: loopLoc }], "Single-pass claim matches the control-flow evidence.");
    }
    const deepest = ctx.facts.loops.find((l) => l.depth === ctx.facts.maxLoopDepth) ?? null;
    return verification(claim.claimId, "CONTRADICTED", 0.8, [{ evidenceType: "CONTROL_FLOW_EVIDENCE", strength: "STRONG", description: `Loops are nested ${ctx.facts.maxLoopDepth} levels deep — elements are revisited, not processed once.`, sourceLocation: deepest?.location ?? null }], `The claim states each element is processed once, but the implementation nests loops ${ctx.facts.maxLoopDepth} levels deep, which means repeated work over the same data.`);
  }
  if (/recursiv/.test(lower)) {
    const fn = ctx.facts.functions.find((f) => f.isRecursive);
    if (fn) return verification(claim.claimId, "SUPPORTED", 0.7, [{ evidenceType: "AST_EVIDENCE", strength: "DIRECT", description: `Function "${fn.name}" calls itself.`, sourceLocation: fn.location }], "Recursion claim matches the code.");
    return verification(claim.claimId, "CONTRADICTED", 0.6, [], "The claim describes recursion, but no self-referential function call was found.");
  }
  return verification(claim.claimId, "UNVERIFIED", 0.3, [], "This control-flow claim is too general to check against a specific structural fact.");
}

// ── INVARIANT ────────────────────────────────────────────────────────────
// Piggybacks on the pattern detector: in this engine, the invariant that
// matters most is usually the one that defines the detected pattern itself
// (e.g. "the search interval stays valid" is binary search's invariant).

export function verifyInvariantClaim(claim: Claim, ctx: VerifierContext): ClaimVerification {
  const target = normalizeAlgorithmClaim(claim.originalText);
  if (!target) return verification(claim.claimId, "UNVERIFIED", 0.25, [], "Could not map this invariant claim to a pattern this engine recognizes.");
  const match = ctx.patterns.find((p) => p.pattern === target);
  if (match) {
    return verification(claim.claimId, "SUPPORTED", 0.55, [{ evidenceType: "AST_EVIDENCE", strength: match.confidence, description: match.rationale, sourceLocation: match.location }], `The ${target} pattern's structural shape is present, which is consistent with the stated invariant.`);
  }
  return verification(claim.claimId, "UNVERIFIED", 0.3, [], `No structural evidence of the "${target}" pattern was found to confirm or refute this invariant.`);
}

// ── PROBLEM_UNDERSTANDING ────────────────────────────────────────────────

export async function verifyProblemUnderstandingClaim(claim: Claim, ctx: VerifierContext): Promise<ClaimVerification> {
  if (!ctx.problem) {
    return verification(claim.claimId, "UNVERIFIED", 0.3, [], "No problem specification was supplied to compare this claim against.");
  }
  const judged = await ctx.aiProvider.judgeSemanticMatch({ claimText: claim.originalText, targetConcept: ctx.problem.coreRequirement });
  if (!judged.ok) {
    return verification(claim.claimId, "UNVERIFIED", 0.2, [], `Semantic comparison against the problem statement failed (${judged.reason}).`);
  }
  const strength: EvidenceStrength = judged.value.confidence === "HIGH" ? "MODERATE" : "WEAK"; // AI-derived evidence is capped below deterministic evidence
  const evidence: Evidence[] = [{ evidenceType: "SEMANTIC_EVIDENCE", strength, description: judged.value.reasoning, sourceLocation: null }];
  return judged.value.matches
    ? verification(claim.claimId, "SUPPORTED", strengthToConfidence(strength), evidence, "The claim aligns with the problem's core requirement.")
    : verification(claim.claimId, "CONTRADICTED", strengthToConfidence(strength), evidence, `The claim does not match the problem's core requirement ("${ctx.problem.coreRequirement}").`);
}

// ── Claim types without a dedicated deterministic or AI-backed verifier
// yet (CORRECTNESS, OPTIMIZATION, TRADEOFF, BEHAVIOR). Honest UNVERIFIED
// rather than a fabricated verdict — see README "Known limitations". ────

export function verifyUnhandledClaimType(claim: Claim): ClaimVerification {
  return verification(
    claim.claimId,
    "UNVERIFIED",
    0.2,
    [],
    `${claim.claimType} claims don't have a deterministic verifier in this build yet. Extend verification/verifiers.ts or route this claimType through aiProvider.judgeSemanticMatch against a concept you define.`
  );
}
