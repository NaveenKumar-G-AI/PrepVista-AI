import { AnswerRecord } from '../domain/types';
import { round1, round2 } from '../util/math';

// ============================================================
// RECOVERY ANALYZER  (spec section 24)
// ============================================================
// Mirrors the spec's worked example exactly: 3+ consecutive wrong
// answers, then checks accuracy across the next window of answered
// questions. A student who stumbles but bounces back is scored better
// on this dimension than one whose performance collapses.

const MIN_STREAK_LENGTH = 3;
const RECOVERY_WINDOW = 5;
const RECOVERY_THRESHOLD = 0.6; // e.g. 4 correct out of next 5

export interface MistakeStreak {
  startIndex: number;
  length: number;
  windowSize: number;
  windowAccuracy: number;
  recovered: boolean;
}

export interface RecoveryFinding {
  detected: boolean;
  confidence: number;
  streaks: MistakeStreak[];
}

export class RecoveryAnalyzer {
  analyze(orderedAnswers: AnswerRecord[]): RecoveryFinding {
    const attempted = orderedAnswers.filter((a) => a.selectedOptionId !== null);
    const streaks: MistakeStreak[] = [];

    let i = 0;
    while (i < attempted.length) {
      if (attempted[i].isCorrect) {
        i++;
        continue;
      }
      let j = i;
      while (j < attempted.length && !attempted[j].isCorrect) j++;
      const streakLength = j - i;

      if (streakLength >= MIN_STREAK_LENGTH) {
        const window = attempted.slice(j, j + RECOVERY_WINDOW);
        const windowAccuracy = window.length ? window.filter((a) => a.isCorrect).length / window.length : 0;
        streaks.push({
          startIndex: i,
          length: streakLength,
          windowSize: window.length,
          windowAccuracy: round2(windowAccuracy),
          recovered: window.length > 0 && windowAccuracy >= RECOVERY_THRESHOLD,
        });
      }
      i = j;
    }

    const recoveredCount = streaks.filter((s) => s.recovered).length;
    return {
      detected: recoveredCount > 0,
      confidence: streaks.length ? round2(recoveredCount / streaks.length) : 0,
      streaks,
    };
  }

  score(finding: RecoveryFinding): number {
    if (finding.streaks.length === 0) return 100; // nothing to recover from
    const recoveredRatio = finding.streaks.filter((s) => s.recovered).length / finding.streaks.length;
    return round1(recoveredRatio * 100);
  }
}
