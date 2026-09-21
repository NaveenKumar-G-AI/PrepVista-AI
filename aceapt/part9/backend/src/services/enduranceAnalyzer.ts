import { PerformanceCurvePoint } from '../domain/types';
import { clamp, round1, round2 } from '../util/math';

// ============================================================
// ENDURANCE ANALYZER  (spec sections 22, 23)
// ============================================================
// Deliberately neutral, non-clinical language throughout: this
// reports "late-session performance decline", never fatigue, burnout,
// or any medical/psychological framing (spec is explicit about this
// in section 22).

const DECLINE_THRESHOLD_POINTS = 15; // accuracy-percentage-point drop, beginning -> end

export type EnduranceStatus = 'ENDURANCE_STABLE' | 'ENDURANCE_DECLINE';

export interface EnduranceFinding {
  status: EnduranceStatus;
  confidence: number;
  accuracyDropPoints: number;
}

export class EnduranceAnalyzer {
  analyze(curve: PerformanceCurvePoint[]): EnduranceFinding {
    const begin = curve.find((c) => c.segment === 'beginning')?.accuracy ?? 0;
    const end = curve.find((c) => c.segment === 'end')?.accuracy ?? 0;
    const drop = round1(begin - end);

    return {
      status: drop >= DECLINE_THRESHOLD_POINTS ? 'ENDURANCE_DECLINE' : 'ENDURANCE_STABLE',
      confidence: round2(clamp(Math.abs(drop) / 40, 0, 1)),
      accuracyDropPoints: drop,
    };
  }

  score(finding: EnduranceFinding): number {
    return round1(clamp(100 - Math.max(0, finding.accuracyDropPoints) * 1.5, 0, 100));
  }
}
