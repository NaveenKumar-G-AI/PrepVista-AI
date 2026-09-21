import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnsRecord } from '@/lib/auth';
import { getAttempt } from '@/lib/db/repository';
import { getSimulation } from '@/lib/content/simulations';
import { buildRuntimeView } from '@/lib/engines/runtime-view';
import { apiError, handleUnexpected } from '@/lib/api-utils';

export async function GET(_req: Request, { params }: { params: { attemptId: string } }) {
  try {
    const student = getCurrentStudent();
    const attempt = getAttempt(params.attemptId);
    if (!attempt) return apiError('Attempt not found', 404);
    assertOwnsRecord(attempt.studentId, student.id);

    const sim = getSimulation(attempt.simulationId);
    const view = buildRuntimeView(attempt, sim?.rules ?? []);
    return NextResponse.json({ view, simulationTitle: sim?.title ?? 'Simulation' });
  } catch (err) {
    return handleUnexpected(err);
  }
}
