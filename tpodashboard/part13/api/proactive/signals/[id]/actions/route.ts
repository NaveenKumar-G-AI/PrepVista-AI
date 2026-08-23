// api/proactive/signals/[id]/actions/route.ts
//
// POST /api/proactive/signals/{id}/actions
// body: { action: 'acknowledge' | 'snooze' | 'resolve' | 'dismiss' | 'feedback', ... }

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getRepository } from '../../../_shared';

type ActionBody =
  | { action: 'acknowledge' }
  | { action: 'snooze'; hours: number }
  | { action: 'resolve'; resolutionEvidence: string }
  | { action: 'dismiss' }
  | { action: 'feedback'; feedback: 'false_positive' | 'useful' | 'acted_upon' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(req, ['TPO', 'MANAGEMENT']);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repository = getRepository();
  const signal = await repository.get(params.id);
  if (!signal || signal.institutionId !== session.institutionId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json()) as ActionBody;
  const now = new Date().toISOString();

  switch (body.action) {
    case 'acknowledge':
      // "I have seen this" — deliberately does not change resolution
      // state (section 19: acknowledged \u2260 resolved).
      await repository.update(signal.id, { status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgedBy: session.userId });
      break;

    case 'snooze': {
      const until = new Date(Date.now() + body.hours * 3600 * 1000).toISOString();
      await repository.update(signal.id, { status: 'SNOOZED', snoozedUntil: until });
      break;
    }

    case 'resolve':
      await repository.update(signal.id, {
        status: 'RESOLVED',
        resolvedAt: now,
        resolvedBy: session.userId,
        resolutionEvidence: body.resolutionEvidence,
      });
      break;

    case 'dismiss':
      await repository.update(signal.id, { status: 'DISMISSED', dismissedAt: now });
      break;

    case 'feedback':
      // Sections 60/61 — tracked for signal-quality analytics; NEVER
      // auto-weakens the underlying threshold, only flags it for review.
      await repository.update(signal.id, {
        updateHistory: [...signal.updateHistory, { at: now, note: `Feedback: ${body.feedback}` }],
      });
      break;

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const updated = await repository.get(signal.id);
  return NextResponse.json(updated);
}
