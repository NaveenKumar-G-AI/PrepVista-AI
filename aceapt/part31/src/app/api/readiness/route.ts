import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { getLatestReliableResult, listAttemptsForStudentTarget, listResultsForStudentTarget } from '@/lib/db/repository';
import { getTarget } from '@/lib/content/targets';
import { apiError, handleUnexpected } from '@/lib/api-utils';
import type { ReadinessSnapshot } from '@/lib/db/schema';

export async function GET(req: NextRequest) {
  try {
    const student = getCurrentStudent();
    const targetId = req.nextUrl.searchParams.get('targetId') || student.currentTargetId;
    const target = getTarget(targetId);
    if (!target) return apiError('Unknown target', 404);

    const allAttempts = listAttemptsForStudentTarget(student.id, targetId);
    const totalAttempts = allAttempts.filter((a) => a.status !== 'in_progress').length;
    const reliableResults = listResultsForStudentTarget(student.id, targetId).filter((r) => r.usedAsEvidence);
    const latest = getLatestReliableResult(student.id, targetId);

    const snapshot: ReadinessSnapshot = {
      studentId: student.id,
      targetId,
      simulatedReadiness: latest?.simulatedReadiness ?? null,
      targetReadinessThreshold: target.readinessThreshold,
      gap: latest ? latest.gap : null,
      evidenceConfidence: latest?.evidenceConfidence ?? 'insufficient',
      readinessState: latest?.readinessState ?? 'early',
      proofRecommended: latest?.proofRecommended ?? false,
      totalAttempts,
      reliableAttempts: reliableResults.length,
      lastAttemptAt: allAttempts.length ? allAttempts[allAttempts.length - 1].startedAt : null,
    };

    return NextResponse.json({ snapshot, target: { id: target.id, name: target.name } });
  } catch (err) {
    return handleUnexpected(err);
  }
}
