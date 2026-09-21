import type { DailyMission, LearningAction, PathNode, PathVersion, Skill, WhyThisExplanation } from "../domain/types.js";
import type { Store } from "../repositories/types.js";
import { newId } from "../repositories/inMemoryStore.js";
import { SkillGraph } from "../domain/skillGraph.js";
import { diagnoseSkill } from "../domain/evidence.js";
import { computePriority } from "../domain/priorityEngine.js";
import { explain } from "../domain/explainability.js";
import { generatePath } from "../domain/pathGenerator.js";
import { buildDailyMission } from "../domain/timePlanner.js";
import { emptyEvidence } from "../domain/types.js";
import { makeEvent, NotFoundError } from "./events.js";

export class LearningPathService {
  constructor(private store: Store) {}

  private async loadGraph(): Promise<SkillGraph> {
    const skills = await this.store.getSkillCatalog();
    return new SkillGraph(skills);
  }

  async getCurrentPath(studentId: string): Promise<PathVersion> {
    const existing = await this.store.getLatestPathVersion(studentId);
    if (existing) {
      await this.store.appendEvent(makeEvent(studentId, "PATH_VIEWED", null, null, { versionNumber: existing.versionNumber }));
      return existing;
    }
    return this.regeneratePath(studentId);
  }

  /**
   * Regenerates and persists a new path version from current evidence. This
   * is meant to be called after Feature 3 writes new evidence (Phase 23) —
   * not automatically on every action completion, which would regenerate
   * without anything having actually changed (Phase 61: no fake intelligence).
   */
  async regeneratePath(studentId: string): Promise<PathVersion> {
    const student = await this.store.getStudent(studentId);
    if (!student) throw new NotFoundError(`student ${studentId} not found`);

    const graph = await this.loadGraph();
    const evidenceMap = await this.store.getEvidenceForStudent(studentId);
    const priorVersion = await this.store.getLatestPathVersion(studentId);
    const priorInterventionsBySkill = await this.store.getInterventionsBySkill(studentId);
    const recentAttemptsBySkill = await this.store.getRecentAttemptsBySkill(studentId);
    const events = await this.store.getEvents(studentId);
    const nextVersionNumber = (priorVersion?.versionNumber ?? 0) + 1;

    const version = generatePath({
      context: student,
      graph,
      evidenceMap,
      priorVersion,
      priorInterventionsBySkill,
      recentAttemptsBySkill,
      events,
      nextVersionNumber,
      now: new Date(),
    });

    const persisted = await this.store.savePathVersion(version);
    await this.store.appendEvent(makeEvent(studentId, "PATH_REGENERATED", null, null, { versionNumber: persisted.versionNumber, reason: persisted.reason }));
    return persisted;
  }

  async getPathHistory(studentId: string): Promise<PathVersion[]> {
    return this.store.listPathVersions(studentId);
  }

  async getNextBestAction(studentId: string): Promise<PathNode | null> {
    const path = await this.getCurrentPath(studentId);
    return path.nodes[0] ?? null;
  }

  async getNodeDetail(studentId: string, skillId: string): Promise<{ node: PathNode; skill: Skill; why: WhyThisExplanation } | null> {
    const path = await this.getCurrentPath(studentId);
    const node = path.nodes.find((n) => n.skillId === skillId);
    if (!node) return null;

    const graph = await this.loadGraph();
    const skill = graph.skills.get(skillId);
    if (!skill) return null;

    const student = await this.store.getStudent(studentId);
    if (!student) throw new NotFoundError(`student ${studentId} not found`);
    const evidenceMap = await this.store.getEvidenceForStudent(studentId);
    const evidence = evidenceMap.get(skillId) ?? emptyEvidence(studentId, skillId);
    const diagnosis = diagnoseSkill(evidence);
    const priority = computePriority(skill, diagnosis, node.action.actionType, student, graph, node.action.targetSkillId !== skillId);
    const why = explain(skill, evidence, diagnosis, priority, node.action, graph);

    await this.store.appendEvent(makeEvent(studentId, "NODE_VIEWED", skillId, null));
    return { node, skill, why };
  }

  async explainNode(studentId: string, skillId: string): Promise<WhyThisExplanation | null> {
    const detail = await this.getNodeDetail(studentId, skillId);
    if (!detail) return null;
    await this.store.appendEvent(makeEvent(studentId, "WHY_VIEWED", skillId, null));
    return detail.why;
  }

  /**
   * Materializes today's session: takes the top-priority node, ensures a
   * LearningAction exists for it (creating one if this is the first time
   * it's been surfaced), and builds a time-boxed mission around it.
   */
  async getTodaysMission(studentId: string): Promise<{ mission: DailyMission; action: LearningAction; node: PathNode } | null> {
    const student = await this.store.getStudent(studentId);
    if (!student) throw new NotFoundError(`student ${studentId} not found`);
    const path = await this.getCurrentPath(studentId);
    const topNode = path.nodes[0];
    if (!topNode) return null;

    const existingPending = (await this.store.listActions(studentId, "PENDING")).find(
      (a) => a.skillId === topNode.action.targetSkillId && a.actionType === topNode.action.actionType
    );
    const existingInProgress = (await this.store.listActions(studentId, "IN_PROGRESS")).find((a) => a.skillId === topNode.action.targetSkillId);
    let action = existingInProgress ?? existingPending;

    if (!action) {
      const graph = await this.loadGraph();
      const targetSkill = graph.skills.get(topNode.action.targetSkillId);
      action = await this.store.createAction({
        id: newId("action"),
        studentId,
        skillId: topNode.action.targetSkillId,
        actionType: topNode.action.actionType,
        reason: topNode.action.reason,
        priority: topNode.priorityScore,
        estimatedDuration: targetSkill?.estimatedLearnMinutes ?? topNode.estimatedMinutes,
        targetCapability: targetSkill?.name ?? topNode.skillName,
        difficulty: "FOUNDATION",
        evidenceBasis: topNode.action.evidenceBasis,
        status: "PENDING",
        interventionType: topNode.action.interventionType ?? null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        resultingEvidenceSummary: null,
      });
      await this.store.appendEvent(makeEvent(studentId, "RECOMMENDATION_VIEWED", action.skillId, action.id));
    }

    const mission = buildDailyMission(studentId, student.availableMinutesPerSession, topNode.action.targetSkillId, topNode.action.actionType);
    return { mission, action, node: topNode };
  }
}
