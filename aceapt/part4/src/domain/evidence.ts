import type { DimensionEvidence, Diagnosis, EvidenceStrength, SkillEvidenceRecord, SkillLevel } from "./types.js";
import {
  DEVELOPING_ACCURACY_THRESHOLD,
  FRESHNESS_THRESHOLD_DAYS,
  MIN_ATTEMPTS_FOR_MODERATE,
  MIN_ATTEMPTS_FOR_STRONG,
  REPEATED_ERROR_THRESHOLD,
  SPEED_SLOW_MULTIPLIER,
  STRONG_ACCURACY_THRESHOLD,
} from "./types.js";

export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  return (now.getTime() - then) / (1000 * 60 * 60 * 24);
}

export function classifyDimension(dim: DimensionEvidence): EvidenceStrength {
  if (dim.attempts === 0 || dim.accuracy === null) return "NONE";
  if (dim.attempts < MIN_ATTEMPTS_FOR_MODERATE) return "LIMITED";
  if (dim.accuracy >= STRONG_ACCURACY_THRESHOLD && dim.attempts >= MIN_ATTEMPTS_FOR_STRONG) return "STRONG";
  if (dim.accuracy >= DEVELOPING_ACCURACY_THRESHOLD) return "DEVELOPING";
  return "LIMITED";
}

/**
 * A skill only reaches STRONG/VERIFIED once *application* evidence backs up
 * foundation evidence — never from foundation alone. This is the mechanism
 * behind Phase 14 ("fundamentals strong, advanced application still
 * developing" must not collapse into "skill is weak").
 */
export function overallSkillLevel(evidence: SkillEvidenceRecord): SkillLevel {
  const f = classifyDimension(evidence.foundation);
  const a = classifyDimension(evidence.application);

  if (f === "NONE" && a === "NONE") return "NOT_ASSESSED";
  if (f === "STRONG" && a === "STRONG") return evidence.verifiedAt ? "VERIFIED" : "STRONG";
  if (f === "STRONG" || f === "DEVELOPING") return "DEVELOPING";
  return "LIMITED_EVIDENCE";
}

function mostFrequentCount(items: string[]): number {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) max = Math.max(max, c);
  return max;
}

/**
 * The single most important function in Feature 4: turns four evidence
 * dimensions + staleness + error history into ONE labeled reason. Every
 * downstream engine (next-best-action, priority, explainability) reads
 * `detail` and `evidenceRefs` verbatim rather than re-deriving prose, so a
 * displayed "why" can never drift from the evidence that produced it.
 */
export function diagnoseSkill(evidence: SkillEvidenceRecord, benchmarkResponseTimeMs: number | null = null): Diagnosis {
  const f = classifyDimension(evidence.foundation);
  const a = classifyDimension(evidence.application);
  const fam = classifyDimension(evidence.transferFamiliar);
  const variant = classifyDimension(evidence.transferVariant);

  const repeatCount = mostFrequentCount(evidence.recentErrorSignatures);
  if (repeatCount >= REPEATED_ERROR_THRESHOLD) {
    return {
      primaryGap: "MISCONCEPTION",
      detail: `The same error pattern has appeared ${repeatCount} times in recent attempts — likely a specific misconception rather than general difficulty.`,
      evidenceRefs: ["recentErrorSignatures"],
    };
  }

  const stale = evidence.verifiedAt !== null && daysSince(evidence.verifiedAt) > FRESHNESS_THRESHOLD_DAYS;
  if (stale && f === "STRONG") {
    return {
      primaryGap: "STALE",
      detail: `This skill was last verified ${Math.round(daysSince(evidence.verifiedAt!))} days ago — evidence is old enough to need a freshness check, not a full relearn.`,
      evidenceRefs: ["verifiedAt"],
    };
  }

  if (f === "NONE") {
    return { primaryGap: "FOUNDATION", detail: "No foundation evidence yet for this skill.", evidenceRefs: ["foundation"] };
  }
  if (f === "LIMITED") {
    return { primaryGap: "FOUNDATION", detail: "Foundation evidence is still limited (few attempts).", evidenceRefs: ["foundation"] };
  }

  if (f === "STRONG" && (a === "NONE" || a === "LIMITED" || a === "DEVELOPING")) {
    return {
      primaryGap: "APPLICATION",
      detail: "Foundation is strong, but application evidence is still developing.",
      evidenceRefs: ["foundation", "application"],
    };
  }

  if (f === "DEVELOPING" && (a === "NONE" || a === "LIMITED")) {
    return { primaryGap: "FOUNDATION", detail: "Foundation itself is still developing.", evidenceRefs: ["foundation"] };
  }

  if (fam === "STRONG" && (variant === "NONE" || variant === "LIMITED" || variant === "DEVELOPING")) {
    return {
      primaryGap: "TRANSFER",
      detail: "Strong on familiar question patterns, but unfamiliar variants are still developing.",
      evidenceRefs: ["transferFamiliar", "transferVariant"],
    };
  }

  if (
    a === "STRONG" &&
    benchmarkResponseTimeMs !== null &&
    evidence.application.avgResponseTimeMs !== null &&
    evidence.application.avgResponseTimeMs > benchmarkResponseTimeMs * SPEED_SLOW_MULTIPLIER
  ) {
    return {
      primaryGap: "SPEED",
      detail: "Accuracy is strong, but response time is meaningfully slower than target pace.",
      evidenceRefs: ["application.avgResponseTimeMs"],
    };
  }

  if (f === "STRONG" && a === "STRONG" && (variant === "STRONG" || variant === "NONE")) {
    return {
      primaryGap: "NONE",
      detail: "Current evidence supports strong mastery of this skill.",
      evidenceRefs: ["foundation", "application", "transferVariant"],
    };
  }

  return { primaryGap: "APPLICATION", detail: "Application evidence needs more data before a confident call.", evidenceRefs: ["application"] };
}
