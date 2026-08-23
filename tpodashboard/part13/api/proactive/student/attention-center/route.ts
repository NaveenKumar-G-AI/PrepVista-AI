// api/proactive/student/attention-center/route.ts
//
// GET /api/proactive/student/attention-center
//
// Personal-only by construction (section 36): repository.listByStudent()
// is scoped to the logged-in student at the query level, so there is no
// code path here that could return another student's signal, an
// institutional number, or a TPO-only alert.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getRepository } from '../../_shared';
import { renderForAudience } from '../../../../services/signals/audience';

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['STUDENT']);
  if (!session || !session.studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repository = getRepository();
  const personal = await repository.listByStudent(session.studentId);

  const important = personal
    .filter((s) => s.status === 'NEW' || s.status === 'ACKNOWLEDGED')
    .map((s) => ({ id: s.id, ...renderForAudience(s, 'STUDENT') }))
    .filter((s) => s.visible);

  return NextResponse.json({ important });
}
