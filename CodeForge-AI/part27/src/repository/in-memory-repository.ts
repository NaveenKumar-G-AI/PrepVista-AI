import type { SkillEvidence } from '../types/evidence.js';
import type { SkillState, GrowthSnapshot } from '../types/skill-state.js';
import type { GrowthEvent } from '../types/growth-event.js';
import type { GrowthMilestone, MilestoneId } from '../types/milestone.js';
import type { GrowthInsight } from '../types/insight.js';
import type { GrowthRepository } from './growth-repository.js';
import { evidenceIdempotencyKey } from '../evidence/normalize.js';
import { milestoneKey } from '../milestones/milestone-engine.js';

/**
 * Fully functional, dependency-free implementation of GrowthRepository.
 * Used by every unit/integration test in src/__tests__ and by the
 * frontend demo fixture — it is not a mock, it implements every guarantee
 * the interface promises (idempotency, append-only history, ordering).
 */
export class InMemoryGrowthRepository implements GrowthRepository {
  private evidenceByStudent = new Map<string, SkillEvidence[]>();
  private evidenceIdempotencyKeys = new Set<string>();
  private skillStateHistory = new Map<string, SkillState[]>(); // key: `${studentId}:${skillId}`
  private eventsByStudent = new Map<string, GrowthEvent[]>();
  private milestonesByStudent = new Map<string, GrowthMilestone[]>();
  private snapshotsByStudent = new Map<string, GrowthSnapshot[]>();
  private insightsByStudent = new Map<string, GrowthInsight[]>();

  async appendEvidence(evidence: SkillEvidence): Promise<{ inserted: boolean; existing: SkillEvidence | null }> {
    const key = evidenceIdempotencyKey(evidence);
    if (this.evidenceIdempotencyKeys.has(key)) {
      const existing = (this.evidenceByStudent.get(evidence.studentId) ?? []).find((e) => evidenceIdempotencyKey(e) === key) ?? null;
      return { inserted: false, existing };
    }
    this.evidenceIdempotencyKeys.add(key);
    const arr = this.evidenceByStudent.get(evidence.studentId) ?? [];
    arr.push(evidence);
    this.evidenceByStudent.set(evidence.studentId, arr);
    return { inserted: true, existing: null };
  }

  async getEvidenceForSkill(studentId: string, skillId: string): Promise<SkillEvidence[]> {
    return (this.evidenceByStudent.get(studentId) ?? []).filter((e) => e.skillId === skillId);
  }

  async getEvidenceForStudent(studentId: string): Promise<SkillEvidence[]> {
    return [...(this.evidenceByStudent.get(studentId) ?? [])];
  }

  async appendSkillStateSnapshot(state: SkillState): Promise<void> {
    const key = `${state.studentId}:${state.skillId}`;
    const arr = this.skillStateHistory.get(key) ?? [];
    arr.push(state);
    this.skillStateHistory.set(key, arr);
  }

  async getLatestSkillState(studentId: string, skillId: string): Promise<SkillState | null> {
    const arr = this.skillStateHistory.get(`${studentId}:${skillId}`) ?? [];
    return arr.at(-1) ?? null;
  }

  async getAllLatestSkillStates(studentId: string): Promise<SkillState[]> {
    const result: SkillState[] = [];
    for (const [key, arr] of this.skillStateHistory) {
      if (key.startsWith(`${studentId}:`)) {
        const latest = arr.at(-1);
        if (latest) result.push(latest);
      }
    }
    return result;
  }

  async getSkillStateHistory(studentId: string, skillId: string): Promise<SkillState[]> {
    return [...(this.skillStateHistory.get(`${studentId}:${skillId}`) ?? [])];
  }

  async appendGrowthEvent(event: GrowthEvent): Promise<void> {
    const arr = this.eventsByStudent.get(event.studentId) ?? [];
    arr.push(event);
    this.eventsByStudent.set(event.studentId, arr);
  }

  async getGrowthEvents(studentId: string, options?: { skillId?: string; since?: string }): Promise<GrowthEvent[]> {
    let events = [...(this.eventsByStudent.get(studentId) ?? [])];
    if (options?.skillId) events = events.filter((e) => e.skillId === options.skillId);
    if (options?.since) {
      const sinceMs = new Date(options.since).getTime();
      events = events.filter((e) => new Date(e.timestamp).getTime() >= sinceMs);
    }
    return events;
  }

  async appendMilestone(milestone: GrowthMilestone): Promise<void> {
    const arr = this.milestonesByStudent.get(milestone.studentId) ?? [];
    arr.push(milestone);
    this.milestonesByStudent.set(milestone.studentId, arr);
  }

  async getMilestones(studentId: string): Promise<GrowthMilestone[]> {
    return [...(this.milestonesByStudent.get(studentId) ?? [])];
  }

  async getAwardedMilestoneKeys(studentId: string): Promise<Set<string>> {
    const ms = this.milestonesByStudent.get(studentId) ?? [];
    return new Set(ms.map((m) => milestoneKey(m.definitionId as MilestoneId, m.skillId)));
  }

  async appendGrowthSnapshot(snapshot: GrowthSnapshot): Promise<void> {
    const arr = this.snapshotsByStudent.get(snapshot.studentId) ?? [];
    arr.push(snapshot);
    this.snapshotsByStudent.set(snapshot.studentId, arr);
  }

  async getLatestGrowthSnapshot(studentId: string): Promise<GrowthSnapshot | null> {
    return (this.snapshotsByStudent.get(studentId) ?? []).at(-1) ?? null;
  }

  async appendInsight(studentId: string, insight: GrowthInsight): Promise<void> {
    const arr = this.insightsByStudent.get(studentId) ?? [];
    arr.push(insight);
    this.insightsByStudent.set(studentId, arr);
  }

  async getRecentInsights(studentId: string, limit = 10): Promise<GrowthInsight[]> {
    return [...(this.insightsByStudent.get(studentId) ?? [])].slice(-limit).reverse();
  }
}
