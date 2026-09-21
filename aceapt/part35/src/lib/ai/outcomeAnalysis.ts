import { getFurthestStage, getOpportunity, listEvidenceForOpportunity } from '../db/repository';
import { detectStagePattern } from '../engines/pattern';
import { CONTROLLABILITY, FAILURE_CATEGORY_LABELS, STAGE_LABELS } from '../constants';
import { callAIForJSON } from './client';
import { aiNarrativeSchema, classificationSchema } from './types';
import type { AINarrative, FailureCategory, OutcomeAnalysis, Opportunity } from '../types';

// ---------------------------------------------------------------------------
// Deterministic analysis. This is the source of truth for every judgment
// shown to the student (evidence type, pattern strength, category,
// controllability). It never calls the AI. The "What We Know" / "What We
// Don't Know" lists below are built entirely from this, so they stay correct
// even when the AI is unreachable (Section 33/35).
// ---------------------------------------------------------------------------
export function analyzeOutcome(opportunityId: string, studentId: string): OutcomeAnalysis {
  const opportunity = getOpportunity(opportunityId);
  const furthestStage = getFurthestStage(opportunityId);
  const empty: OutcomeAnalysis = {
    opportunityId,
    knowns: [],
    unknowns: [],
    evidenceType: 'UNKNOWN',
    patternStrength: 'none',
    patternStageKey: null,
    patternCount: 0,
    failureCategory: null,
    controllability: null,
    hasDirectEvidence: false,
    directEvidenceTexts: [],
  };
  if (!opportunity || !furthestStage) return empty;

  const knowns: string[] = [`Reached the ${STAGE_LABELS[furthestStage.stageKey]} stage.`];
  const unknowns: string[] = [];

  if (opportunity.targetAlignment === 'aligned') knowns.push('This role aligned with the stated target.');
  else if (opportunity.targetAlignment === 'partial') knowns.push('This role partially aligned with the stated target.');
  else if (opportunity.targetAlignment === 'misaligned') knowns.push('This role did not closely align with the stated target.');

  const evidence = listEvidenceForOpportunity(opportunityId);
  const directEvidence = evidence.filter((e) => e.evidenceType === 'DIRECT_EVIDENCE');
  const hasDirectEvidence = directEvidence.length > 0;
  const directEvidenceTexts = directEvidence.map((e) => e.contentText).filter((t): t is string => !!t);

  if (furthestStage.status === 'offer_received') {
    knowns.push('An offer was received at this stage.');
    return { ...empty, knowns, unknowns, hasDirectEvidence, directEvidenceTexts };
  }
  if (furthestStage.status === 'passed') {
    knowns.push('This stage was cleared successfully.');
    return { ...empty, knowns, unknowns, hasDirectEvidence, directEvidenceTexts };
  }
  if (furthestStage.status === 'pending') {
    knowns.push('Still awaiting a decision at this stage.');
    return { ...empty, knowns, unknowns, hasDirectEvidence, directEvidenceTexts };
  }
  if (furthestStage.status === 'withdrawn') {
    knowns.push('The application was withdrawn at this stage.');
    return { ...empty, knowns, unknowns, hasDirectEvidence, directEvidenceTexts };
  }

  // status === 'rejected' — the only case that runs full diagnosis.
  let failureCategory: FailureCategory | null = null;
  let evidenceType: OutcomeAnalysis['evidenceType'] = 'UNKNOWN';

  const directWithCategory = directEvidence.find((e) => e.failureCategory);
  if (directWithCategory?.failureCategory) {
    // Section 7 — an explicit recruiter reason is high confidence regardless of repetition.
    failureCategory = directWithCategory.failureCategory;
    evidenceType = 'DIRECT_EVIDENCE';
    knowns.push(`Recruiter feedback pointed to: ${FAILURE_CATEGORY_LABELS[failureCategory]}.`);
  } else if (directEvidence.length > 0) {
    knowns.push('Recruiter feedback was provided but did not point to one specific, classifiable reason.');
  }

  const pattern = detectStagePattern(studentId, furthestStage.stageKey, opportunityId);
  let patternStrength = pattern.strength;
  if (pattern.strength === 'emerging_pattern' || pattern.strength === 'repeated_pattern') {
    if (!failureCategory && pattern.dominantCategory) failureCategory = pattern.dominantCategory;
    if (evidenceType === 'UNKNOWN') evidenceType = 'REPEATED_SIGNAL';
    knowns.push(
      `${pattern.count} other recent opportunit${pattern.count === 1 ? 'y' : 'ies'} also ended at the ${STAGE_LABELS[furthestStage.stageKey]} stage.`,
    );
  }

  if (evidenceType === 'UNKNOWN' && evidence.some((e) => e.evidenceType === 'POSSIBLE_CONTRIBUTOR')) {
    evidenceType = 'POSSIBLE_CONTRIBUTOR';
  }

  if (!hasDirectEvidence) unknowns.push('Recruiter-specific rejection reason: not provided.');
  if (!failureCategory) unknowns.push('A specific, evidence-backed reason for this outcome is not yet known.');

  const controllability = failureCategory ? CONTROLLABILITY[failureCategory] : null;

  return {
    opportunityId,
    knowns,
    unknowns,
    evidenceType,
    patternStrength,
    patternStageKey: furthestStage.stageKey,
    patternCount: pattern.count,
    failureCategory,
    controllability,
    hasDirectEvidence,
    directEvidenceTexts,
  };
}

