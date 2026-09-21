import { AssessmentTier, SkillState, type AggregationResult, type NormalizedEvidence } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

const AUTHORITATIVE_TIERS = new Set<string>([AssessmentTier.ASSESSMENT, AssessmentTier.INTERVIEW, AssessmentTier.PROJECT]);

function ladderState(signal: number, evidenceCount: number): SkillState {
  if (evidenceCount === 0) return SkillState.UNKNOWN;
  const t = SignalPolicy.state.thresholds;
  if (signal < t.developing) return SkillState.INTRODUCED;
  if (signal < t.practiced) return SkillState.DEVELOPING;
  if (signal < t.proficient) return SkillState.PRACTICED;
  if (signal < t.mastered) return SkillState.PROFICIENT;
  return SkillState.MASTERED;
}

const WAS_ESTABLISHED = new Set([SkillState.PROFICIENT, SkillState.MASTERED, SkillState.AT_RISK, SkillState.REGRESSING]);

export function deriveState(params: {
  previousState: SkillState;
  agg: AggregationResult;
  confidence: number;
  recentEvidence: NormalizedEvidence[]; // evidence within the recent window for this skill, VALID/SUSPICIOUS only
}): SkillState {
  const { previousState, agg, confidence, recentEvidence } = params;
  const policy = SignalPolicy.state;

  if (agg.validEvidenceCount === 0) return SkillState.UNKNOWN;

  // Confidence floor: below this we genuinely don't know enough to claim any level (req #21/#40).
  if (confidence < policy.uncertaintyConfidenceFloor) return SkillState.UNCERTAIN;

  let state = ladderState(agg.weightedSignal, agg.evidenceCount);

  // Mastery requires more than a raw threshold crossing — sufficient confidence AND
  // diversity, or a single well-memorized challenge family reads as mastery (req #16/#38).
  if (state === SkillState.MASTERED && (confidence < policy.masteryMinConfidence || agg.diversity < policy.masteryMinDiversity)) {
    state = SkillState.PROFICIENT;
  }

  const hasContradiction = agg.contradictionMagnitude > 0;
  const recentLowPoints = recentEvidence.filter((e) => e.normalizedValue < 0.5).length;
  const recentAuthoritativeContradiction = recentEvidence.some(
    (e) => AUTHORITATIVE_TIERS.has(e.assessmentTier) && e.normalizedValue < 0.5
  );

  if (hasContradiction && WAS_ESTABLISHED.has(previousState)) {
    // Protect earned mastery from a single non-authoritative blip (req #20): move to
    // AT_RISK first. Only escalate to REGRESSING once evidence is sustained or authoritative.
    if (recentAuthoritativeContradiction || recentLowPoints >= policy.demotionSustainedPointsRequired) {
      state = SkillState.REGRESSING;
    } else {
      state = SkillState.AT_RISK;
    }
  } else if (hasContradiction && !WAS_ESTABLISHED.has(previousState)) {
    // No mastery to protect and the evidence disagrees with itself — say so rather than
    // inventing a strong/weak verdict (req #22/#40).
    state = SkillState.UNCERTAIN;
  } else if (WAS_ESTABLISHED.has(previousState) && (previousState === SkillState.AT_RISK || previousState === SkillState.REGRESSING)) {
    // Recovering: if the contradiction has resolved (agg.contradictionMagnitude back to 0)
    // and the ladder state is healthy again, let it heal back onto the ladder above —
    // handled naturally since `state` was already recomputed from ladderState() and
    // hasContradiction is false in this branch.
  }

  return state;
}
