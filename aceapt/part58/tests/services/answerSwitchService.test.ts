import { describe, expect, it } from 'vitest';
import { AnswerSwitchService } from '../../src/services/answerSwitchService';
import { baseDecisionEventInput } from '../fakes';
import type { DecisionEvent } from '../../src/types';

function asEvent(overrides: Partial<DecisionEvent>): DecisionEvent {
  return {
    ...baseDecisionEventInput(),
    id: 'e1',
    isCorrect: null,
    decisionQuality: null,
    createdAt: new Date().toISOString(),
    decidedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AnswerSwitchService.evaluateSwitchSupport', () => {
  const service = new AnswerSwitchService();

  it('classifies an evidence-backed switch as EVIDENCE_BASED (§49, §167)', () => {
    const event = asEvent({
      answerChanged: true,
      evidenceUsed: [{ type: 'NEW_EVIDENCE_FOR_SWITCH', level: 'SELF_REPORTED', note: 'contradiction found' }],
    });
    expect(service.evaluateSwitchSupport(event)).toBe('EVIDENCE_BASED');
  });

  it('classifies a switch with no recorded evidence as UNSUPPORTED, never as automatically wrong (§50, §168)', () => {
    const event = asEvent({ answerChanged: true, evidenceUsed: [] });
    expect(service.evaluateSwitchSupport(event)).toBe('UNSUPPORTED');
  });

  it('does not apply to a decision where the answer was not changed', () => {
    const event = asEvent({ answerChanged: false });
    expect(service.evaluateSwitchSupport(event)).toBe('NOT_APPLICABLE');
  });

  it('never teaches "first answer is best": kept-and-wrong is tracked descriptively, not penalized specially', () => {
    const events = [
      asEvent({ id: 'a', action: 'KEEP_ANSWER', answerChanged: false, isCorrect: false }),
      asEvent({ id: 'b', action: 'KEEP_ANSWER', answerChanged: false, isCorrect: true }),
      asEvent({ id: 'c', answerChanged: true, isCorrect: true }),
      asEvent({ id: 'd', answerChanged: true, isCorrect: false }),
    ];
    const breakdown = service.classify(events);
    expect(breakdown).toEqual({ changedCorrect: 1, changedWrong: 1, keptCorrect: 1, keptWrong: 1 });
  });

  it('ignores ungraded events when building the descriptive breakdown', () => {
    const events = [asEvent({ answerChanged: true, isCorrect: null })];
    expect(service.classify(events)).toEqual({ changedCorrect: 0, changedWrong: 0, keptCorrect: 0, keptWrong: 0 });
  });
});
