import type { ReadinessSnapshot } from "../domain/types.js";
import type { SimulationPostmortem } from "../engines/postmortemEngine.js";

// Every number and claim in this file is read directly off the snapshot /
// postmortem object that was already computed by the deterministic engines —
// nothing here derives, estimates, or infers a NEW number. This file's only
// job is turning structured evidence into readable sentences (Section 46's
// "optional AI explanation" step, minus the AI — this is what runs when
// ANTHROPIC_API_KEY is unset, and what the Anthropic explainer is only ever
// allowed to *reword*, not extend).

const readableDimension = (key: string) => key.replace(/_/g, " ");

const readableState: Record<ReadinessSnapshot["overallState"], string> = {
  INSUFFICIENT_EVIDENCE: "not enough evidence yet to assess",
  EARLY_EVIDENCE: "early evidence only",
  DEVELOPING: "developing",
  NEAR_READY: "near ready",
  CONDITIONALLY_READY: "conditionally ready",
  STRONGLY_READY: "strongly ready",
};

export function composeReadinessExplanation(snapshot: ReadinessSnapshot): string {
  const lines: string[] = [];

  if (snapshot.evidenceCount === 0) {
    return (
      "There isn't a realistic simulation on record yet, so readiness can't be assessed. " +
      "Practice accuracy alone doesn't predict exam-condition performance — the first realistic " +
      "simulation is what starts building evidence."
    );
  }

  const strongest = [...snapshot.dimensions]
    .filter((d) => d.status === "READY")
    .sort((a, b) => b.score - a.score)[0];
  const topGaps = snapshot.gaps.slice(0, 3);

  if (strongest) {
    lines.push(`${capitalize(readableDimension(strongest.dimensionKey))} is strong at ${strongest.score}%.`);
  }

  lines.push(
    `Overall readiness is ${readableState[snapshot.overallState]} (${snapshot.overallScore}%), based on ` +
      `${snapshot.evidenceCount} realistic simulation${snapshot.evidenceCount === 1 ? "" : "s"}.`
  );

  if (topGaps.length > 0) {
    lines.push("");
    lines.push(topGaps.length === 1 ? "The current gap is:" : "The biggest current gaps are:");
    for (const gap of topGaps) {
      const dim = snapshot.dimensions.find((d) => d.dimensionKey === gap.dimensionKey);
      lines.push(`• ${capitalize(readableDimension(gap.dimensionKey))}${dim ? ` (${dim.score}%)` : ""} — ${dim?.evidenceSummary ?? gap.description}`);
    }
  } else {
    lines.push("No high-priority gaps are showing in the current evidence.");
  }

  if (snapshot.confidence.level !== "HIGH" && snapshot.confidence.limitingFactors.length > 0) {
    lines.push("");
    lines.push(
      `Confidence in this readiness estimate is ${snapshot.confidence.level}: ${snapshot.confidence.limitingFactors[0]}`
    );
  }

  return lines.join("\n");
}

/** Section 34's "Why am I not ready?" — same underlying data as
 * composeReadinessExplanation, framed as a direct answer to that question. */
export function composeWhyNotReadyExplanation(snapshot: ReadinessSnapshot): string {
  if (snapshot.overallState === "STRONGLY_READY") {
    return `Current evidence across ${snapshot.evidenceCount} realistic simulations supports strong readiness — no major gaps are showing right now.`;
  }
  if (snapshot.evidenceCount === 0) {
    return "No realistic simulation has been completed yet, so there's no evidence to assess readiness against.";
  }

  const topGaps = snapshot.gaps.slice(0, 4);
  const parts: string[] = [];
  parts.push(
    `Readiness is currently ${readableState[snapshot.overallState]}. Practice-level knowledge doesn't automatically ` +
      `carry over to full assessment conditions, and the evidence below shows where that gap actually is.`
  );
  if (topGaps.length > 0) {
    parts.push("");
    for (const gap of topGaps) {
      const dim = snapshot.dimensions.find((d) => d.dimensionKey === gap.dimensionKey);
      parts.push(`• ${dim?.evidenceSummary ?? gap.description}`);
    }
  }
  return parts.join("\n");
}

/** Section 52's simulation postmortem narrative. */
export function composePostmortemExplanation(pm: SimulationPostmortem): string {
  const lines: string[] = [];

  if (pm.accuracyPct !== null) {
    lines.push(`Score: ${pm.score ?? "—"}/${pm.maxScore ?? "—"} (${pm.accuracyPct}% accuracy).`);
  }
  if (pm.unansweredCount > 0) {
    lines.push(`${pm.unansweredCount} of ${pm.totalQuestions} questions were left unanswered.`);
  }

  if (pm.timeAllocation.sinkObservations.length > 0) {
    lines.push(pm.timeAllocation.sinkObservations[0]!);
  }

  if (pm.degradation.hasDegradation) {
    lines.push(
      `Accuracy fell from ${pm.degradation.firstQuarterAccuracy?.toFixed(0)}% in the first section to ` +
        `${pm.degradation.finalQuarterAccuracy?.toFixed(0)}% in the final section.`
    );
  }

  if (pm.topicSwitching.hasGap && pm.topicSwitching.observation) {
    lines.push(pm.topicSwitching.observation);
  }

  if (pm.recovery.postErrorRecoveryRate !== null) {
    lines.push(
      `After a wrong answer, the next questions were answered correctly ${pm.recovery.postErrorRecoveryRate}% of the time.`
    );
  }

  return lines.length > 0 ? lines.join("\n") : "No notable performance patterns detected in this simulation.";
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
