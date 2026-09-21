import type {
  EvidenceConfidenceResult,
  ForecastEvidenceItem,
  GapItem,
  ReadinessTarget,
  RiskSignal,
  TrendResult,
  WhyPanelContent,
} from "../domain/types.js";
import { DIMENSION_DISPLAY_NAMES, RISK_TYPE_LABELS } from "../domain/constants.js";
import { guardAgainstEmploymentClaims } from "../utils/format.js";
import type { AIExplanationProvider } from "../integration/aiExplanationProvider.js";

const MAX_EVIDENCE_BULLETS = 5;

/** Section 49: "Why?" panel — a short, evidence-grounded explanation, built
 * from the same numbers already shown elsewhere, never a separate narrative. */
export function buildWhyPanel(input: {
  gaps: GapItem[];
  risks: RiskSignal[];
  overallTrend: TrendResult;
  confidence: EvidenceConfidenceResult;
}): WhyPanelContent {
  const evidence: ForecastEvidenceItem[] = [];

  for (const gap of [...input.gaps].sort((a, b) => b.gap - a.gap).slice(0, 2)) {
    if (gap.gap <= 0) continue;
    evidence.push({
      statement: `${DIMENSION_DISPLAY_NAMES[gap.dimension]} is ${gap.gap} points below target.`,
      supportingObservation: "OBSERVED",
    });
  }

  for (const risk of input.risks.slice(0, 2)) {
    evidence.push({ statement: risk.explanation, supportingObservation: "INFERRED" });
  }

  if (input.overallTrend.trend !== "INSUFFICIENT_DATA") {
    evidence.push({ statement: input.overallTrend.explanation, supportingObservation: "OBSERVED" });
  }

  if (input.confidence.reasons[0]) {
    evidence.push({ statement: input.confidence.reasons[0], supportingObservation: "OBSERVED" });
  }

  const deduped = dedupeByStatement(evidence).slice(0, MAX_EVIDENCE_BULLETS);

  const topRisk = input.risks[0];
  const conclusion = topRisk
    ? `Your main readiness risk: ${topRisk.explanation}`
    : "No single dominant risk stands out from current evidence — readiness looks broadly consistent across dimensions.";

  return { evidence: deduped, conclusion };
}

function dedupeByStatement(items: ForecastEvidenceItem[]): ForecastEvidenceItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.statement) ? false : (seen.add(i.statement), true)));
}

/** Section 43: a dynamic capability roadmap (not a syllabus), ordered by the
 * ranked risks rather than a fixed hardcoded list. */
export function buildReadinessRoadmap(primaryGaps: GapItem[], risks: RiskSignal[], target: ReadinessTarget): string[] {
  const steps: string[] = ["Current capability"];
  const seenDimensions = new Set<string>();

  for (const risk of risks) {
    if (risk.dimension && !seenDimensions.has(risk.dimension)) {
      steps.push(`${DIMENSION_DISPLAY_NAMES[risk.dimension]} gap`);
      seenDimensions.add(risk.dimension);
    } else if (!risk.dimension) {
      steps.push(RISK_TYPE_LABELS[risk.type]);
    }
    if (steps.length >= 4) break;
  }

  for (const gap of primaryGaps) {
    if (!seenDimensions.has(gap.dimension) && steps.length < 4) {
      steps.push(`${DIMENSION_DISPLAY_NAMES[gap.dimension]} gap`);
      seenDimensions.add(gap.dimension);
    }
  }

  steps.push("Verification");
  steps.push(target.assessmentLabel ? `Target: ${target.assessmentLabel}` : "Target");
  return steps;
}

/** Section 42: compares stated self-confidence to measured evidence. No
 * psychological diagnosis — just a factual comparison of two numbers. */
export function compareConfidenceToEvidence(selfReported: number, measured: number, margin = 5): string {
  if (selfReported < measured - margin) {
    return "Recent evidence indicates stronger readiness than your current self-assessment suggests.";
  }
  if (selfReported > measured + margin) {
    return "Your confidence is currently ahead of demonstrated assessment performance.";
  }
  return "Your self-assessment is broadly aligned with measured evidence.";
}

/** Optional AI rephrasing of the Why panel. Always falls back to the
 * deterministic bullet text — an AI failure, a missing key, or a blocked
 * claim never breaks the response, it just means less-polished prose. */
export async function narrateWhyPanel(whyPanel: WhyPanelContent, provider?: AIExplanationProvider): Promise<string> {
  const deterministic = [...whyPanel.evidence.map((e) => e.statement), whyPanel.conclusion].join(" ");
  if (!provider) return deterministic;

  try {
    const aiText = await provider.rephrase(whyPanel);
    if (!aiText) return deterministic;
    guardAgainstEmploymentClaims(aiText);
    return aiText;
  } catch {
    return deterministic;
  }
}