export function buildFallbackSummary(opportunity: Opportunity, analysis: OutcomeAnalysis): string {
  if (analysis.failureCategory && analysis.evidenceType === 'DIRECT_EVIDENCE') {
    return `Recruiter feedback for the ${opportunity.roleTitle} outcome pointed to ${FAILURE_CATEGORY_LABELS[analysis.failureCategory]}.`;
  }
  if (analysis.patternStrength === 'repeated_pattern' || analysis.patternStrength === 'emerging_pattern') {
    return `${analysis.patternCount} other recent opportunities also ended at this stage. That pattern may be worth investigating, though it is not a confirmed cause.`;
  }
  if (analysis.unknowns.length > 0) {
    return 'Available evidence is insufficient to identify a specific reason for this outcome yet.';
  }
  return 'This outcome has been recorded.';
}

// ---------------------------------------------------------------------------
// AI narrative: prose only, always grounded in the facts computed above.
// Never used to decide confidence, category, or pattern existence — only to
// phrase what is already known in a calmer, more specific sentence.
// ---------------------------------------------------------------------------
const NARRATIVE_SYSTEM_PROMPT = `You write short, calm, evidence-grounded notes for a student career platform.
You will receive a JSON object of FACTS that have already been verified by deterministic logic.
Rules, all mandatory:
- Never introduce a fact, number, cause, or reason that is not present in FACTS.
- Never state that a rejection reason is confirmed unless facts.hasDirectEvidence is true.
- If facts.patternStrength is "none" or "limited_evidence", do not claim a pattern exists.
- Never call the student weak, bad, not ready, or use any shaming language.
- Keep each field to one or two plain sentences. No markdown.
- Respond with ONLY a JSON object, no code fences, no commentary:
{"outcome_summary": string, "pattern_explanation": string|null, "recovery_rationale": string|null}
Set a field to null if FACTS do not support writing it.`;

export async function generateNarrative(
  opportunity: Opportunity,
  analysis: OutcomeAnalysis,
): Promise<AINarrative> {
  const facts = {
    roleTitle: opportunity.roleTitle,
    companyName: opportunity.companyName,
    roleCategory: opportunity.roleCategory,
    knowns: analysis.knowns,
    unknowns: analysis.unknowns,
    hasDirectEvidence: analysis.hasDirectEvidence,
    directEvidenceTexts: analysis.directEvidenceTexts,
    patternStrength: analysis.patternStrength,
    patternCount: analysis.patternCount,
    failureCategory: analysis.failureCategory,
    controllability: analysis.controllability,
  };

  const raw = await callAIForJSON<unknown>(NARRATIVE_SYSTEM_PROMPT, JSON.stringify(facts));
  const parsed = raw ? aiNarrativeSchema.safeParse(raw) : null;

  if (parsed && parsed.success) {
    return {
      outcomeSummary: parsed.data.outcome_summary,
      patternExplanation: parsed.data.pattern_explanation,
      recoveryRationale: parsed.data.recovery_rationale,
    };
  }
  return { outcomeSummary: null, patternExplanation: null, recoveryRationale: null };
}

// ---------------------------------------------------------------------------
// AI-assisted feedback classification: maps raw recruiter text onto one of
// the fixed category codes, or null if it is too vague to classify. This
// runs lazily on read (never blocks the outcome-recording write path — see
// Section 57) and the result is validated against the fixed enum before it
// is ever trusted or written back (Section 35: never fabricate a reason).
// ---------------------------------------------------------------------------
const CLASSIFY_SYSTEM_PROMPT = `Classify raw recruiter feedback text for a student career platform into exactly
one of these category codes, or null if the text does not clearly indicate one:
TARGET_MISMATCH, APPLICATION_MISMATCH, ELIGIBILITY_MISMATCH, TECHNICAL_PERFORMANCE,
COMMUNICATION_PERFORMANCE, BEHAVIORAL_INTERVIEW, PROJECT_EXPERIENCE_EVIDENCE,
INTERVIEW_PERFORMANCE, ROLE_SPECIFIC_KNOWLEDGE, PREPARATION_GAP, OPPORTUNITY_FIT, EXTERNAL_UNKNOWN.
Do not guess when the text is vague, generic, or unrelated to any of these — return null rather than
force a category the text does not clearly support.
Respond with ONLY JSON, no code fences: {"category": "CODE"|null}`;

export async function classifyFeedback(feedbackText: string): Promise<FailureCategory | null> {
  const raw = await callAIForJSON<unknown>(CLASSIFY_SYSTEM_PROMPT, feedbackText);
  const parsed = raw ? classificationSchema.safeParse(raw) : null;
  if (parsed && parsed.success) return parsed.data.category;
  return null;
}
