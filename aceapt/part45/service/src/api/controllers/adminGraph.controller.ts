import type { Request, Response } from 'express';
import * as graphAdmin from '../../services/graphAdmin.service';
import { graphVersionRepository } from '../../repositories/graphVersion.repository';
import { skillRepository } from '../../repositories/skill.repository';
import { adapters } from '../../integrations';
import { ApiError } from '../middleware/errorHandler';

export const adminGraphController = {
  async createSkill(req: Request, res: Response) {
    const input = graphAdmin.CreateSkillInput.parse(req.body);
    const skill = await graphAdmin.createSkill(input);
    res.status(201).json({ skill });
  },

  async updateSkill(req: Request, res: Response) {
    const input = graphAdmin.UpdateSkillInput.parse(req.body);
    const skill = await graphAdmin.updateSkill(req.params.skillId, input);
    res.json({ skill });
  },

  async createRelationship(req: Request, res: Response) {
    const input = graphAdmin.CreateRelationshipInput.parse(req.body);
    const relationship = await graphAdmin.createRelationship(input);
    res.status(201).json({ relationship });
  },

  async updateRelationship(req: Request, res: Response) {
    const input = graphAdmin.UpdateRelationshipInput.parse(req.body);
    const relationship = await graphAdmin.updateRelationship(req.params.relationshipId, input);
    res.json({ relationship });
  },

  async validate(_req: Request, res: Response) {
    const report = await graphAdmin.validateProposedGraph();
    res.json(report);
  },

  async publish(_req: Request, res: Response) {
    const result = await graphAdmin.publishPendingChanges();
    res.status(result.published ? 200 : 422).json(result);
  },

  async rollback(req: Request, res: Response) {
    const version = await graphAdmin.rollbackToVersion(req.params.versionId);
    res.json({ version });
  },

  async listVersions(_req: Request, res: Response) {
    const versions = await graphVersionRepository.listAll();
    res.json({ versions });
  },

  /** Section 18-19: AI can only ever propose. This never writes to the graph — it returns suggestions for a human to review and separately POST as a normal relationship (status DRAFT, source AI_SUGGESTED). */
  async suggestRelationships(req: Request, res: Response) {
    if (!adapters.aiSuggestion.isAvailable()) {
      return res.status(503).json({ error: 'AI_SUGGESTIONS_UNAVAILABLE', message: 'ANTHROPIC_API_KEY is not configured. Every other part of Feature 45 works without it (section 69).' });
    }
    const { fromSkillId, toSkillId } = req.body as { fromSkillId?: string; toSkillId?: string };
    if (!fromSkillId || !toSkillId) throw new ApiError(400, 'MISSING_SKILLS', 'fromSkillId and toSkillId are required.');
    const [from, to] = await Promise.all([skillRepository.findById(fromSkillId), skillRepository.findById(toSkillId)]);
    if (!from || !to) throw new ApiError(404, 'SKILL_NOT_FOUND', 'One or both skills do not exist.');

    const suggestion = await adapters.aiSuggestion.suggestRelationship({
      fromSkillName: from.displayName,
      toSkillName: to.displayName,
      domainContext: from.domain,
    });
    if (!suggestion) {
      return res.status(502).json({ error: 'AI_SUGGESTION_FAILED', message: 'The AI adapter could not produce a usable suggestion.' });
    }
    res.json({
      suggestion: {
        fromSkillId,
        toSkillId,
        ...suggestion,
        source: 'AI_SUGGESTED',
        status: 'DRAFT',
        note: 'This is a proposal only. POST it to /admin/skill-graph/relationships to create it as a real DRAFT relationship pending human review — nothing is written automatically.',
      },
    });
  },
};
