import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { getPathState, listResultsForStudentTarget } from '@/lib/db/repository';
import { getTarget } from '@/lib/content/targets';
import { projectReadiness } from '@/lib/engines/forecast-engine';
import { apiError, handleUnexpected } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  try {
    const student = getCurrentStudent();
    const targetId = req.nextUrl.searchParams.get('targetId') || student.currentTargetId;
    const target = getTarget(targetId);
    if (!target) return apiError('Unknown target', 404);

    const path = getPathState(student.id, targetId) ?? null;
    const reliableResults = listResultsForStudentTarget(student.id, targetId).filter((r) => r.usedAsEvidence);
    const forecast = projectReadiness(reliableResults, target.readinessThreshold);

    return NextResponse.json({ target: { id: target.id, name: target.name }, path, forecast });
  } catch (err) {
    return handleUnexpected(err);
  }
}
