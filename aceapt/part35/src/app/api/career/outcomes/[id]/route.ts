import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import { logEvent } from '@/lib/db/repository';
import { loadOutcomeDetail } from '@/lib/outcomeDetail';
import { apiErrorBody, NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const detail = await loadOutcomeDetail(params.id, student.id);
    if (!detail) throw new NotFoundError('Outcome not found.');
    assertOwnership(detail.opportunity.studentId, student.id);

    logEvent(student.id, 'outcome_viewed', { opportunityId: detail.opportunity.id });

    return NextResponse.json({
      opportunity: detail.opportunity,
      stages: detail.stages,
      furthestStage: detail.furthestStage,
      evidence: detail.evidence,
      analysis: detail.analysis,
      narrative: {
        summary: detail.narrativeSummary,
        patternExplanation: detail.patternExplanation,
        aiAvailable: detail.aiAvailable,
      },
      existingRecoveryPlanId: detail.existingRecoveryPlan?.id ?? null,
    });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
