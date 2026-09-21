import { NextResponse } from 'next/server';
import { getCurrentStudent } from '@/lib/auth';
import { listOpportunities, listTrajectoryNotes, logEvent } from '@/lib/db/repository';
import { apiErrorBody } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const NOTE_TITLES: Record<string, string> = {
  outcome: 'Bottleneck identified',
  recovery_completed: 'Recovery completed',
  reassessment: 'Reassessment recorded',
};

export async function GET() {
  try {
    const student = await getCurrentStudent();
    const opportunities = listOpportunities(student.id);
    const notes = listTrajectoryNotes(student.id);

    const events = [
      ...opportunities.map((o) => ({
        date: o.createdAt,
        kind: 'outcome_recorded' as const,
        title: `${o.roleTitle} — ${o.companyName}`,
        detail: 'Outcome recorded.',
      })),
      ...notes.map((n) => ({
        date: n.createdAt,
        kind: n.sourceType,
        title: NOTE_TITLES[n.sourceType] ?? 'Update',
        detail: n.summary,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    logEvent(student.id, 'journey_viewed');

    return NextResponse.json({ events });
  } catch (error) {
    const { status, body } = apiErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
