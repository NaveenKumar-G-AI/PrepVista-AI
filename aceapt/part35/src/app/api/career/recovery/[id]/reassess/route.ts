import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import { addReassessment, addTrajectoryNote, getRecoveryPlan, logEvent } from '@/lib/db/repository';
import { FAILURE_CATEGORY_LABELS } from '@/lib/constants';
import { apiErrorBody, NotFoundError, ValidationError } from '@/lib/errors';
import { formatZodError, reassessSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const RESULT_COPY: Record<string, string> = {
  improved: 'showed improvement',
  no_change: 'showed no measurable change',
  declined: 'showed a decline',
  unclear: 'gave an unclear result',
};

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const plan = getRecoveryPlan(params.id);
    if (!plan) throw new NotFoundError('Recovery plan not found.');
    assertOwnership(plan.studentId, student.id);
    if (plan.status !== 'completed') {
      throw new ValidationError('Complete the recovery plan before recording a reassessment.');
    }

    const json = await request.json();
    const parsed = reassessSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const reassessment = addReassessment(plan.id, parsed.data.result, parsed.data.notes ?? null);

    addTrajectoryNote(
      student.id,
      `Reassessment on ${FAILURE_CATEGORY_LABELS[plan.failureCategory]}: ${RESULT_COPY[parsed.data.result]}.`,
      'reassessment',
      plan.id,
    );
    logEvent(student.id, 'reassessment_completed', { planId: plan.id, result: parsed.data.result });

    return NextResponse.json({ reassessment }, { status: 201 });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
