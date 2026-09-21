import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import { getRecoveryPlan, logEvent, updateRecoveryPlanStatus } from '@/lib/db/repository';
import { apiErrorBody, NotFoundError, ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const plan = getRecoveryPlan(params.id);
    if (!plan) throw new NotFoundError('Recovery plan not found.');
    assertOwnership(plan.studentId, student.id);
    if (plan.status !== 'recommended') {
      throw new ValidationError('This recovery plan has already been started.');
    }

    const updated = updateRecoveryPlanStatus(plan.id, 'started');
    logEvent(student.id, 'recovery_started', { planId: plan.id });

    return NextResponse.json({ plan: updated });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
