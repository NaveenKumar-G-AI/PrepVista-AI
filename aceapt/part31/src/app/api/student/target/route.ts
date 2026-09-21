import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { setStudentTarget } from '@/lib/db/repository';
import { getTarget, TARGETS } from '@/lib/content/targets';
import { apiError, handleUnexpected } from '@/lib/api-utils';

export async function GET() {
  return NextResponse.json({ targets: TARGETS.map((t) => ({ id: t.id, name: t.name, description: t.description })) });
}

export async function POST(req: NextRequest) {
  try {
    const student = getCurrentStudent();
    const body = await req.json();
    const targetId = body?.targetId;
    if (!targetId || !getTarget(targetId)) return apiError('Unknown target', 400);
    const updated = setStudentTarget(student.id, targetId);
    return NextResponse.json({ student: updated });
  } catch (err) {
    return handleUnexpected(err);
  }
}
