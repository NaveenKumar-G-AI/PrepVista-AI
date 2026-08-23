// api/proactive/management/intelligence/route.ts
//
// GET /api/proactive/management/intelligence
//
// Strategic and aggregate only (sections 43/73) — generateManagementBriefing
// already filters to signals whose audiences[] includes MANAGEMENT, so
// TPO-only operational signals can't leak through here regardless of what
// this route does or doesn't do.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getRepository } from '../../_shared';
import { generateManagementBriefing } from '../../../../services/briefings/briefingGenerator';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['MANAGEMENT']);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repository = getRepository();
  const all = await repository.listByInstitution(session.institutionId);
  const briefing = generateManagementBriefing(session.institutionId, all);

  return NextResponse.json(briefing);
}
