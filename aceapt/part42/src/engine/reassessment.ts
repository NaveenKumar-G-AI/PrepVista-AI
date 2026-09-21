import type { CapabilityStatus, StudentDiagnosticProfile } from "../types/domain.js";

export interface DomainDelta {
  skillNodeId: string;
  nodeLabel: string;
  baselineStatus: CapabilityStatus | undefined;
  currentStatus: CapabilityStatus;
  baselinePointEstimate: number | undefined;
  currentPointEstimate: number;
  direction: "increased" | "decreased" | "unchanged" | "new_evidence";
  note: string;
}

const MIN_MEANINGFUL_DIFF = 0.1;

/**
 * Module 30: "Do not falsely claim causation... use language: 'Your
 * measured performance increased.'" Nothing here attributes a change to
 * any particular intervention — that inference belongs to whatever
 * consumed the recommendation (Feature 4-equivalent), not to Feature 42.
 */
export function compareBaselineToCurrent(
  baseline: StudentDiagnosticProfile | null,
  current: StudentDiagnosticProfile,
): { domainDeltas: DomainDelta[]; summary: string } {
  if (!baseline) {
    return { domainDeltas: [], summary: "No prior baseline exists yet — this diagnostic establishes your starting point." };
  }

  const baselineByNode = new Map(baseline.domainProfiles.map((d) => [d.skillNodeId, d]));

  const domainDeltas: DomainDelta[] = current.domainProfiles.map((curr) => {
    const base = baselineByNode.get(curr.skillNodeId);

    if (!base || base.confidenceState === "incomplete") {
      return {
        skillNodeId: curr.skillNodeId,
        nodeLabel: curr.nodeLabel,
        baselineStatus: base?.status,
        currentStatus: curr.status,
        baselinePointEstimate: base?.pointEstimate,
        currentPointEstimate: curr.pointEstimate,
        direction: "new_evidence",
        note: "No comparable baseline evidence for this area.",
      };
    }

    const diff = curr.pointEstimate - base.pointEstimate;
    const direction: DomainDelta["direction"] = diff > MIN_MEANINGFUL_DIFF ? "increased" : diff < -MIN_MEANINGFUL_DIFF ? "decreased" : "unchanged";

    const note =
      direction === "increased"
        ? "Your measured performance increased since your last diagnostic."
        : direction === "decreased"
          ? "Your measured performance was lower than your last diagnostic on this area."
          : "Your measured performance is similar to your last diagnostic.";

    return {
      skillNodeId: curr.skillNodeId,
      nodeLabel: curr.nodeLabel,
      baselineStatus: base.status,
      currentStatus: curr.status,
      baselinePointEstimate: base.pointEstimate,
      currentPointEstimate: curr.pointEstimate,
      direction,
      note,
    };
  });

  const improvedCount = domainDeltas.filter((d) => d.direction === "increased").length;
  const summary =
    improvedCount > 0
      ? `Your measured performance increased in ${improvedCount} of ${domainDeltas.length} domain(s) since your last diagnostic.`
      : "Your measured performance is broadly similar to your last diagnostic so far.";

  return { domainDeltas, summary };
}
