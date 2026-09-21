import {
  findRecoveryPlanForOpportunity,
  getFurthestStage,
  getOpportunity,
  getStagesForOpportunity,
  listEvidenceForOpportunity,
  setEvidenceFailureCategory,
} from './db/repository';
import { analyzeOutcome, buildFallbackSummary, classifyFeedback, generateNarrative } from './ai/outcomeAnalysis';
import type { ApplicationStage, Opportunity, OutcomeAnalysis, OutcomeEvidence, RecoveryPlan } from './types';

export interface OutcomeDetail {
  opportunity: Opportunity;
  stages: ApplicationStage[];
  furthestStage: ApplicationStage | null;
  evidence: OutcomeEvidence[];
  analysis: OutcomeAnalysis;
  narrativeSummary: string;
  patternExplanation: string | null;
  aiAvailable: boolean;
  existingRecoveryPlan: RecoveryPlan | null;
}

export async function loadOutcomeDetail(opportunityId: string, studentId: string): Promise<OutcomeDetail | null> {
  const opportunity = getOpportunity(opportunityId);
  if (!opportunity) return null;

  // Lazily classify unclassified direct recruiter feedback. No-ops cleanly if AI is unavailable.
  const evidence = listEvidenceForOpportunity(opportunity.id);
  for (const e of evidence) {
    if (e.evidenceType === 'DIRECT_EVIDENCE' && e.source === 'recruiter_feedback' && !e.failureCategory && e.contentText) {
      const category = await classifyFeedback(e.contentText);
      if (category) setEvidenceFailureCategory(e.id, category);
    }
  }

  const analysis = analyzeOutcome(opportunity.id, studentId);
  const narrative = await generateNarrative(opportunity, analysis);
  const fallbackSummary = buildFallbackSummary(opportunity, analysis);

  const stages = getStagesForOpportunity(opportunity.id);
  const furthestStage = getFurthestStage(opportunity.id);
  const existingRecoveryPlan = findRecoveryPlanForOpportunity(opportunity.id);
  const refreshedEvidence = listEvidenceForOpportunity(opportunity.id);

  return {
    opportunity,
    stages,
    furthestStage,
    evidence: refreshedEvidence,
    analysis,
    narrativeSummary: narrative.outcomeSummary ?? fallbackSummary,
    patternExplanation: narrative.patternExplanation,
    aiAvailable: narrative.outcomeSummary !== null,
    existingRecoveryPlan,
  };
}
