import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnsRecord } from '@/lib/auth';
import { getAttempt, saveAttempt, appendEvent, getResultByAttemptId, saveResult, listResultsForStudentTarget } from '@/lib/db/repository';
import { getSimulation } from '@/lib/content/simulations';
import { getTarget } from '@/lib/content/targets';
import { evaluate } from '@/lib/engines/evaluation-engine';
import { buildEvidence, applyEvidenceToCapabilityState } from '@/lib/engines/evidence-engine';
import { computeReadiness } from '@/lib/engines/readiness-engine';
import { explain } from '@/lib/engines/explanation-engine';
import { recommend } from '@/lib/engines/adapt-engine';
import { recalculatePath } from '@/lib/engines/path-engine';
import { maybeGenerateDebrief } from '@/lib/ai/debrief';
import { newId } from '@/lib/ids';
import { apiError, handleUnexpected } from '@/lib/api-utils';
import type { SimulationResult } from '@/lib/db/schema';

const MIN_COMPLETION_FOR_EVIDENCE = 40;

export async function POST(_req: Request, { params }: { params: { attemptId: string } }) {
  try {
    const student = getCurrentStudent();
    const attempt = getAttempt(params.attemptId);
    if (!attempt) return apiError('Attempt not found', 404);
    assertOwnsRecord(attempt.studentId, student.id);

    // Idempotent: completing an already-completed attempt just returns the
    // existing result rather than erroring or recomputing (spec §54).
    const existingResult = getResultByAttemptId(attempt.id);
    if (existingResult) {
      return NextResponse.json({ result: existingResult });
    }

    const sim = getSimulation(attempt.simulationId);
    const target = getTarget(attempt.targetId);
    if (!sim || !target) return apiError('Simulation or target no longer available', 409);

    const elapsedSeconds = Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
    const timedOut = elapsedSeconds > attempt.blueprint.totalDurationSeconds + 10;
    attempt.status = timedOut ? 'expired' : 'completed';
    attempt.completedAt = new Date().toISOString();

    const evaluation = evaluate(attempt);

    const usedAsEvidence = evaluation.dimensions.completion >= MIN_COMPLETION_FOR_EVIDENCE;
    const usedAsEvidenceReason = usedAsEvidence
      ? null
      : `This attempt was not used as readiness evidence because only ${evaluation.dimensions.completion}% of items were completed, which is not enough to reliably measure your performance.`;

    attempt.usedAsEvidence = usedAsEvidence;
    saveAttempt(attempt);

    // Evidence + capability-state update (only real evidence moves capability estimates).
    const evidence = buildEvidence(attempt, evaluation, usedAsEvidence);
    applyEvidenceToCapabilityState(evidence);

    const priorReliable = listResultsForStudentTarget(student.id, target.id).filter((r) => r.usedAsEvidence);
    const reliableAttemptsCounted = priorReliable.length + (usedAsEvidence ? 1 : 0);

    const readiness = computeReadiness(evaluation.dimensions, target, reliableAttemptsCounted);
    const explanation = explain(evaluation.dimensions, evaluation.stageEvaluations, evaluation.primaryBottleneck, readiness.evidenceConfidence, target);
    const nextBestAction = recommend(evaluation.primaryBottleneck?.capabilityId ?? null);

    const freeTextResponses = attempt.responses.filter((r) => r.kind === 'free_response');
    const aiDebrief = usedAsEvidence
      ? await maybeGenerateDebrief({
          targetName: target.name,
          simulatedReadiness: readiness.simulatedReadiness,
          evidenceConfidence: readiness.evidenceConfidence,
          dimensions: evaluation.dimensions,
          primaryBottleneck: evaluation.primaryBottleneck,
          strongestArea: evaluation.strongestArea,
          freeTextResponses,
        })
      : null;

    const result: SimulationResult = {
      id: newId('res'),
      attemptId: attempt.id,
      studentId: student.id,
      targetId: target.id,
      simulationTitle: sim.title,
      dimensions: evaluation.dimensions,
      stageEvaluations: evaluation.stageEvaluations,
      primaryBottleneck: evaluation.primaryBottleneck,
      strongestArea: evaluation.strongestArea,
      biggestRisk: explanation.biggestRisk,
      simulatedReadiness: readiness.simulatedReadiness,
      targetReadinessThreshold: readiness.targetReadinessThreshold,
      gap: readiness.gap,
      evidenceConfidence: readiness.evidenceConfidence,
      readinessState: readiness.readinessState,
      proofRecommended: readiness.proofRecommended,
      reliableAttemptsCounted,
      explanations: explanation.bullets,
      interpretation: explanation.interpretation,
      nextBestAction,
      aiDebrief,
      usedAsEvidence,
      usedAsEvidenceReason,
      createdAt: new Date().toISOString(),
    };
    saveResult(result);

    appendEvent(student.id, attempt.id, timedOut ? 'simulation_expired' : 'simulation_completed', { resultId: result.id });
    if (evaluation.primaryBottleneck) {
      appendEvent(student.id, attempt.id, 'failure_point_detected', { stageId: evaluation.primaryBottleneck.stageId, capabilityId: evaluation.primaryBottleneck.capabilityId });
    }

    let pathChanged = false;
    if (usedAsEvidence) {
      const pathResult = recalculatePath(student.id, target.id);
      pathChanged = pathResult.changed;
      appendEvent(student.id, attempt.id, 'readiness_changed', { simulatedReadiness: readiness.simulatedReadiness, readinessState: readiness.readinessState });
      if (pathChanged) {
        appendEvent(student.id, attempt.id, 'path_updated', { newBottleneck: pathResult.state.currentBottleneck.label });
      }
    }

    return NextResponse.json({ result, pathChanged });
  } catch (err) {
    return handleUnexpected(err);
  }
}
