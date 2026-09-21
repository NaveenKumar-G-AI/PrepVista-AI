/**
 * AnswerSwitchService (§47-51, §137, §167-168, §234). Never teaches "first
 * answer is best" or "never change" — only whether a given switch (or keep)
 * was accompanied by recorded new evidence.
 */
import type { DecisionEvent } from '../types';

export interface SwitchQualityBreakdown {
  changedCorrect: number;
  changedWrong: number;
  keptCorrect: number;
  keptWrong: number;
}

export type SwitchSupport = 'EVIDENCE_BASED' | 'UNSUPPORTED' | 'NOT_APPLICABLE';

export class AnswerSwitchService {
  /** Purely descriptive breakdown (§51) — not proof of a universal rule either way. */
  classify(events: DecisionEvent[]): SwitchQualityBreakdown {
    const result: SwitchQualityBreakdown = { changedCorrect: 0, changedWrong: 0, keptCorrect: 0, keptWrong: 0 };
    for (const event of events) {
      if (event.isCorrect === null) continue;
      if (event.answerChanged) {
        if (event.isCorrect) result.changedCorrect += 1;
        else result.changedWrong += 1;
      } else if (event.action === 'KEEP_ANSWER') {
        if (event.isCorrect) result.keptCorrect += 1;
        else result.keptWrong += 1;
      }
    }
    return result;
  }

  /** §48-50, §234: the only principle taught is evidence-based switching. */
  evaluateSwitchSupport(event: DecisionEvent): SwitchSupport {
    if (!event.answerChanged) return 'NOT_APPLICABLE';
    const hasNewEvidence = event.evidenceUsed.some(
      (signal) => signal.type === 'NEW_EVIDENCE_FOR_SWITCH' || signal.level === 'VERIFIED' || signal.level === 'OBSERVED'
    );
    return hasNewEvidence ? 'EVIDENCE_BASED' : 'UNSUPPORTED';
  }
}
