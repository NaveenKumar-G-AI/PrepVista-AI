import { NextResponse } from 'next/server';
import { getCurrentStudent, assertOwnsRecord } from '@/lib/auth';
import { getAttempt, getResultByAttemptId } from '@/lib/db/repository';
import { apiError, handleUnexpected } from '@/lib/api-utils';

export async function GET(_req: Request, { params }: { params: { attemptId: string } }) {
  try {
    const student = getCurrentStudent();
    const attempt = getAttempt(params.attemptId);
    if (!attempt) return apiError('Attempt not found', 404);
    assertOwnsRecord(attempt.studentId, student.id);

    const result = getResultByAttemptId(attempt.id);
    if (!result) return apiError('This attempt has not been completed yet', 404, { attemptStatus: attempt.status });

    return NextResponse.json({ result });
  } catch (err) {
    return handleUnexpected(err);
  }
}
