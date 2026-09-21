import type { Request, Response } from 'express';
import { skillRepository } from '../../repositories/skill.repository';
import { loadGraphSnapshot } from '../../services/graphQuery.service';
import { getPrerequisites, getDependents, getRelatedSkills, getSkillPath } from '../../services/graphTraversal.service';
import { ApiError } from '../middleware/errorHandler';
import { track, ANALYTICS_EVENTS } from '../../analytics/events';
import type { Skill } from '../../db/schema';

async function resolveSkill(idOrCode: string): Promise<Skill> {
  const byId = await skillRepository.findById(idOrCode);
  if (byId) return byId;
  const byCode = await skillRepository.findByCode(idOrCode);
  if (byCode) return byCode;
  throw new ApiError(404, 'SKILL_NOT_FOUND', `No skill found for "${idOrCode}".`);
}

interface MinimalSkillRef {
  id: string;
  code: string;
  displayName: string;
}

function edgeSummary(edge: { id: string; relationshipType: string; weight: number; confidence: string; rationale?: string | null }, otherSkill: MinimalSkillRef | undefined, direction: 'from' | 'to') {
  return {
    relationshipId: edge.id,
    relationshipType: edge.relationshipType,
    weight: edge.weight,
    confidence: edge.confidence,
    rationale: edge.rationale ?? null,
    skill: otherSkill ? { id: otherSkill.id, code: otherSkill.code, displayName: otherSkill.displayName } : null,
    direction,
  };
}

export const skillGraphController = {
  async list(req: Request, res: Response) {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;
    const snapshot = await loadGraphSnapshot('PUBLISHED');
    const nodes = domain ? snapshot.nodes.filter((n) => n.domain === domain) : snapshot.nodes;
    track(ANALYTICS_EVENTS.SKILL_GRAPH_VIEWED, { domain: domain ?? 'all', userId: req.user?.id });
    res.json({ count: nodes.length, skills: nodes });
  },

  async get(req: Request, res: Response) {
    const skill = await resolveSkill(req.params.skillId);
    track(ANALYTICS_EVENTS.SKILL_NODE_OPENED, { skillCode: skill.code, userId: req.user?.id });
    res.json({ skill });
  },

  async prerequisites(req: Request, res: Response) {
    const skill = await resolveSkill(req.params.skillId);
    const snapshot = await loadGraphSnapshot('PUBLISHED');
    const edges = getPrerequisites(skill.id, snapshot.edges);
    track(ANALYTICS_EVENTS.SKILL_PREREQUISITE_VIEWED, { skillCode: skill.code, userId: req.user?.id });
    res.json({
      skill: { id: skill.id, code: skill.code, displayName: skill.displayName },
      prerequisites: edges.map((e) => edgeSummary(e, snapshot.nodesById.get(e.fromSkillId), 'from')),
    });
  },

  async dependents(req: Request, res: Response) {
    const skill = await resolveSkill(req.params.skillId);
    const snapshot = await loadGraphSnapshot('PUBLISHED');
    const edges = getDependents(skill.id, snapshot.edges);
    track(ANALYTICS_EVENTS.SKILL_DEPENDENT_VIEWED, { skillCode: skill.code, userId: req.user?.id });
    res.json({
      skill: { id: skill.id, code: skill.code, displayName: skill.displayName },
      dependents: edges.map((e) => edgeSummary(e, snapshot.nodesById.get(e.toSkillId), 'to')),
    });
  },

  async related(req: Request, res: Response) {
    const skill = await resolveSkill(req.params.skillId);
    const snapshot = await loadGraphSnapshot('PUBLISHED');
    const edges = getRelatedSkills(skill.id, snapshot.edges);
    res.json({
      skill: { id: skill.id, code: skill.code, displayName: skill.displayName },
      related: edges.map((e) => {
        const otherId = e.fromSkillId === skill.id ? e.toSkillId : e.fromSkillId;
        return edgeSummary(e, snapshot.nodesById.get(otherId), e.fromSkillId === skill.id ? 'to' : 'from');
      }),
    });
  },

  async path(req: Request, res: Response) {
    const from = await resolveSkill(req.params.skillId);
    const to = await resolveSkill(req.params.targetSkillId);
    const snapshot = await loadGraphSnapshot('PUBLISHED');
    const path = getSkillPath(from.id, to.id, snapshot.edges);
    track(ANALYTICS_EVENTS.SKILL_PATH_EXPLORED, { from: from.code, to: to.code, found: Boolean(path), userId: req.user?.id });
    if (!path) {
      return res.json({ found: false, path: [] });
    }
    const resolved = await skillRepository.findByIds(path);
    const byId = new Map(resolved.map((s) => [s.id, s]));
    res.json({
      found: true,
      path: path.map((id) => {
        const s = byId.get(id);
        return s ? { id: s.id, code: s.code, displayName: s.displayName } : { id };
      }),
    });
  },
};
