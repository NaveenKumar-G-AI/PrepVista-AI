import { Freshness, MODEL_VERSION, SkillState, Trend, type SkillSignal, type TechnicalProfile } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';

export function buildTechnicalProfile(studentId: string, signals: SkillSignal[], nowIso: string): TechnicalProfile {
  const p = SignalPolicy.strengthWeaknessDetection;
  const skills: Record<string, SkillSignal> = {};
  for (const s of signals) skills[s.skillId] = s;

  const withEvidence = signals.filter((s) => s.evidenceCount > 0);

  const strengths = withEvidence
    .filter(
      (s) =>
        s.signal >= p.strengthMinSignal &&
        s.confidence >= p.strengthMinConfidence &&
        s.diversity >= 0.5 &&
        s.freshness !== Freshness.STALE &&
        s.freshness !== Freshness.VERY_STALE
    )
    .map((s) => s.skillId);

  // One failure is never a weakness (req #39): requires enough evidence AND enough
  // confidence that the low reading isn't just "we don't know yet".
  const weaknesses = withEvidence
    .filter((s) => s.signal <= p.weaknessMaxSignal && s.confidence >= p.weaknessMinConfidence && s.evidenceCount >= p.weaknessMinEvidenceCount)
    .map((s) => s.skillId);

  const uncertainties = withEvidence
    .filter((s) => s.state === SkillState.UNCERTAIN || s.confidence < SignalPolicy.state.uncertaintyConfidenceFloor)
    .map((s) => s.skillId);

  const improving = withEvidence.filter((s) => s.trend === Trend.IMPROVING).map((s) => s.skillId);
  const declining = withEvidence.filter((s) => s.trend === Trend.DECLINING || s.state === SkillState.REGRESSING).map((s) => s.skillId);

  // A transfer gap: the skill looks solid in its trained pattern but transfer hasn't
  // been confirmed (either untested or tested and inconsistent) — req #17/#32.
  const transferGaps = withEvidence.filter((s) => s.signal >= 0.6 && s.transferConfidence < 0.5).map((s) => s.skillId);

  const retentionRisks = withEvidence.filter((s) => s.retention !== null && s.retention < 0.5).map((s) => s.skillId);

  const overallConfidence = withEvidence.length > 0 ? withEvidence.reduce((sum, s) => sum + s.confidence, 0) / withEvidence.length : 0;

  return {
    studentId,
    skills,
    strengths,
    weaknesses,
    uncertainties,
    improving,
    declining,
    transferGaps,
    retentionRisks,
    overallConfidence,
    modelVersion: MODEL_VERSION,
    generatedAt: nowIso,
  };
}
