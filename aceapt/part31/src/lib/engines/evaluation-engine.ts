import { resolveBlueprintItem } from './blueprint-engine';
import { capabilityDimensionKey, getCapabilityLabel } from '@/lib/content/targets';
import type { Bottleneck, DecisionItem, DimensionScores, MCQItem, SimulationAttempt, StageEvaluation, StageVerdict, StrongestArea } from '@/lib/db/schema';

const QUALITY_SCORE: Record<string, number> = { strong: 100, adequate: 70, weak: 40 };

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function verdictFromAccuracy(accuracy: number, itemsAttempted: number, reached: boolean): StageVerdict {
  if (!reached) return 'not_reached';
  if (itemsAttempted === 0) return 'critical';
  if (accuracy >= 80) return 'strong';
  if (accuracy >= 55) return 'weak';
  return 'critical';
}

const VERDICT_RANK: Record<StageVerdict, number> = { critical: 0, not_reached: 0, weak: 1, strong: 2 };

export interface EvaluationOutput {
  dimensions: DimensionScores;
  stageEvaluations: StageEvaluation[];
  primaryBottleneck: Bottleneck | null;
  strongestArea: StrongestArea | null;
}

export function evaluate(attempt: SimulationAttempt): EvaluationOutput {
  const { blueprint, responses, currentStageIndex } = attempt;
  const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));
  // currentStageIndex already reflects exactly how far the student got,
  // in every case: the respond handler advances it as stages complete and
  // sets it to blueprint.stages.length on a natural finish, and expiry
  // (via /complete) never touches it — so it's correct whether this
  // attempt finished normally or ran out of time mid-stage. It must NOT be
  // branched on attempt.status here, since by the time /complete calls
  // this function, status has already been flipped away from
  // 'in_progress' regardless of how the attempt actually ended.
  const reachedStageCount = currentStageIndex;

  let baseTotal = 0;
  let baseCorrect = 0;
  let transferTotal = 0;
  let transferCorrect = 0;
  let applicationTotal = 0;
  let applicationCorrect = 0;
  let decisionTotal = 0;
  let decisionScoreSum = 0;
  let itemsTotal = 0;
  let itemsAttempted = 0;
  const speedScores: number[] = [];

  const stageEvaluations: StageEvaluation[] = blueprint.stages.map((stage, stageIdx) => {
    const reached = stageIdx < reachedStageCount || (stageIdx === reachedStageCount && responses.some((r) => r.stageId === stage.id));
    const perItemBudget = stage.items.length > 0 ? stage.timeBudgetSeconds / stage.items.length : stage.timeBudgetSeconds;

    let stageGraded = 0;
    let stageScoreSum = 0;
    let stageAttempted = 0;
    let stageTimeSum = 0;

    for (const stageItem of stage.items) {
      itemsTotal += 1;
      const item = resolveBlueprintItem(stageItem.itemId);
      const response = responseByItemId.get(stageItem.itemId);
      const attempted = !!response;
      if (attempted) {
        itemsAttempted += 1;
        stageAttempted += 1;
        stageTimeSum += response!.timeSpentSeconds;
        speedScores.push(clamp((perItemBudget / Math.max(1, response!.timeSpentSeconds)) * 100));
      }

      if (item.kind === 'multiple_choice') {
        const mcq = item as MCQItem;
        const correct = attempted && response!.selectedOptionId === mcq.correctOptionId;
        stageGraded += 1;
        stageScoreSum += correct ? 100 : 0;

        // Bucket by what this item actually measures. `transfer` is an
        // orthogonal tag (spec §15 — a novel-presentation signal that could
        // in principle apply within any capability), so it's kept separate
        // from the capability-dimension bucket rather than folded into it.
        const dimKey = capabilityDimensionKey(item.capabilityId);
        if (dimKey === 'capability') {
          baseTotal += 1;
          if (correct) baseCorrect += 1;
        } else if (dimKey === 'application') {
          applicationTotal += 1;
          if (correct) applicationCorrect += 1;
        }
        if (item.transfer) {
          transferTotal += 1;
          if (correct) transferCorrect += 1;
        }
      } else if (item.kind === 'decision') {
        const decisionItem = item as DecisionItem;
        const chosen = attempted ? decisionItem.options.find((o) => o.id === response!.selectedOptionId) : undefined;
        const score = chosen ? QUALITY_SCORE[chosen.quality] ?? 0 : 0;
        decisionTotal += 1;
        decisionScoreSum += score;
        stageGraded += 1;
        stageScoreSum += score;
      }
      // free_response items contribute to completion/speed only — never to
      // an objective accuracy figure (spec §39: AI/heuristics never become
      // the source of truth for correctness).
    }

    const accuracy = stageGraded > 0 ? Math.round(stageScoreSum / stageGraded) : stageAttempted > 0 ? 100 : 0;
    return {
      stageId: stage.id,
      title: stage.title,
      capabilityIds: stage.capabilityIds,
      accuracy,
      verdict: verdictFromAccuracy(accuracy, stageAttempted, reached),
      itemsAttempted: stageAttempted,
      itemsTotal: stage.items.length,
      avgTimeSeconds: stageAttempted > 0 ? Math.round(stageTimeSum / stageAttempted) : 0,
    };
  });

  const capabilityDim = baseTotal > 0 ? Math.round((100 * baseCorrect) / baseTotal) : 0;
  const applicationDim = applicationTotal > 0 ? Math.round((100 * applicationCorrect) / applicationTotal) : capabilityDim;
  const transferDim = transferTotal > 0 ? Math.round((100 * transferCorrect) / transferTotal) : capabilityDim;
  const decisionQualityDim = decisionTotal > 0 ? Math.round(decisionScoreSum / decisionTotal) : null;
  const completionDim = itemsTotal > 0 ? Math.round((100 * itemsAttempted) / itemsTotal) : 0;
  const speedDim = speedScores.length > 0 ? Math.round(speedScores.reduce((a, b) => a + b, 0) / speedScores.length) : 0;

  const attemptedStageAccuracies = stageEvaluations.filter((s) => s.itemsAttempted > 0).map((s) => s.accuracy);
  const consistencyDim = attemptedStageAccuracies.length >= 2 ? Math.round(clamp(100 - stddev(attemptedStageAccuracies) * 1.5)) : 100;

  const dimensions: DimensionScores = {
    capability: capabilityDim,
    application: applicationDim,
    transfer: transferDim,
    speed: speedDim,
    consistency: consistencyDim,
    completion: completionDim,
    decisionQuality: decisionQualityDim,
  };

  // Primary bottleneck: worst-verdict stage, tie-broken by lowest accuracy.
  const gradedStages = stageEvaluations.filter((s) => s.itemsTotal > 0);
  let worst: StageEvaluation | null = null;
  for (const s of gradedStages) {
    if (!worst || VERDICT_RANK[s.verdict] < VERDICT_RANK[worst.verdict] || (VERDICT_RANK[s.verdict] === VERDICT_RANK[worst.verdict] && s.accuracy < worst.accuracy)) {
      worst = s;
    }
  }
  const primaryBottleneck: Bottleneck | null =
    worst && worst.verdict !== 'strong'
      ? {
          stageId: worst.stageId,
          stageTitle: worst.title,
          capabilityId: worst.capabilityIds[0],
          label: getCapabilityLabel(worst.capabilityIds[0]),
          accuracy: worst.accuracy,
          verdict: worst.verdict,
        }
      : null;

  // Strongest area among the objectively-graded dimensions. capabilityId
  // for each bucket is resolved from whichever capability in *this*
  // blueprint actually maps to that dimension, so the label is correct
  // regardless of which target the attempt belongs to.
  const blueprintCapabilityIds = Array.from(new Set(blueprint.stages.flatMap((s) => s.capabilityIds)));
  const capabilityIdForDim = (dimKey: 'capability' | 'application' | 'transfer' | 'decisionQuality') =>
    blueprintCapabilityIds.find((c) => capabilityDimensionKey(c) === dimKey) ?? blueprintCapabilityIds[0] ?? 'cap_foundations';

  const candidateDims: { capabilityId: string; score: number }[] = [
    { capabilityId: capabilityIdForDim('capability'), score: dimensions.capability },
    { capabilityId: capabilityIdForDim('application'), score: dimensions.application },
    { capabilityId: 'cap_transfer', score: dimensions.transfer },
  ];
  if (dimensions.decisionQuality !== null) candidateDims.push({ capabilityId: capabilityIdForDim('decisionQuality'), score: dimensions.decisionQuality });
  const best = candidateDims.reduce((a, b) => (b.score > a.score ? b : a));
  const strongestArea: StrongestArea | null = itemsAttempted > 0 ? { capabilityId: best.capabilityId, label: getCapabilityLabel(best.capabilityId), score: best.score } : null;

  return { dimensions, stageEvaluations, primaryBottleneck, strongestArea };
}
