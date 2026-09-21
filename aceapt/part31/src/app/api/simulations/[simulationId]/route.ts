import { NextResponse } from 'next/server';
import { getSimulation, simulationTotalDuration } from '@/lib/content/simulations';
import { getTarget } from '@/lib/content/targets';
import { appendEvent } from '@/lib/db/repository';
import { getCurrentStudent } from '@/lib/auth';
import { apiError, handleUnexpected } from '@/lib/api-utils';

export async function GET(_req: Request, { params }: { params: { simulationId: string } }) {
  try {
    const student = getCurrentStudent();
    const sim = getSimulation(params.simulationId);
    if (!sim) return apiError('Simulation not found', 404);
    const target = getTarget(sim.targetId);

    appendEvent(student.id, null, 'simulation_viewed', { simulationId: sim.id });

    return NextResponse.json({
      id: sim.id,
      title: sim.title,
      type: sim.type,
      level: sim.level,
      description: sim.description,
      rules: sim.rules,
      target: target ? { id: target.id, name: target.name } : null,
      totalDurationSeconds: simulationTotalDuration(sim),
      stages: sim.stageTemplates.map((st) => ({ title: st.title, purpose: st.purpose, itemCount: st.itemCount, timeBudgetSeconds: st.timeBudgetSeconds, transfer: st.transfer })),
    });
  } catch (err) {
    return handleUnexpected(err);
  }
}
