import { NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { getLatestReliableResult, getPathState, listAttemptsForStudentTarget } from '@/lib/db/repository';
import { getTarget, TARGETS } from '@/lib/content/targets';
import { listSimulationsForTarget } from '@/lib/content/simulations';
import { handleUnexpected } from '@/lib/api-utils';

export async function GET() {
  try {
    const student = getCurrentStudent();
    const target = getTarget(student.currentTargetId)!;
    const path = getPathState(student.id, target.id) ?? null;
    const latestResult = getLatestReliableResult(student.id, target.id) ?? null;
    const attempts = listAttemptsForStudentTarget(student.id, target.id);
    const inProgress = attempts.find((a) => a.status === 'in_progress') ?? null;
    const simulations = listSimulationsForTarget(target.id);

    return NextResponse.json({
      student: { id: student.id, name: student.name },
      target: { id: target.id, name: target.name, readinessThreshold: target.readinessThreshold },
      allTargets: TARGETS.map((t) => ({ id: t.id, name: t.name })),
      path,
      readiness: latestResult
        ? { simulatedReadiness: latestResult.simulatedReadiness, evidenceConfidence: latestResult.evidenceConfidence, readinessState: latestResult.readinessState, gap: latestResult.gap, proofRecommended: latestResult.proofRecommended }
        : null,
      totalAttempts: attempts.filter((a) => a.status !== 'in_progress').length,
      inProgressAttemptId: inProgress?.id ?? null,
      simulationCount: simulations.length,
      primarySimulationId: simulations[0]?.id ?? null,
    });
  } catch (err) {
    return handleUnexpected(err);
  }
}
