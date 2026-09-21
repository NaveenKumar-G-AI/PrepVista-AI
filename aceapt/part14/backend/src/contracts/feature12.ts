/**
 * Section 30: Feature 12 (Personalized Intervention & Learning
 * Transformation Engine) is a separate product surface that does not exist
 * in this environment. Rather than fake it inline, this file defines the
 * contract Feature 14 needs from it, so a real Feature 12 service can be
 * wired in later by implementing `InterventionEngine` — nothing in
 * api/server.ts should need to change.
 *
 * `FallbackInterventionEngine` is a clearly-labelled stand-in so the
 * closed loop (gap -> intervention -> reverify) is demonstrable end to end
 * without the real Feature 12 present.
 */

import { GapFlag, SkillAnalysis } from '../domain/types';

export interface MasteryGapSignal {
  studentId: string;
  skillId: string;
  skillName: string;
  gapTypes: GapFlag[];
  analysis: SkillAnalysis;
  detectedAt: string;
}

export interface InterventionPlan {
  studentId: string;
  skillId: string;
  interventionType: string;
  description: string;
  targetGaps: GapFlag[];
  generatedBy: 'feature12' | 'feature14_fallback';
}

export interface InterventionEngine {
  planIntervention(signal: MasteryGapSignal): Promise<InterventionPlan> | InterventionPlan;
}

const GAP_INTERVENTIONS: Partial<Record<GapFlag, { type: string; description: (skill: string) => string }>> = {
  TRANSFER_GAP: {
    type: 'transfer_drill',
    description: (skill) => `A short set of ${skill} questions deliberately reworded and re-contextualised, to rebuild the bridge from the familiar method to unfamiliar phrasing.`,
  },
  DIFFICULTY_GAP: {
    type: 'difficulty_ramp',
    description: (skill) => `A scaffolded sequence of ${skill} questions stepping from medium to hard, with worked examples at the point the student typically drops off.`,
  },
  INDEPENDENCE_GAP: {
    type: 'unaided_retry',
    description: (skill) => `Re-attempt the same ${skill} question types with hints disabled, to convert guided success into independent success.`,
  },
  RETENTION_GAP: {
    type: 'spaced_refresher',
    description: (skill) => `A brief ${skill} refresher scheduled a few days out, followed by a second delayed check to confirm the refresh held.`,
  },
  FORMAT_TRANSFER_GAP: {
    type: 'format_exposure',
    description: (skill) => `Practice the same ${skill} concept across the formats (table, graph, word problem) where accuracy currently varies most.`,
  },
  CONTEXT_TRANSFER_GAP: {
    type: 'context_exposure',
    description: (skill) => `Practice the same ${skill} concept across the specific contexts where accuracy currently varies most.`,
  },
  ROOT_CAUSE_GAP: {
    type: 'prerequisite_remediation',
    description: (skill) => `Step back to the weaker prerequisite skill feeding into ${skill} before returning to ${skill} itself.`,
  },
};

/**
 * Prototype-only fallback. A real Feature 12 would bring its own content
 * library, sequencing logic and student-history awareness — this exists
 * purely so Feature 14's gap -> intervention -> reverify loop is runnable
 * end to end in a demo.
 */
export class FallbackInterventionEngine implements InterventionEngine {
  planIntervention(signal: MasteryGapSignal): InterventionPlan {
    const primaryGap = signal.gapTypes.find((g) => g !== 'INSUFFICIENT_EVIDENCE') ?? signal.gapTypes[0];
    const template = (primaryGap && GAP_INTERVENTIONS[primaryGap]) || {
      type: 'general_practice',
      description: (skill: string) => `Continue independent practice on ${skill}.`,
    };

    return {
      studentId: signal.studentId,
      skillId: signal.skillId,
      interventionType: template.type,
      description: template.description(signal.skillName),
      targetGaps: signal.gapTypes,
      generatedBy: 'feature14_fallback',
    };
  }
}
