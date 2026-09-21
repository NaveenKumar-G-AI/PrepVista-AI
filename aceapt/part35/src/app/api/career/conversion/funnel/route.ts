import { NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { logEvent } from '@/lib/db/repository';
import { computeFunnel } from '@/lib/engines/funnel';
import { apiErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const student = await getCurrentStudent();
    const funnel = computeFunnel(student.id);
    logEvent(student.id, 'funnel_viewed');
    return NextResponse.json({ funnel });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
