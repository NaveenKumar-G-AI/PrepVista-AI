// api/proactive/tpo/attention-center/route.ts
//
// Next.js App Router handler (adapt trivially to Express/Fastify — the
// service calls below ARE the logic; this file is only transport).
// GET /api/proactive/tpo/attention-center

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getRepository } from '../../_shared';
import { filterSignalsForAudience } from '../../../../services/signals/audience';
import type { ProactiveSignal } from '../../../../services/signals/types';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['TPO']);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repository = getRepository();
  const all = await repository.listByInstitution(session.institutionId);
  const scoped = filterSignalsForAudience(all, 'TPO');

  return NextResponse.json(groupForAttentionCenter(scoped));
}

function isOpen(s: ProactiveSignal): boolean {
  return s.status === 'NEW' || s.status === 'ACKNOWLEDGED' || s.status === 'IN_PROGRESS';
}

/** "Due within 24 hours" — a rolling window, not a calendar-day bucket.
 * True calendar-day bucketing needs the institution's timezone (section
 * 69), which this sandbox has no source for; swap in your real
 * institution-timezone lookup if you want strict "today" semantics. */
function isDueSoon(s: ProactiveSignal, now: number): boolean {
  if (!s.expiresAt) return false;
  const ms = new Date(s.expiresAt).getTime() - now;
  return ms >= 0 && ms <= 24 * 3600 * 1000;
}

function groupForAttentionCenter(signals: ProactiveSignal[]) {
  const now = Date.now();
  const risk = signals.filter((s) => s.polarity === 'RISK');
  const positive = signals.filter((s) => s.polarity === 'POSITIVE');

  return {
    critical: risk.filter((s) => isOpen(s) && s.severity === 'CRITICAL'),
    high: risk.filter((s) => isOpen(s) && s.severity === 'HIGH'),
    today: risk.filter((s) => isOpen(s) && isDueSoon(s, now)),
    new: risk.filter((s) => s.status === 'NEW'),
    snoozed: risk.filter((s) => s.status === 'SNOOZED'),
    resolved: risk.filter((s) => s.status === 'RESOLVED').slice(0, 50),
    positive: positive.filter((s) => s.status !== 'DISMISSED').slice(0, 20),
  };
}
