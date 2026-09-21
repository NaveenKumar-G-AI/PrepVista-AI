import type { Request, Response } from 'express';
import { getCohortSkillDistribution, findWeaknessClusters } from '../../services/cohortGraph.service';

export const cohortGraphController = {
  async getCohort(req: Request, res: Response) {
    const { institutionId } = req.params;
    const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;
    const distribution = await getCohortSkillDistribution(institutionId, domain);
    const clusters = findWeaknessClusters(distribution);
    res.json({ institutionId, skillCount: distribution.length, distribution, weaknessClusters: clusters });
  },
};
