import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGrowthRepository } from '../repository/in-memory-repository.js';
import { processEvidenceBatch } from '../orchestration/growth-pipeline.js';
import type { RawEvidenceInput } from '../types/evidence.js';

/**
 * The section-85 "Golden Scenario", run for real against the in-memory
 * repository through the exact same processEvidenceBatch() the Supabase
 * repository would use in production. Every assertion checks something
 * the pipeline actually computed from the evidence below — nothing here
 * is asserted from a hardcoded expectation independent of the run.
 *
 * Debugging deliberately starts from a real, established baseline (not
 * zero evidence) so it has something concrete to decline FROM — otherwise
 * "regression" is meaningless (section 22: regression is relative to a
 * prior baseline). Evidence sources are intentionally varied across the
 * debugging track (debugging / review / adaptive_learning / consistency /
 * understanding) rather than all tagged 'debugging' — section 9 is
 * explicit that strong growth shouldn't rest on one activity type, and a
 * single-source evidence trail would also structurally cap confidence
 * below HIGH forever (distinct-source count is one of the two confidence
 * inputs), making MASTERED unreachable regardless of how much evidence
 * accumulated.
 */

const STUDENT = 'golden-student';
const iso = (d: string) => new Date(d).toISOString();

describe('Golden Scenario — section 85 end-to-end walkthrough', () => {
  let repo: InMemoryGrowthRepository;
  let idCounter: number;
  const genId = () => `id-${++idCounter}`;

  beforeEach(() => {
    repo = new InMemoryGrowthRepository();
    idCounter = 0;
  });

  it('walks algorithms through improvement + confirmed transfer, and debugging through regression + recovery', async () => {
    // --- Phase 1: algorithm practice (correct, reasoning strong) + a real debugging baseline ---
    const phase1: RawEvidenceInput[] = [
      { studentId: STUDENT, source: 'correctness', sourceRecordId: 'sub-alg-1', skillId: 'algorithms-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-06-01') },
      { studentId: STUDENT, source: 'reasoning', sourceRecordId: 'sub-alg-1-reasoning', skillId: 'algorithms-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.85, timestamp: iso('2026-06-01') },
      { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-a1', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.8, timestamp: iso('2026-06-01') },
      { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-a2', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.7, timestamp: iso('2026-06-02') },
      { studentId: STUDENT, source: 'review', sourceRecordId: 'sub-dbg-a3-review', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.6, timestamp: iso('2026-06-03') },
    ];
    const result1 = await processEvidenceBatch(STUDENT, phase1, repo, { nowIso: iso('2026-06-04'), generateId: genId });
    expect(result1.rejectedInvalidCount).toBe(0);
    expect(result1.updatedSkills.map((s) => s.skillId).sort()).toEqual(['algorithms-1', 'debugging-1']);
    expect((await repo.getLatestSkillState(STUDENT, 'algorithms-1'))?.state).not.toBe('UNKNOWN');

    // --- Phase 2: transfer challenge — correct, across two distinct novel contexts ---
    const phase2: RawEvidenceInput[] = [
      { studentId: STUDENT, source: 'correctness', sourceRecordId: 'sub-alg-transfer-1', skillId: 'algorithms-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-06-10'), transferContext: { isTransferAttempt: true, baseContext: 'arrays', novelContext: 'linked-lists' } },
      { studentId: STUDENT, source: 'correctness', sourceRecordId: 'sub-alg-transfer-2', skillId: 'algorithms-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-06-11'), transferContext: { isTransferAttempt: true, baseContext: 'arrays', novelContext: 'graphs' } },
    ];
    const result2 = await processEvidenceBatch(STUDENT, phase2, repo, { nowIso: iso('2026-06-12'), generateId: genId });
    const algAfter2 = await repo.getLatestSkillState(STUDENT, 'algorithms-1');
    expect(algAfter2?.transfer).toBe('STRONG');
    expect(result2.emittedEvents.some((e) => e.eventType === 'TRANSFER_CONFIRMED' && e.skillId === 'algorithms-1')).toBe(true);

    // --- Phase 3: debugging challenge fails, three times running — a real decline from the phase-1 baseline ---
    const phase3: RawEvidenceInput[] = [
      { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-fail-1', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'negative', strength: 0.7, timestamp: iso('2026-06-20') },
      { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-fail-2', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'negative', strength: 0.8, timestamp: iso('2026-06-21') },
      { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-fail-3', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'negative', strength: 0.7, timestamp: iso('2026-06-22') },
    ];
    const result3 = await processEvidenceBatch(STUDENT, phase3, repo, { nowIso: iso('2026-06-23'), generateId: genId });
    const dbgAfter3 = await repo.getLatestSkillState(STUDENT, 'debugging-1');
    expect(['AT_RISK', 'REGRESSING']).toContain(dbgAfter3?.state);
    expect(result3.emittedEvents.some((e) => e.eventType === 'SKILL_REGRESSED' && e.skillId === 'debugging-1')).toBe(true);

    // --- Remediation occurs; simplified debugging challenge succeeds once — a real signal, not yet decisive ---
    const phase4: RawEvidenceInput[] = [
      { studentId: STUDENT, source: 'adaptive_learning', sourceRecordId: 'sub-dbg-remediation', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.6, timestamp: iso('2026-07-08') },
    ];
    await processEvidenceBatch(STUDENT, phase4, repo, { nowIso: iso('2026-07-09'), generateId: genId });
    expect((await repo.getLatestSkillState(STUDENT, 'debugging-1'))?.state).toBe('RECOVERING');

    // --- Complex debugging challenge succeeds; debugging transfer succeeds across two distinct contexts ---
    const phase5: RawEvidenceInput[] = [
      { studentId: STUDENT, source: 'debugging', sourceRecordId: 'sub-dbg-complex', skillId: 'debugging-1', evidenceType: 'DETERMINISTIC', outcome: 'positive', strength: 0.9, timestamp: iso('2026-07-20') },
      { studentId: STUDENT, source: 'adaptive_learning', sourceRecordId: 'sub-dbg-transfer-1', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.8, timestamp: iso('2026-07-21'), transferContext: { isTransferAttempt: true, baseContext: 'null-checks', novelContext: 'race-conditions' } },
      { studentId: STUDENT, source: 'adaptive_learning', sourceRecordId: 'sub-dbg-transfer-2', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.8, timestamp: iso('2026-07-22'), transferContext: { isTransferAttempt: true, baseContext: 'null-checks', novelContext: 'memory-leaks' } },
    ];
    const result5 = await processEvidenceBatch(STUDENT, phase5, repo, { nowIso: iso('2026-07-23'), generateId: genId });
    const dbgAfter5 = await repo.getLatestSkillState(STUDENT, 'debugging-1');
    expect(['PRACTICED', 'PROFICIENT', 'MASTERED']).toContain(dbgAfter5?.state);
    expect(dbgAfter5?.transfer).toBe('STRONG');
    expect(result5.emittedEvents.some((e) => e.eventType === 'SKILL_RECOVERED' && e.skillId === 'debugging-1')).toBe(true);

    // --- Later: further corroborating evidence from yet more sources ---
    const phase6: RawEvidenceInput[] = [
      { studentId: STUDENT, source: 'consistency', sourceRecordId: 'sub-dbg-followup-1', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.9, timestamp: iso('2026-08-05') },
      { studentId: STUDENT, source: 'understanding', sourceRecordId: 'sub-dbg-followup-2', skillId: 'debugging-1', evidenceType: 'DIRECT', outcome: 'positive', strength: 0.85, timestamp: iso('2026-08-06') },
    ];
    const result6 = await processEvidenceBatch(STUDENT, phase6, repo, { nowIso: iso('2026-08-07'), generateId: genId, debuggingSkillIds: new Set(['debugging-1']) });
    const dbgAfter6 = await repo.getLatestSkillState(STUDENT, 'debugging-1');
    expect(dbgAfter6?.confidence.distinctSources).toBeGreaterThanOrEqual(4);
    // regression never reoccurs once genuinely recovered and reinforced further
    expect(dbgAfter6?.state).not.toBe('AT_RISK');
    expect(dbgAfter6?.state).not.toBe('REGRESSING');

    const milestones = await repo.getMilestones(STUDENT);
    expect(milestones.some((m) => m.definitionId === 'FIRST_RECOVERY' && m.skillId === 'debugging-1')).toBe(true);

    // --- Historical immutability: the full history still contains the dip; nothing was overwritten ---
    const debuggingHistory = await repo.getSkillStateHistory(STUDENT, 'debugging-1');
    expect(debuggingHistory.some((s) => s.state === 'AT_RISK' || s.state === 'REGRESSING')).toBe(true);
    expect(debuggingHistory.length).toBe(5); // one snapshot per batch that touched this skill: phases 1,3,4,5,6

    // --- Idempotency (section 57): replaying the exact same final batch changes nothing ---
    const replay = await processEvidenceBatch(STUDENT, phase6, repo, { nowIso: iso('2026-08-07'), generateId: genId, debuggingSkillIds: new Set(['debugging-1']) });
    expect(replay.skippedDuplicateCount).toBe(phase6.length);
    expect(replay.updatedSkills).toHaveLength(0);
    expect(replay.emittedEvents).toHaveLength(0);
    expect(replay.emittedMilestones).toHaveLength(0);
    expect((await repo.getSkillStateHistory(STUDENT, 'debugging-1')).length).toBe(debuggingHistory.length);
    expect(result6.processedEvidenceIds.length).toBe(phase6.length);
  });
});
