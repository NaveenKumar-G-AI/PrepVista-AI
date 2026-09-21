import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { listSimulationsForTarget, simulationTotalDuration } from '@/lib/content/simulations';
import { getTarget } from '@/lib/content/targets';
import { handleUnexpected, apiError } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  try {
    const student = getCurrentStudent();
    const targetId = req.nextUrl.searchParams.get('targetId') || student.currentTargetId;
    const target = getTarget(targetId);
    if (!target) return apiError('Unknown target', 404);

    const simulations = listSimulationsForTarget(targetId).map((sim) => ({
      id: sim.id,
      title: sim.title,
      type: sim.type,
      level: sim.level,
      description: sim.description,
      stageCount: sim.stageTemplates.length,
      totalDurationSeconds: simulationTotalDuration(sim),
    }));

    return NextResponse.json({ target: { id: target.id, name: target.name }, simulations });
  } catch (err) {
    return handleUnexpected(err);
  }
}
