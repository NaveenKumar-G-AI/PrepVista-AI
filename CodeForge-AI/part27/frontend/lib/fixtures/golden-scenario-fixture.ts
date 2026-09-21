import { InMemoryGrowthRepository } from '@/repository/in-memory-repository.js';
import { processEvidenceBatch } from '@/orchestration/growth-pipeline.js';
import { getGrowthProfile, getSkillHistory, getGrowthTimeline, getMilestones } from '@/api/handlers.js';
import { DenyAllAuthorizationProvider, type AuthorizationProvider } from '@/api/authorization.js';
import type { RawEvidenceInput } from '@/types/evidence.js';
import type { GrowthProfile } from '@/api/handlers.js';
import type { SkillState } from '@/types/skill-state.js';
import type { GrowthEvent } from '@/types/growth-event.js';
import type { GrowthMilestone } from '@/types/milestone.js';

/**
 * Runs the exact section-85 Golden Scenario (same evidence as
 * src/__tests__/golden-scenario.integration.test.ts) through the real
 * pipeline, in-memory, so the demo page has real computed data to render
 * \u2014 not hand-written fake numbers. This is demo/dev-only: a real app
 * fetches this shape from the API routes in src/api/next-routes.example.ts
 * instead of running the pipeline client-side.
 */

const STUDENT = 'golden-student';
const iso = (d: string) => new Date(d).toISOString();

// A student always sees their own data; this fixture only ever reads it
// as the student themself, so a permissive-to-self provider is enough.
class SelfOnlyAuthorizationProvider implements AuthorizationProvider {
  async isAuthorizedInstructorFor(): Promise<boolean> {
    return false;
  }
}

export interface GoldenScenarioData {
  profile: GrowthProfile;
  debuggingHistory: SkillState[];
  algorithmsHistory: SkillState[];
  timeline: GrowthEvent[];
  milestones: GrowthMilestone[];
  skillLabels: Record<string, string>;
}

export async function loadGoldenScenarioFixture(): Promise<GoldenScenarioData> {
  const repo = new InMemoryGrowthRepository();
  const authz: AuthorizationProvider = new SelfOnlyAuthorizationProvider();
  let idCounter = 0;
  const genId = () => `fixture-${++idCounter}`;

  const phase1: RawEvidenceInput[] = [
    { studentId: STUDENT, source: 'correctness', sourceRecordId: 'sub-alg-1', skillId: 'algorithms-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-06-01') },
    { studentId: STUDENT, source: 'reasoning', sourceRecordId: 'sub-alg-1-reasoning', skillId: 'algorithms-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.85, timestamp: iso('2026-06-01') },
    { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-a1', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.8, timestamp: iso('2026-06-01') },
    { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-a2', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.7, timestamp: iso('2026-06-02') },
    { studentId: STUDENT, source: 'review', sourceRecordId: 'sub-dbg-a3-review', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.6, timestamp: iso('2026-06-03') },
  ];
  await processEvidenceBatch(STUDENT, phase1, repo, { nowIso: iso('2026-06-04'), generateId: genId });

  const phase2: RawEvidenceInput[] = [
    { studentId: STUDENT, source: 'correctness', sourceRecordId: 'sub-alg-transfer-1', skillId: 'algorithms-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-06-10'), transferContext: { isTransferAttempt: true, baseContext: 'arrays', novelContext: 'linked-lists' } },
    { studentId: STUDENT, source: 'correctness', sourceRecordId: 'sub-alg-transfer-2', skillId: 'algorithms-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-06-11'), transferContext: { isTransferAttempt: true, baseContext: 'arrays', novelContext: 'graphs' } },
  ];
  await processEvidenceBatch(STUDENT, phase2, repo, { nowIso: iso('2026-06-12'), generateId: genId });

  const phase3: RawEvidenceInput[] = [
    { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-fail-1', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'negative', strength: 0.7, timestamp: iso('2026-06-20') },
    { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-fail-2', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'negative', strength: 0.8, timestamp: iso('2026-06-21') },
    { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-fail-3', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'negative', strength: 0.7, timestamp: iso('2026-06-22') },
  ];
  await processEvidenceBatch(STUDENT, phase3, repo, { nowIso: iso('2026-06-23'), generateId: genId });

  const phase4: RawEvidenceInput[] = [
    { studentId: STUDENT, source: 'adaptive_learning', sourceRecordId: 'sub-dbg-remediation', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.6, timestamp: iso('2026-07-08') },
  ];
  await processEvidenceBatch(STUDENT, phase4, repo, { nowIso: iso('2026-07-09'), generateId: genId });

  const phase5: RawEvidenceInput[] = [
    { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-complex', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-07-20') },
    { studentId: STUDENT, source: 'adaptive_learning', sourceRecordId: 'sub-dbg-transfer-1', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.8, timestamp: iso('2026-07-21'), transferContext: { isTransferAttempt: true, baseContext: 'null-checks', novelContext: 'race-conditions' } },
    { studentId: STUDENT, source: 'adaptive_learning', sourceRecordId: 'sub-dbg-transfer-2', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.8, timestamp: iso('2026-07-22'), transferContext: { isTransferAttempt: true, baseContext: 'null-checks', novelContext: 'memory-leaks' } },
  ];
  await processEvidenceBatch(STUDENT, phase5, repo, { nowIso: iso('2026-07-23'), generateId: genId });

  const phase6: RawEvidenceInput[] = [
    { studentId: STUDENT, source: 'consistency', sourceRecordId: 'sub-dbg-followup-1', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.9, timestamp: iso('2026-08-05') },
    { studentId: STUDENT, source: 'understanding', sourceRecordId: 'sub-dbg-followup-2', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.85, timestamp: iso('2026-08-06') },
  ];
  await processEvidenceBatch(STUDENT, phase6, repo, { nowIso: iso('2026-08-07'), generateId: genId, debuggingSkillIds: new Set(['debugging-1']) });

  const [profile, debuggingHistory, algorithmsHistory, timeline, milestones] = await Promise.all([
    getGrowthProfile(STUDENT, STUDENT, repo, authz),
    getSkillHistory(STUDENT, 'debugging-1', STUDENT, repo, authz),
    getSkillHistory(STUDENT, 'algorithms-1', STUDENT, repo, authz),
    getGrowthTimeline(STUDENT, STUDENT, repo, authz),
    getMilestones(STUDENT, STUDENT, repo, authz),
  ]);

  return {
    profile,
    debuggingHistory,
    algorithmsHistory,
    timeline,
    milestones,
    skillLabels: { 'algorithms-1': 'Algorithmic problem solving', 'debugging-1': 'Debugging' },
  };
}

// Re-exported so the demo page (and anyone importing this fixture) can
// build a real AuthorizationProvider for an instructor-view demo without
// pulling in the deny-all default and wondering why every call 403s.
export { DenyAllAuthorizationProvider };
