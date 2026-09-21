import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { listResultsForStudentTarget } from '@/lib/db/repository';
import { getTarget } from '@/lib/content/targets';
import { apiError, handleUnexpected } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  try {
    const student = getCurrentStudent();
    const targetId = req.nextUrl.searchParams.get('targetId') || student.currentTargetId;
    const target = getTarget(targetId);
    if (!target) return apiError('Unknown target', 404);
    const results = listResultsForStudentTarget(student.id, targetId);

    const attempts = results.map((r) => ({
      attemptId: r.attemptId,
      resultId: r.id,
      createdAt: r.createdAt,
      simulationTitle: r.simulationTitle,
      simulatedReadiness: r.simulatedReadiness,
      evidenceConfidence: r.evidenceConfidence,
      readinessState: r.readinessState,
      usedAsEvidence: r.usedAsEvidence,
      primaryBottleneckLabel: r.primaryBottleneck?.label ?? null,
      dimensions: r.dimensions,
    }));

    const compareParam = req.nextUrl.searchParams.get('compare');
    let comparison = null;
    if (compareParam) {
      const [aId, bId] = compareParam.split(',');
      const a = results.find((r) => r.attemptId === aId);
      const b = results.find((r) => r.attemptId === bId);
      if (a && b) {
        comparison = {
          a: { attemptId: a.attemptId, createdAt: a.createdAt, dimensions: a.dimensions, simulatedReadiness: a.simulatedReadiness },
          b: { attemptId: b.attemptId, createdAt: b.createdAt, dimensions: b.dimensions, simulatedReadiness: b.simulatedReadiness },
        };
      } else {
        return apiError('One or both attempts to compare were not found', 404);
      }
    }

    return NextResponse.json({ attempts, comparison, targetReadinessThreshold: target.readinessThreshold });
  } catch (err) {
    return handleUnexpected(err);
  }
}
