import { Router, Request, Response } from 'express';
import { store } from '../data/store';
import { assertOwnsStudentId } from '../middleware/auth';
import { summarizeProfile } from '../engine/studentProfile';
import { ROOT_CAUSE_LABELS } from '../types/rootCause';
import { INTERVENTION_META } from '../types/intervention';
import { InterventionHistoryRow } from '../types/domain';
import { PROFIT_LOSS_MICRO_SKILLS, PROFIT_LOSS_SKILL_ID } from '../data/skillGraph';
import { getJourneyState } from '../integration/feature15Client';
import { getMasteryState } from '../integration/feature14Client';

export const historyRouter = Router();
export const profileRouter = Router();
export const journeyRouter = Router();

function skillLabel(skillId: string, microSkillId?: string): string {
  if (microSkillId) {
    const m = PROFIT_LOSS_MICRO_SKILLS.find((ms) => ms.id === microSkillId);
    if (m) return m.label;
  }
  return skillId === PROFIT_LOSS_SKILL_ID ? 'Profit & Loss' : skillId;
}

historyRouter.get('/:studentId/interventions/history', (req: Request, res: Response) => {
  if (!assertOwnsStudentId(req, res, req.params.studentId)) return;
  const skillId = typeof req.query.skillId === 'string' ? req.query.skillId : undefined;
  const records = store.getInterventionHistory(req.params.studentId, skillId);

  const rows: InterventionHistoryRow[] = records.map((r, idx) => {
    const next = records[idx + 1];
    return {
      skillLabel: skillLabel(r.skillId, r.microSkillId),
      rootCauseLabel: ROOT_CAUSE_LABELS[r.rootCause],
      interventionLabel: INTERVENTION_META[r.interventionType].label,
      result:
        r.status === 'completed_improved'
          ? 'Improved'
          : r.status === 'completed_not_improved'
          ? 'Not yet resolved'
          : r.status === 'in_progress'
          ? 'In progress'
          : 'Recommended',
      next: next ? INTERVENTION_META[next.interventionType].label : r.status === 'completed_improved' ? 'Transfer verification' : 'Pending next step',
      createdAt: r.createdAt,
    };
  });

  res.json(rows);
});

profileRouter.get('/:studentId/profile', (req: Request, res: Response) => {
  if (!assertOwnsStudentId(req, res, req.params.studentId)) return;
  const profile = store.getProfile(req.params.studentId);
  res.json(summarizeProfile(profile));
});

journeyRouter.get('/:studentId/journey', (req: Request, res: Response) => {
  if (!assertOwnsStudentId(req, res, req.params.studentId)) return;
  const journey = getJourneyState(req.params.studentId);
  const mastery = getMasteryState(req.params.studentId, PROFIT_LOSS_SKILL_ID);
  res.json({ journey, mastery });
});
