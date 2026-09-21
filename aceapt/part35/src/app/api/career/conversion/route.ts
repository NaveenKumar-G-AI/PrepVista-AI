import { NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { listOpportunities, listRecoveryPlansForStudent, logEvent } from '@/lib/db/repository';
import { computeFunnel } from '@/lib/engines/funnel';
import { apiErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const student = await getCurrentStudent();
    const opportunities = listOpportunities(student.id);
    const latestOpportunity = opportunities[0] ?? null;
    const funnel = computeFunnel(student.id);
    const plans = listRecoveryPlansForStudent(student.id);
    const activeRecoveryPlan = plans.find((p) => p.status !== 'completed') ?? plans[0] ?? null;

    logEvent(student.id, 'conversion_overview_viewed');

    return NextResponse.json({
      student: { id: student.id, name: student.name },
      totalOpportunities: opportunities.length,
      latestOpportunity,
      funnel,
      activeRecoveryPlan,
    });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
