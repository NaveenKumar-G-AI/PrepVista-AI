import type { Request, Response } from 'express';
import { getStudentSkillGraph, getStudentGaps, getSkillCoverage } from '../../services/studentSkillState.service';
import { getPrioritySignals, getRootCauseSignal } from '../../services/graphIntelligence.service';
import { skillRepository } from '../../repositories/skill.repository';
import { ApiError } from '../middleware/errorHandler';
import { track, ANALYTICS_EVENTS } from '../../analytics/events';

export const studentGraphController = {
  async getGraph(req: Request, res: Response) {
    const { studentId } = req.params;
    const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;
    const skills = await getStudentSkillGraph(studentId, { domain });
    track(ANALYTICS_EVENTS.SKILL_GRAPH_VIEWED, { studentId, scope: 'personal' });
    res.json({ studentId, count: skills.length, skills });
  },

  async getGaps(req: Request, res: Response) {
    const { studentId } = req.params;
    const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
    const gaps = await getStudentGaps(studentId, threshold);
    track(ANALYTICS_EVENTS.SKILL_GAP_VIEWED, { studentId, count: gaps.length });
    res.json({ studentId, count: gaps.length, gaps });
  },

  async getPriorities(req: Request, res: Response) {
    const { studentId } = req.params;
    const result = await getPrioritySignals(studentId);
    res.json({ studentId, goal: result.goal, priorities: result.priorities.slice(0, 20) });
  },

  async getRootCause(req: Request, res: Response) {
    const { studentId, skillCode } = req.params;
    const skill = (await skillRepository.findById(skillCode)) ?? (await skillRepository.findByCode(skillCode));
    if (!skill) throw new ApiError(404, 'SKILL_NOT_FOUND', `No skill found for "${skillCode}".`);
    const signal = await getRootCauseSignal(studentId, skill.code);
    res.json(signal);
  },

  async getCoverage(req: Request, res: Response) {
    const { studentId } = req.params;
    const goalScoped = req.query.goalScoped === 'true';
    let relevantCodes: string[] | undefined;
    if (goalScoped) {
      const priorities = await getPrioritySignals(studentId);
      relevantCodes = priorities.priorities.filter((p) => p.signals.isGoalRelevant).map((p) => p.skillCode);
    }
    const coverage = await getSkillCoverage(studentId, relevantCodes);
    res.json({ studentId, goalScoped, coverage });
  },
};
