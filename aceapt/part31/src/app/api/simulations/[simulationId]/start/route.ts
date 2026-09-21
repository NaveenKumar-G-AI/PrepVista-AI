import { NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { getSimulation } from '@/lib/content/simulations';
import { generateBlueprint } from '@/lib/engines/blueprint-engine';
import { buildRuntimeView } from '@/lib/engines/runtime-view';
import { appendEvent, createAttempt, listRecentItemIdsForSimulation } from '@/lib/db/repository';
import { newId } from '@/lib/ids';
import { apiError, handleUnexpected } from '@/lib/api-utils';
import type { SimulationAttempt } from '@/lib/db/schema';

export async function POST(_req: Request, { params }: { params: { simulationId: string } }) {
  try {
    const student = getCurrentStudent();
    const sim = getSimulation(params.simulationId);
    if (!sim) return apiError('Simulation not found', 404);
    if (sim.targetId !== student.currentTargetId) {
      return apiError('This simulation does not match your current target', 409);
    }

    const recentlyUsedIds = listRecentItemIdsForSimulation(student.id, sim.id, 2);
    const blueprint = generateBlueprint(sim, recentlyUsedIds);
    const now = new Date().toISOString();

    const attempt: SimulationAttempt = {
      id: newId('att'),
      studentId: student.id,
      simulationId: sim.id,
      targetId: sim.targetId,
      blueprint,
      status: 'in_progress',
      startedAt: now,
      currentStageIndex: 0,
      currentItemIndex: 0,
      currentItemStartedAt: now,
      responses: [],
      usedAsEvidence: false,
      createdAt: now,
    };

    createAttempt(attempt);
    appendEvent(student.id, attempt.id, 'simulation_started', { simulationId: sim.id, level: sim.level });
    if (blueprint.stages[0]) {
      appendEvent(student.id, attempt.id, 'stage_started', { stageId: blueprint.stages[0].id, title: blueprint.stages[0].title });
    }

    const view = buildRuntimeView(attempt, sim.rules);
    return NextResponse.json({ attemptId: attempt.id, view });
  } catch (err) {
    return handleUnexpected(err);
  }
}
