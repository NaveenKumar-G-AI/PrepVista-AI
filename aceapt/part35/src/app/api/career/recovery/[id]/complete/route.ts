import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import { getRecoveryPlan, listRecoveryActions, logEvent, updateRecoveryPlanStatus } from '@/lib/db/repository';
import { apiErrorBody, NotFoundError, ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const plan = getRecoveryPlan(params.id);
    if (!plan) throw new NotFoundError('Recovery plan not found.');
    assertOwnership(plan.studentId, student.id);
    if (plan.status === 'completed') {
      return NextResponse.json({ plan });
    }
    if (plan.status !== 'started') {
      throw new ValidationError('Start the recovery plan before completing it.');
    }

    const actions = listRecoveryActions(plan.id);
    const primary = actions.find((a) => a.actionType === 'primary');
    if (!primary || primary.status !== 'completed') {
      throw new ValidationError('Complete the primary action before marking this recovery as done.');
    }

    const updated = updateRecoveryPlanStatus(plan.id, 'completed');
    logEvent(student.id, 'recovery_completed', { planId: plan.id });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
