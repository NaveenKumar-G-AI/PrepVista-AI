import { evidenceRepository, studentStateRepository } from '../repositories/studentState.repository';
import { aggregateEvidence } from './evidenceAggregation.service';
import { getPrerequisiteCandidates, getUpstreamSkills } from './graphTraversal.service';
import { loadGraphSnapshot } from './graphQuery.service';
import { adapters } from '../integrations';
import type { EvidenceAggregate } from '../domain/types';
import type { StudentSkillStateRow } from '../db/schema';

export interface StudentSkillView {
  skillId: string;
  code: string;
  displayName: string;
  domain: string;
  level: string;
  parentId: string | null;
  capability: number | null;
  state: string;
  trend: string | null;
  evidenceCount: number;
  confidence: string;
  lastEvaluatedAt: string | null;
}

/**
 * Recomputes and persists one student's state for one skill from their
 * evidence log (section 66: "recomputed when relevant performance
 * changes"). Prefers the MasteryEngineAdapter's reading when available
 * (section 39 — never let the graph's own estimate override the real
 * mastery engine); falls back to local evidence aggregation only when the
 * adapter has nothing yet.
 */
export async function recomputeStudentSkillState(studentId: string, skillId: string): Promise<StudentSkillStateRow> {
  const events = await evidenceRepository.findByStudentAndSkill(studentId, skillId);
  const retention = await adapters.retention.getRetentionSignal(studentId, skillId);
  const aggregate: EvidenceAggregate = aggregateEvidence(
    events.map((e) => ({ isCorrect: e.isCorrect, weight: e.weight, occurredAt: e.occurredAt })),
    retention?.isDeclining ?? false,
  );

  const masteryReading = await adapters.mastery.getMastery(studentId, skillId);
  const capability = masteryReading?.capability ?? aggregate.capability;
  const state = capability === null ? 'UNKNOWN' : aggregate.state;

  return studentStateRepository.upsert({
    studentId,
    skillId,
    capability,
    state,
    trend: aggregate.trend,
    evidenceCount: aggregate.evidenceCount,
    confidence: aggregate.confidence,
    lastEvaluatedAt: aggregate.evidenceCount > 0 ? new Date() : null,
    masterySourceRef: masteryReading?.masterySourceRef ?? null,
    retentionSourceRef: retention?.retentionSourceRef ?? null,
  });
}

function toView(state: StudentSkillStateRow, skill: { code: string; displayName: string; domain: string; level: string; parentId: string | null }): StudentSkillView {
  return {
    skillId: state.skillId,
    code: skill.code,
    displayName: skill.displayName,
    domain: skill.domain,
    level: skill.level,
    parentId: skill.parentId,
    capability: state.capability,
    state: state.state,
    trend: state.trend,
    evidenceCount: state.evidenceCount,
    confidence: state.confidence,
    lastEvaluatedAt: state.lastEvaluatedAt ? state.lastEvaluatedAt.toISOString() : null,
  };
}

/**
 * Section 32: a student's personal graph, scoped rather than the whole
 * global graph. Returns every PUBLISHED skill joined with that student's
 * state (UNKNOWN when there's no state row yet — never fabricated).
 */
export async function getStudentSkillGraph(studentId: string, opts: { domain?: string } = {}): Promise<StudentSkillView[]> {
  const snapshot = await loadGraphSnapshot('PUBLISHED');
  const states = await studentStateRepository.findByStudent(studentId);
  const stateBySkillId = new Map(states.map((s) => [s.skillId, s]));

  const nodes = opts.domain ? snapshot.nodes.filter((n) => n.domain === opts.domain) : snapshot.nodes;

  return nodes.map((node) => {
    const existing = stateBySkillId.get(node.id);
    if (existing) return toView(existing, node);
    return toView(
      {
        id: '',
        studentId,
        skillId: node.id,
        capability: null,
        state: 'UNKNOWN',
        trend: null,
        evidenceCount: 0,
        confidence: 'NONE',
        lastEvaluatedAt: null,
        masterySourceRef: null,
        retentionSourceRef: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      node,
    );
  });
}

/** Section 46: goal-relevant skills bucketed by state — "8 strong, 6 developing, 4 needs attention, 2 insufficient evidence". */
export async function getSkillCoverage(studentId: string, relevantSkillCodes?: string[]): Promise<Record<string, number> & { total: number }> {
  const all = await getStudentSkillGraph(studentId);
  const scoped = relevantSkillCodes ? all.filter((s) => relevantSkillCodes.includes(s.code)) : all;
  const buckets: Record<string, number> = { UNKNOWN: 0, DEVELOPING: 0, STRONG: 0, MASTERED: 0, MAINTENANCE: 0 };
  for (const s of scoped) buckets[s.state] = (buckets[s.state] ?? 0) + 1;
  return { ...buckets, total: scoped.length };
}

/** Skills below `threshold` with at least LOW confidence — "needs attention", never UNKNOWN skills (section 25). */
export async function getStudentGaps(studentId: string, threshold = 60): Promise<StudentSkillView[]> {
  const all = await getStudentSkillGraph(studentId);
  return all.filter((s) => s.capability !== null && s.capability < threshold).sort((a, b) => (a.capability ?? 0) - (b.capability ?? 0));
}

export interface WeakPrerequisiteResult {
  code: string;
  displayName: string;
  hopDistance: number;
  capability: number | null;
  state: string;
}

/** Section 31/38: getWeakPrerequisites(studentId, skillId) — upstream skills joined with this student's evidence. */
export async function getWeakPrerequisites(studentId: string, skillId: string, threshold = 60): Promise<WeakPrerequisiteResult[]> {
  const snapshot = await loadGraphSnapshot('PUBLISHED');
  const candidates = getPrerequisiteCandidates(skillId, snapshot.edges, 3);
  const results: WeakPrerequisiteResult[] = [];
  for (const c of candidates) {
    const node = snapshot.nodesById.get(c.skillId);
    if (!node) continue;
    const state = await studentStateRepository.findOne(studentId, c.skillId);
    const capability = state?.capability ?? null;
    if (capability !== null && capability < threshold) {
      results.push({ code: node.code, displayName: node.displayName, hopDistance: c.hopDistance, capability, state: state!.state });
    }
  }
  return results.sort((a, b) => a.hopDistance - b.hopDistance || (a.capability ?? 0) - (b.capability ?? 0));
}

/** Re-usable helper for RootCauseService callers: upstream skills (any evidence state, not just weak ones). */
export async function getUpstreamWithState(studentId: string, skillId: string, maxDepth = 3) {
  const snapshot = await loadGraphSnapshot('PUBLISHED');
  const depths = getUpstreamSkills(skillId, snapshot.edges, maxDepth);
  const out: { code: string; hopDistance: number; state: EvidenceAggregate }[] = [];
  for (const [upstreamId, hopDistance] of depths.entries()) {
    const node = snapshot.nodesById.get(upstreamId);
    if (!node) continue;
    const row = await studentStateRepository.findOne(studentId, upstreamId);
    const state: EvidenceAggregate = row
      ? { capability: row.capability, state: row.state as EvidenceAggregate['state'], trend: row.trend as EvidenceAggregate['trend'], evidenceCount: row.evidenceCount, confidence: row.confidence as EvidenceAggregate['confidence'] }
      : { capability: null, state: 'UNKNOWN', trend: null, evidenceCount: 0, confidence: 'NONE' };
    out.push({ code: node.code, hopDistance, state });
  }
  return out;
}
