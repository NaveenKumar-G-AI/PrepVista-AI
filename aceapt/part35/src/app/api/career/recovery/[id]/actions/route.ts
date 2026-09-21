import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import { getRecoveryPlan, listRecoveryActions, logEvent, updateRecoveryActionStatus } from '@/lib/db/repository';
import { apiErrorBody, NotFoundError, ValidationError } from '@/lib/errors';
import { completeActionSchema, formatZodError } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const plan = getRecoveryPlan(params.id);
    if (!plan) throw new NotFoundError('Recovery plan not found.');
    assertOwnership(plan.studentId, student.id);

    const json = await request.json();
    const parsed = completeActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }

    const actions = listRecoveryActions(plan.id);
    const target = actions.find((a) => a.id === parsed.data.actionId);
    if (!target) throw new NotFoundError('Recovery action not found on this plan.');
    if (plan.status === 'recommended') {
      throw new ValidationError('Start the recovery plan before completing its actions.');
    }

    const nextStatus = target.status === 'completed' ? 'pending' : 'completed';
    const updated = updateRecoveryActionStatus(target.id, nextStatus);

    return NextResponse.json({ action: updated, actions: listRecoveryActions(plan.id) });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
