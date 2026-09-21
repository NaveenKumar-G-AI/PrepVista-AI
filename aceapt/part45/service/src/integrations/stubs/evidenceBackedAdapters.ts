// ---------------------------------------------------------------------------
// STUB ADAPTERS — exist only so this service is runnable and testable
// standalone, with no external ACEAPT systems available. They derive their
// answers from this service's OWN skill_evidence_events table using the
// same aggregation function StudentSkillStateService uses.
//
// This is a real limitation, not a hidden one: it means the stub mastery
// "engine" is really just this service re-reading its own evidence, so it
// cannot know about anything ACEAPT's real Mastery/Mistake/Retention
// Engines know that never reached this service as an event (section 67).
// Delete this file's usage and implement the interfaces in
// src/integrations/types.ts against the real systems before relying on this
// in production — see service/README.md "Wiring in real ACEAPT systems".
// ---------------------------------------------------------------------------

import { evidenceRepository } from '../../repositories/studentState.repository';
import { aggregateEvidence } from '../../services/evidenceAggregation.service';
import type { MasteryEngineAdapter, MistakeEngineAdapter, RetentionEngineAdapter } from '../types';

export const masteryEngineStub: MasteryEngineAdapter = {
  async getMastery(studentId, skillId) {
    const events = await evidenceRepository.findByStudentAndSkill(studentId, skillId);
    if (events.length === 0) return null;
    const aggregate = aggregateEvidence(events.map((e) => ({ isCorrect: e.isCorrect, weight: e.weight, occurredAt: e.occurredAt })));
    if (aggregate.capability === null) return null;
    return { capability: aggregate.capability, masterySourceRef: `stub-evidence-aggregate:${studentId}:${skillId}` };
  },
};

export const mistakeEngineStub: MistakeEngineAdapter = {
  async getMistakeSignals(studentId, skillId) {
    const events = await evidenceRepository.findByStudentAndSkill(studentId, skillId);
    return events
      .filter((e) => e.eventType === 'MISTAKE')
      .map((e) => ({ skillId, weight: e.weight, occurredAt: e.occurredAt, sourceRef: e.sourceRef ?? e.id }));
  },
};

export const retentionEngineStub: RetentionEngineAdapter = {
  async getRetentionSignal(studentId, skillId) {
    const events = await evidenceRepository.findByStudentAndSkill(studentId, skillId, 12);
    if (events.length < 4) return null;
    const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const gradable = sorted.filter((e) => e.isCorrect !== null);
    if (gradable.length < 4) return null;
    const mid = Math.floor(gradable.length / 2);
    const firstHalf = gradable.slice(0, mid);
    const secondHalf = gradable.slice(mid);
    const rate = (arr: typeof gradable) => (arr.filter((e) => e.isCorrect).length / arr.length) * 100;
    const wasStrong = rate(firstHalf) >= 85;
    const isDeclining = wasStrong && rate(secondHalf) < rate(firstHalf) - 10;
    return { isDeclining, retentionSourceRef: `stub-recency-check:${studentId}:${skillId}` };
  },
};
