import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { createOutcome, getFurthestStage, listOpportunities, logEvent } from '@/lib/db/repository';
import { apiErrorBody } from '@/lib/errors';
import { createOutcomeSchema, formatZodError } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const student = await getCurrentStudent();
    const opportunities = listOpportunities(student.id).map((o) => ({
      ...o,
      furthestStage: getFurthestStage(o.id),
    }));
    return NextResponse.json({ opportunities });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    const json = await request.json();
    const parsed = createOutcomeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const input = parsed.data;

    const result = createOutcome({
      studentId: student.id,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
      roleCategory: input.roleCategory,
      source: input.source ?? null,
      targetAlignment: input.targetAlignment,
      furthestStageKey: input.furthestStageKey as import('@/lib/types').StageKey,
      furthestStageStatus: input.furthestStageStatus,
      customStageLabel: input.customStageLabel ?? null,
      recruiterFeedbackText: input.recruiterFeedbackText ?? null,
      studentReflectionText: input.studentReflectionText ?? null,
    });

    logEvent(student.id, 'outcome_recorded', { opportunityId: result.opportunity.id });

    return NextResponse.json({ opportunity: result.opportunity }, { status: 201 });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
