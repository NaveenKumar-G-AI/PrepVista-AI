/**
 * Section 31: Feature 13 (Continuous Readiness & Exam-Condition Performance
 * Engine) asks "can the student perform under realistic conditions?" —
 * a different question from Feature 14's "does the student genuinely
 * understand and transfer the skill?". This file defines what Feature 14
 * hands Feature 13, not a reimplementation of Feature 13 itself.
 */

import { MasteryState, SkillAnalysis } from '../domain/types';

export interface ReadinessSignal {
  studentId: string;
  skillId: string;
  skillName: string;
  state: MasteryState;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  eligibleForMixedAssessment: boolean;
  reason: string;
}

export interface ReadinessEngine {
  getEligibleSkills(studentId: string, analyses: Map<string, SkillAnalysis>): ReadinessSignal[];
}

const ELIGIBLE_STATES: MasteryState[] = ['STABLE', 'RETAINED', 'TRANSFERRED', 'ROBUST_MASTERY'];

/**
 * Prototype stand-in for the real Feature 13. A skill is considered eligible
 * for a realistic mixed assessment once it has cleared STABLE with at least
 * MEDIUM confidence and has no currently-open gap flags — i.e. exactly the
 * skills Section 48's demo narrative hands off to Feature 13 at the end of
 * the loop.
 */
export class FallbackReadinessEngine implements ReadinessEngine {
  getEligibleSkills(studentId: string, analyses: Map<string, SkillAnalysis>): ReadinessSignal[] {
    const signals: ReadinessSignal[] = [];
    for (const analysis of analyses.values()) {
      const stateEligible = ELIGIBLE_STATES.includes(analysis.state);
      const confidenceEligible = analysis.confidence !== 'LOW';
      const noOpenGaps = analysis.flags.filter((f) => f !== 'INSUFFICIENT_EVIDENCE').length === 0;
      const eligible = stateEligible && confidenceEligible && noOpenGaps;

      signals.push({
        studentId,
        skillId: analysis.skillId,
        skillName: analysis.skillId,
        state: analysis.state,
        confidence: analysis.confidence,
        eligibleForMixedAssessment: eligible,
        reason: eligible
          ? 'Stable or higher, adequately confident, and no open gaps \u2014 ready for realistic mixed-assessment conditions.'
          : `Not yet ready: ${!stateEligible ? 'state below Stable. ' : ''}${!confidenceEligible ? 'confidence too low. ' : ''}${!noOpenGaps ? `open gap(s): ${analysis.flags.join(', ')}.` : ''}`.trim(),
      });
    }
    return signals;
  }
}
