import { AlignmentGap, AlignmentStrength } from '../domain/types';
import { RequirementEvaluation } from './requirementEvaluator';

export interface GapClassification {
  strengths: AlignmentStrength[];
  criticalGaps: AlignmentGap[];
  supportingGaps: AlignmentGap[];
  insufficientEvidenceCapabilityIds: string[];
}

const IMPORTANCE_RANK = { CORE: 0, IMPORTANT: 1, SUPPORTING: 2 } as const;

function toGap(r: RequirementEvaluation): AlignmentGap {
  return {
    capabilityId: r.capabilityId,
    capabilityName: r.capabilityName,
    importance: r.importance,
    currentLevel: r.currentLevel ?? 'VERY_WEAK',
    requiredLevel: r.requiredLevel,
    deficit: r.deficit,
    isCritical: r.isCriticalGap,
    confidence: r.confidenceBand,
  };
}

export function classifyGaps(evaluations: RequirementEvaluation[]): GapClassification {
  const strengths: AlignmentStrength[] = [];
  const criticalGaps: AlignmentGap[] = [];
  const supportingGaps: AlignmentGap[] = [];
  const insufficientEvidenceCapabilityIds: string[] = [];

  for (const r of evaluations) {
    if (!r.hasEvidence) {
      insufficientEvidenceCapabilityIds.push(r.capabilityId);
    }

    if (r.isMet) {
      strengths.push({
        capabilityId: r.capabilityId,
        capabilityName: r.capabilityName,
        importance: r.importance,
        level: r.currentLevel ?? 'VERY_WEAK',
      });
      continue;
    }

    if (r.isCriticalGap) {
      criticalGaps.push(toGap(r));
    } else {
      supportingGaps.push(toGap(r));
    }
  }

  const byImportanceThenDeficit = (a: AlignmentGap, b: AlignmentGap) =>
    IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] || b.deficit - a.deficit;

  criticalGaps.sort(byImportanceThenDeficit);
  supportingGaps.sort(byImportanceThenDeficit);
  strengths.sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]);

  return { strengths, criticalGaps, supportingGaps, insufficientEvidenceCapabilityIds };
}
