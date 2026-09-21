import type { EvidenceEvent, PathRisk, PathSnapshot, RiskSeverity, RiskType, StudentCapabilityState } from "../domain/types.js";
import type { CapabilityGap } from "./gapAnalysis.js";

export type RiskCandidate = Pick<PathRisk, "type" | "reason" | "evidence" | "severity" | "recommendedResponse">;

export interface RiskInput {
  gaps: CapabilityGap[];
  states: StudentCapabilityState[];
  snapshots: PathSnapshot[]; // chronological, oldest first
  recentEvidenceByCapability: Map<string, EvidenceEvent[]>; // most recent first, per capability
  deadlineDays: number | null;
  readiness: number;
  targetReadiness: number;
  projectedWeeksHigh: number | null;
  regressedVerifiedCapabilities: Array<{ capabilityCode: string; requiredLevel: number; currentLevel: number }>;
}

/**
 * Section 26. Every risk here is read directly off evidence -- attempt
 * counts, dimension values, snapshot deltas, deadlines -- never off a
 * guess about how the student feels. That restriction is deliberate: the
 * next stop after "we detected a risk" is a recommended response someone
 * acts on, and a fabricated cause produces a wrong response.
 */
export function detectRisks(input: RiskInput): RiskCandidate[] {
  const risks: RiskCandidate[] = [];

  // STALLING -- readiness has barely moved across the last few recalculations,
  // and enough real time has actually passed to call that a pattern. Without
  // the elapsed-time floor, a student (or, here, a burst of API calls)
  // triggering several recalculations within the same minute would read as
  // "stalled" even though no meaningful practice window has passed.
  const MIN_STALLING_WINDOW_MS = 12 * 3600 * 1000; // 12 hours
  if (input.snapshots.length >= 3) {
    const recent = input.snapshots.slice(-3);
    const windowMs = new Date(recent[recent.length - 1].takenAt).getTime() - new Date(recent[0].takenAt).getTime();
    const delta = recent[recent.length - 1].readiness - recent[0].readiness;
    if (windowMs >= MIN_STALLING_WINDOW_MS && delta < 1.5) {
      risks.push({
        type: "STALLING",
        reason: `Readiness moved only ${delta.toFixed(1)} points over your last ${recent.length} recalculations.`,
        evidence: { snapshots: recent.map((s) => ({ takenAt: s.takenAt, readiness: s.readiness })) },
        severity: delta <= 0 ? "HIGH" : "MEDIUM",
        recommendedResponse: "Switch focus to a different capability, or shift into Recovery mode to rebuild the weakest component before continuing.",
      });
    }
  }

  // INCONSISTENT_PERFORMANCE -- a well-evidenced capability with low consistency.
  for (const s of input.states) {
    if (s.evidenceCount >= 3 && s.consistency < 50) {
      risks.push({
        type: "INCONSISTENT_PERFORMANCE",
        reason: `Consistency on ${s.capabilityCode} is ${s.consistency.toFixed(0)} across ${s.evidenceCount} attempts -- performance swings attempt to attempt.`,
        evidence: { capabilityCode: s.capabilityCode, consistency: s.consistency, evidenceCount: s.evidenceCount },
        severity: s.consistency < 35 ? "HIGH" : "MEDIUM",
        recommendedResponse: "Repeat a narrower set of practice at the current difficulty before advancing, to establish a stable baseline.",
      });
    }
  }

  // LOW_EVIDENCE -- a meaningfully-weighted requirement judged on too few attempts to trust.
  for (const g of input.gaps) {
    if (g.weight >= 0.12 && !g.evidenceSufficient) {
      risks.push({
        type: "LOW_EVIDENCE",
        reason: `${g.capabilityCode} has only ${g.evidenceCount} of the ${g.minEvidence} attempts needed to reliably judge readiness.`,
        evidence: { capabilityCode: g.capabilityCode, evidenceCount: g.evidenceCount, minEvidence: g.minEvidence },
        severity: "MEDIUM",
        recommendedResponse: "Complete a targeted assessment before this capability's status can be trusted.",
      });
    }
  }

  // CRITICAL_GAP -- large, well-evidenced shortfall on something the target weighs heavily.
  for (const g of input.gaps) {
    if (g.evidenceSufficient && g.weight >= 0.15 && g.gap >= 25) {
      risks.push({
        type: "CRITICAL_GAP",
        reason: `${g.capabilityCode} is ${g.gap.toFixed(0)} points below its target requirement and carries significant weight toward this target.`,
        evidence: { capabilityCode: g.capabilityCode, gap: g.gap, weight: g.weight },
        severity: g.gap >= 40 ? "HIGH" : "MEDIUM",
        recommendedResponse: "Prioritize this capability above lower-weight gaps until it closes.",
      });
    }
  }

  // TIME_PRESSURE -- the deadline and the honest projection disagree.
  if (input.deadlineDays != null) {
    const distance = Math.max(0, input.targetReadiness - input.readiness);
    if (input.projectedWeeksHigh != null && input.projectedWeeksHigh * 7 > input.deadlineDays) {
      risks.push({
        type: "TIME_PRESSURE",
        reason: `Projected readiness window extends beyond your ${input.deadlineDays}-day deadline.`,
        evidence: { deadlineDays: input.deadlineDays, projectedWeeksHigh: input.projectedWeeksHigh, distance },
        severity: input.deadlineDays <= 14 ? "HIGH" : "MEDIUM",
        recommendedResponse: "Switch to Fast Track mode to focus only on the highest-impact gaps, or reconsider the deadline.",
      });
    } else if (input.deadlineDays <= 14 && distance > 15) {
      risks.push({
        type: "TIME_PRESSURE",
        reason: `${distance.toFixed(0)} readiness points remain with ${input.deadlineDays} days left.`,
        evidence: { deadlineDays: input.deadlineDays, distance },
        severity: "MEDIUM",
        recommendedResponse: "Switch to Fast Track mode to focus only on the highest-impact gaps.",
      });
    }
  }

  // REPEATED_FAILURE -- the last several graded attempts on one capability all failed.
  for (const [capabilityCode, events] of input.recentEvidenceByCapability) {
    const graded = events.filter((e) => e.result.passed != null).slice(0, 3);
    if (graded.length >= 3 && graded.every((e) => e.result.passed === false)) {
      risks.push({
        type: "REPEATED_FAILURE",
        reason: `The last ${graded.length} graded attempts at ${capabilityCode} were all unsuccessful.`,
        evidence: { capabilityCode, attempts: graded.map((e) => ({ occurredAt: e.occurredAt, passed: e.result.passed })) },
        severity: "HIGH",
        recommendedResponse: "Reduce complexity temporarily, rebuild the weak component, then reassess -- see Recovery mode.",
      });
    }
  }

  // LOW_RETENTION -- a capability that was previously verified has since drifted back below the bar.
  for (const r of input.regressedVerifiedCapabilities) {
    risks.push({
      type: "LOW_RETENTION",
      reason: `${r.capabilityCode} was previously verified at or above ${r.requiredLevel.toFixed(0)} but has since fallen to ${r.currentLevel.toFixed(0)}.`,
      evidence: r,
      severity: r.requiredLevel - r.currentLevel >= 15 ? "HIGH" : "MEDIUM",
      recommendedResponse: "Schedule a short refresh on this capability before it affects your overall readiness.",
    });
  }

  // TRANSFER_FAILURE -- concept is solid, but the student can't apply it in a novel context.
  for (const s of input.states) {
    if (s.evidenceCount >= 3 && s.accuracy >= 65 && s.accuracy - s.transfer >= 25) {
      risks.push({
        type: "TRANSFER_FAILURE",
        reason: `${s.capabilityCode} accuracy is ${s.accuracy.toFixed(0)} but transfer is only ${s.transfer.toFixed(0)} -- the concept holds in familiar contexts but not novel ones.`,
        evidence: { capabilityCode: s.capabilityCode, accuracy: s.accuracy, transfer: s.transfer },
        severity: s.accuracy - s.transfer >= 40 ? "HIGH" : "MEDIUM",
        recommendedResponse: "Assign transfer-specific practice in unfamiliar problem framings rather than more repetition of familiar ones.",
      });
    }
  }

  const severityRank: Record<RiskSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return risks.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
}
