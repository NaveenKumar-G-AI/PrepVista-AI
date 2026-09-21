import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnership } from '@/lib/auth';
import { addEvidence, getFurthestStage, getOpportunity, logEvent } from '@/lib/db/repository';
import { apiErrorBody, NotFoundError } from '@/lib/errors';
import { addFeedbackSchema, formatZodError } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const student = await getCurrentStudent();
    const opportunity = getOpportunity(params.id);
    if (!opportunity) throw new NotFoundError('Outcome not found.');
    assertOwnership(opportunity.studentId, student.id);

    const json = await request.json();
    const parsed = addFeedbackSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { recruiterFeedbackText, studentReflectionText } = parsed.data;
    if (!recruiterFeedbackText?.trim() && !studentReflectionText?.trim()) {
      return NextResponse.json({ error: 'Add some feedback text before submitting.' }, { status: 400 });
    }

    const furthestStage = getFurthestStage(opportunity.id);
    const created = [];

    if (recruiterFeedbackText?.trim()) {
      created.push(
        addEvidence({
          opportunityId: opportunity.id,
          applicationStageId: furthestStage?.id ?? null,
          evidenceType: 'DIRECT_EVIDENCE',
          source: 'recruiter_feedback',
          failureCategory: null,
          contentText: recruiterFeedbackText.trim(),
        }),
      );
    }
    if (studentReflectionText?.trim()) {
      created.push(
        addEvidence({
          opportunityId: opportunity.id,
          applicationStageId: furthestStage?.id ?? null,
          evidenceType: 'POSSIBLE_CONTRIBUTOR',
          source: 'student_feedback',
          failureCategory: null,
          contentText: studentReflectionText.trim(),
        }),
      );
    }

    logEvent(student.id, 'outcome_feedback_added', { opportunityId: opportunity.id });

    return NextResponse.json({ evidence: created }, { status: 201 });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
