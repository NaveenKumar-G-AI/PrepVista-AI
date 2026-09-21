import type { Bottleneck, DimensionScores, EvidenceConfidence, StageEvaluation, Target } from '@/lib/db/schema';

export interface ExplanationOutput {
  bullets: string[];
  interpretation: string;
  biggestRisk: string;
}

export function explain(
  dimensions: DimensionScores,
  stageEvaluations: StageEvaluation[],
  primaryBottleneck: Bottleneck | null,
  evidenceConfidence: EvidenceConfidence,
  target: Target
): ExplanationOutput {
  const bullets: string[] = [];

  const transferGap = Math.max(dimensions.application, dimensions.capability) - dimensions.transfer;
  if (transferGap >= 12) {
    bullets.push(
      `Transfer accuracy (${dimensions.transfer}%) trailed your applied performance (${Math.max(dimensions.application, dimensions.capability)}%) by ${transferGap} points — unfamiliar variations of familiar problems were harder to recognize under pressure.`
    );
  }

  if (dimensions.completion < 90) {
    const notReached = stageEvaluations.filter((s) => s.verdict === 'not_reached');
    if (notReached.length > 0) {
      bullets.push(`${notReached.map((s) => s.title).join(', ')} ${notReached.length > 1 ? 'were' : 'was'} not fully reached before time ran out, lowering overall completion to ${dimensions.completion}%.`);
    } else {
      bullets.push(`Some items were left unanswered, lowering overall completion to ${dimensions.completion}%.`);
    }
  }

  if (dimensions.speed < 55 && dimensions.capability >= 70) {
    bullets.push(`Accuracy on attempted items was solid (${dimensions.capability}%), but pacing was slower than the time budget allowed, which limited how much you could complete.`);
  }

  if (dimensions.consistency < 60) {
    const accs = stageEvaluations.filter((s) => s.itemsAttempted > 0).map((s) => s.accuracy);
    if (accs.length > 0) {
      bullets.push(`Performance varied across stages (${Math.min(...accs)}%–${Math.max(...accs)}%), suggesting readiness that is uneven across conditions rather than consistently strong.`);
    }
  }

  if (dimensions.decisionQuality !== null && dimensions.decisionQuality < 70) {
    bullets.push(`The decision under time constraint scored ${dimensions.decisionQuality}/100 — a reasonable option was available, but a stronger triage choice would have scored higher.`);
  }

  if (bullets.length === 0) {
    bullets.push('No material weaknesses were detected in this simulation — every measured stage met or exceeded target-level performance.');
  }

  const biggestRisk = primaryBottleneck ? `${primaryBottleneck.label} under target conditions` : 'No material risk detected in this simulation';

  const interpretation = primaryBottleneck
    ? `Based on this simulation, your strongest measured risk in a similar real ${target.name} evaluation today would be ${primaryBottleneck.label.toLowerCase()}. This is an estimate from ${evidenceConfidence} evidence, not a guaranteed outcome — further simulations will sharpen it.`
    : `Based on this simulation, you met target-level performance across every stage measured. This is an estimate from ${evidenceConfidence} evidence, not a guarantee of real-world performance.`;

  return { bullets, interpretation, biggestRisk };
}
