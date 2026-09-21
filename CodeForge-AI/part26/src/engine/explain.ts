import { SkillState, Trend, type AggregationResult, type NormalizedEvidence, type SkillSignalExplanation } from '../domain/models.js';
import { SKILL_CATALOG } from '../policy/policy.js';

const STATE_PHRASE: Record<SkillState, string> = {
  [SkillState.UNKNOWN]: 'has not been demonstrated yet',
  [SkillState.INTRODUCED]: 'has only just been introduced',
  [SkillState.DEVELOPING]: 'is developing',
  [SkillState.PRACTICED]: 'is practiced',
  [SkillState.PROFICIENT]: 'is proficient',
  [SkillState.MASTERED]: 'is consistently strong across diverse evidence',
  [SkillState.AT_RISK]: 'was strong but recent evidence shows instability',
  [SkillState.REGRESSING]: 'was strong but has shown a sustained recent decline',
  [SkillState.UNCERTAIN]: 'cannot yet be confidently classified',
};

const TREND_PHRASE: Record<Trend, string> = {
  [Trend.IMPROVING]: 'improving',
  [Trend.STABLE]: 'holding steady',
  [Trend.DECLINING]: 'declining',
  [Trend.VOLATILE]: 'inconsistent from one attempt to the next',
  [Trend.INSUFFICIENT_DATA]: 'not yet trackable (too few observations)',
};

export function generateExplanation(params: {
  skillId: string;
  studentId: string;
  agg: AggregationResult;
  state: SkillState;
  trend: Trend;
  confidence: number;
  transferConfidence: number;
  recentEvidence: NormalizedEvidence[];
  nowIso: string;
}): SkillSignalExplanation {
  const { skillId, studentId, agg, state, trend, confidence, transferConfidence, recentEvidence, nowIso } = params;
  const skillName = SKILL_CATALOG[skillId]?.name ?? skillId;

  if (agg.validEvidenceCount === 0) {
    return {
      skillId,
      studentId,
      summary: `No evidence has been recorded for ${skillName} yet.`,
      evidenceHighlights: [],
      generatedAt: nowIso,
    };
  }

  const successes = recentEvidence.filter((e) => e.normalizedValue >= 0.6).length;
  const failures = recentEvidence.filter((e) => e.normalizedValue < 0.5).length;

  let summary = `${skillName} ${STATE_PHRASE[state]}, based on ${agg.evidenceCount} recorded demonstration${agg.evidenceCount === 1 ? '' : 's'} across ${agg.distinctContexts} distinct context${agg.distinctContexts === 1 ? '' : 's'}.`;
  summary += ` Recent performance is ${TREND_PHRASE[trend]}.`;

  if (agg.contradictionMagnitude > 0) {
    summary += ` Recent results diverge from the established historical pattern, so confidence has been reduced until this settles.`;
  }
  if (transferConfidence === 0 && agg.transferEvidenceCount === 0) {
    summary += ` Transfer to unfamiliar contexts has not been tested yet.`;
  } else if (transferConfidence < 0.5 && agg.transferEvidenceCount > 0) {
    summary += ` Applying this skill in a different context has been inconsistent — this student may be pattern-matching rather than fully transferring the underlying idea.`;
  } else if (transferConfidence >= 0.5) {
    summary += ` This skill has held up when applied in a different context, which is stronger evidence than repeated success in one pattern.`;
  }
  if (confidence < 0.4) {
    summary += ` Confidence in this reading is still low — more evidence would sharpen it.`;
  }

  const evidenceHighlights: string[] = [];
  if (successes > 0) evidenceHighlights.push(`${successes} recent demonstration${successes === 1 ? '' : 's'} scored strong (≥0.6)`);
  if (failures > 0) evidenceHighlights.push(`${failures} recent demonstration${failures === 1 ? '' : 's'} scored weak (<0.5)`);
  if (agg.transferEvidenceCount > 0) evidenceHighlights.push(`${agg.transferEvidenceCount} transfer-context demonstration${agg.transferEvidenceCount === 1 ? '' : 's'} recorded`);
  if (agg.excludedCount > 0) evidenceHighlights.push(`${agg.excludedCount} submitted result${agg.excludedCount === 1 ? '' : 's'} excluded as invalid/disputed and not counted`);
  evidenceHighlights.push(`${agg.distinctContexts} distinct challenge context${agg.distinctContexts === 1 ? '' : 's'} seen (diversity ${(agg.diversity * 100).toFixed(0)}%)`);

  return { skillId, studentId, summary, evidenceHighlights, generatedAt: nowIso };
}
