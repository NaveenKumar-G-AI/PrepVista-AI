import { Diagnosis } from '../types/diagnosis';
import { RootCause } from '../types/rootCause';
import { InterventionType, EscalationLevel, INTERVENTION_CHAINS, INTERVENTION_META } from '../types/intervention';
import { InterventionHistoryEntry } from '../types/evidence';
import { StudentInterventionProfile } from '../types/domain';

export interface InterventionRecommendation {
  rootCause: RootCause;
  interventionType: InterventionType;
  escalationLevel: EscalationLevel;
  label: string;
  description: string;
  estimatedMinutes: number;
  rationale: string;
}

/**
 * Selects the best available intervention for a diagnosis. Never sends this
 * decision to an LLM (Section 38) — it's pure policy over:
 *   root cause + prior intervention outcomes for this (student, skill, cause)
 *   + current escalation level + student's intervention profile.
 */
export function selectIntervention(
  diagnosis: Diagnosis,
  priorHistoryForSkill: InterventionHistoryEntry[],
  profile: StudentInterventionProfile
): InterventionRecommendation {
  const cause = diagnosis.primary.cause;
  const chain =
    cause === RootCause.MULTI_FACTOR
      ? INTERVENTION_CHAINS[diagnosis.secondary[0]?.cause ?? RootCause.CONCEPT_GAP]
      : INTERVENTION_CHAINS[cause];

  const triedForThisCause = new Set(
    priorHistoryForSkill.filter((h) => h.rootCause === cause).map((h) => h.interventionType)
  );
  const failedForThisCause = new Set(
    priorHistoryForSkill
      .filter((h) => h.rootCause === cause && h.outcome === 'not_improved')
      .map((h) => h.interventionType)
  );

  // Failed-intervention memory (Section 18): never re-recommend a type that
  // already failed for this exact (skill, cause) combination in this recovery cycle.
  let candidateChain = chain.filter((t) => !failedForThisCause.has(t));

  // If everything in the chain has already failed, this is Level 6/7 territory:
  // fall back to the most-helpful type in the student's own profile (if any
  // evidence supports one), else escalate to prerequisite repair as a safe default.
  if (candidateChain.length === 0) {
    const preferred = mostHelpfulUntried(profile, chain, triedForThisCause);
    candidateChain = preferred ? [preferred] : [InterventionType.PREREQUISITE_REPAIR];
  }

  // Prefer a type not yet tried this cycle; if all remaining have been tried
  // (but not marked failed — e.g. still in progress), take the first anyway.
  const nextUntried = candidateChain.find((t) => !triedForThisCause.has(t));
  const interventionType = nextUntried ?? candidateChain[0];

  const escalationLevel = computeEscalationLevel(chain, interventionType, failedForThisCause.size);
  const meta = INTERVENTION_META[interventionType];

  return {
    rootCause: cause,
    interventionType,
    escalationLevel,
    label: meta.label,
    description: meta.description,
    estimatedMinutes: meta.estimatedMinutes,
    rationale: buildRationale(diagnosis, interventionType, failedForThisCause.size),
  };
}

function mostHelpfulUntried(
  profile: StudentInterventionProfile,
  chain: InterventionType[],
  tried: Set<string>
): InterventionType | undefined {
  const candidates = profile.stats
    .filter((s) => !tried.has(s.interventionType) && s.helpfulCount + s.unhelpfulCount >= 2)
    .sort((a, b) => b.helpfulCount - b.unhelpfulCount - (a.helpfulCount - a.unhelpfulCount));
  return candidates[0]?.interventionType;
}

function computeEscalationLevel(
  chain: InterventionType[],
  chosen: InterventionType,
  failedCount: number
): EscalationLevel {
  if (failedCount >= chain.length && failedCount > 0) return EscalationLevel.L7_DEEP_REMEDIATION;
  if (failedCount >= Math.max(1, chain.length - 1)) return EscalationLevel.L6_ALTERNATIVE_STRATEGY;
  if (chosen === InterventionType.PREREQUISITE_REPAIR) return EscalationLevel.L5_PREREQUISITE_REPAIR;
  if (chosen === InterventionType.GUIDED_PRACTICE || chosen === InterventionType.CONTRAST_TRAINING) {
    return EscalationLevel.L4_GUIDED_PRACTICE;
  }
  if (chosen === InterventionType.WORKED_EXAMPLE) return EscalationLevel.L3_WORKED_EXAMPLE;
  if (chosen === InterventionType.CONCEPT_REBUILD || chosen === InterventionType.STEP_BY_STEP_GUIDANCE) {
    return EscalationLevel.L2_MICRO_EXPLANATION;
  }
  return EscalationLevel.L1_HINT;
}

function buildRationale(diagnosis: Diagnosis, chosen: InterventionType, failedCount: number): string {
  const base = `Diagnosed ${diagnosis.primary.cause} (${diagnosis.primary.confidence} confidence).`;
  if (failedCount > 0) {
    return `${base} ${failedCount} prior intervention type(s) for this gap did not resolve it, so this is a different approach rather than a repeat.`;
  }
  return `${base} This is the first-line intervention for this cause.`;
}
