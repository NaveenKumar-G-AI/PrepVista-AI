import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import {
  getOpportunity,
  getRecoveryPlan,
  getReassessmentsForPlan,
  listRecoveryActions,
  listRecoveryPlansForStudent,
  listReassessmentsForStudent,
  logEvent,
} from '@/lib/db/repository';
import { detectSameMistake } from '@/lib/engines/sameMistake';
import { apiErrorBody, NotFoundError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const plan = getRecoveryPlan(params.id);
    if (!plan) throw new NotFoundError('Recovery plan not found.');
    assertOwnership(plan.studentId, student.id);

    const actions = listRecoveryActions(plan.id);
    const reassessments = getReassessmentsForPlan(plan.id);
    const opportunity = plan.opportunityId ? getOpportunity(plan.opportunityId) : null;

    const priorPlans = listRecoveryPlansForStudent(student.id).filter((p) => p.id !== plan.id);
    const priorReassessments = listReassessmentsForStudent(student.id);
    const sameMistake = detectSameMistake(priorPlans, priorReassessments, plan.failureCategory);

    logEvent(student.id, 'recovery_plan_viewed', { planId: plan.id });

    return NextResponse.json({ plan, actions, reassessments, opportunity, sameMistake });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
