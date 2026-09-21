'use strict';

const store = require('../db/memoryStore');
const { normalizeOpportunityInput } = require('../engines/normalization');
const { extractRequirements } = require('../engines/requirementExtraction');
const { analyzeEligibility } = require('../engines/eligibilityEngine');
const { computeMatch } = require('../engines/matchingEngine');
const { analyzeGaps } = require('../engines/gapAnalysis');
const { recommend } = require('../engines/recommendationEngine');
const { computeFreshnessStatus } = require('../engines/deadlineIntelligence');
const { findDuplicate } = require('../engines/duplicateDetection');
const { generateActionPlan } = require('../engines/actionPlanGenerator');
const { TARGET_CORE_CAPABILITIES } = require('../seed/capabilities');
const simulationService = require('../integrations/simulationService');
const pathService = require('../integrations/pathService');
const { daysUntil } = require('../lib/dates');

/**
 * Ingestion pipeline: normalize -> dedupe check -> store -> extract
 * requirements (spec sections 6-10, 77 "background processing" - this runs
 * inline for simplicity, but nothing here assumes synchronous execution, so
 * moving it behind a queue later is a non-breaking change).
 */
async function ingestOpportunity(input, { aiProvider } = {}) {
  const normalized = normalizeOpportunityInput(input);
  const status = computeFreshnessStatus({ deadlineIso: normalized.deadline, observedAtIso: normalized.observedAt });

  const existing = store.listOpportunities();
  const duplicate = findDuplicate({ id: null, organization: normalized.organization, title: normalized.title }, existing);

  const opportunity = store.createOpportunity({
    title: normalized.title,
    organization: normalized.organization,
    location: normalized.location,
    workMode: normalized.workMode,
    opportunityType: normalized.opportunityType,
    description: normalized.description,
    eligibilityText: normalized.eligibilityText,
    deadline: normalized.deadline,
    applicationMethod: normalized.applicationMethod,
    source: normalized.source,
    sourceUrl: normalized.sourceUrl,
    observedAt: normalized.observedAt,
    status,
    duplicateOfId: duplicate ? duplicate.duplicateOfId : null,
  });

  const requirements = await extractRequirements({
    opportunityId: opportunity.id,
    requiredText: normalized.requirementsText,
    preferredText: normalized.preferredRequirementsText,
    coreCapabilityIds: input.targetId ? (TARGET_CORE_CAPABILITIES[input.targetId] || []) : [],
    aiProvider,
  });
  const saved = store.saveRequirements(opportunity.id, requirements);

  return { opportunity, requirements: saved, duplicate };
}

/**
 * The core "understand this opportunity, for this student" pipeline (spec
 * sections 9, 11-19): eligibility -> multi-dimensional match -> gaps ->
 * deterministic recommendation. Cached per (opportunity, student) pair.
 */
async function analyzeOpportunityForStudent(opportunityId, studentId, { aiProvider } = {}) {
  const opportunity = store.getOpportunity(opportunityId);
  if (!opportunity) return { error: 'OPPORTUNITY_NOT_FOUND' };
  const student = store.getStudent(studentId);
  if (!student) return { error: 'STUDENT_NOT_FOUND' };

  const requirements = store.getRequirements(opportunityId);
  const studentCapabilities = store.listStudentCapabilities(studentId);
  const coreCapabilityIds = student.targetId ? (TARGET_CORE_CAPABILITIES[student.targetId] || []) : [];

  const eligibility = analyzeEligibility({ eligibilityText: opportunity.eligibilityText, student });
  const daysRemaining = daysUntil(opportunity.deadline);
  const match = computeMatch({ requirements, studentCapabilities, coreCapabilityIds, daysRemaining });
  const gaps = analyzeGaps({ requirements, studentCapabilities, coreCapabilityIds });
  const recommendation = recommend({
    eligibility, overallFit: match.overallFit, readinessGapBand: match.readinessGapBand, deadlineIso: opportunity.deadline, gaps,
  });

  if (aiProvider && aiProvider.isAvailable()) {
    try {
      const phrased = await aiProvider.phraseExplanation({ action: recommendation.action, reasons: recommendation.reasons });
      if (phrased) recommendation.explanation = phrased.trim();
    } catch (err) {
      console.warn('[opportunityService] explanation phrasing failed:', err.message);
    }
  }

  const analysis = store.saveAnalysis(opportunityId, studentId, { eligibility, match, gaps, recommendation });
  return { opportunity, analysis };
}

/**
 * The "first screen" (spec section 23 - Personalized Opportunity Brief).
 * Reads only from cached analysis - call analyzeOpportunityForStudent first.
 */
function buildOpportunityBrief(opportunityId, studentId) {
  const opportunity = store.getOpportunity(opportunityId);
  const analysis = store.getAnalysis(opportunityId, studentId);
  if (!opportunity || !analysis) return null;

  const strongestMatch = [...analysis.gaps.required]
    .filter((r) => !r.capabilityGap)
    .sort((a, b) => (b.importance === 'critical' ? 1 : 0) - (a.importance === 'critical' ? 1 : 0))[0];
  const primaryGap = [...analysis.gaps.opportunityGaps, ...analysis.gaps.targetGaps][0];

  return {
    opportunityId,
    title: opportunity.title,
    organization: opportunity.organization,
    opportunityType: opportunity.opportunityType,
    fit: analysis.match.overallFit,
    eligibility: { state: analysis.eligibility.state, reasons: analysis.eligibility.reasons },
    deadline: opportunity.deadline,
    daysRemaining: analysis.recommendation.daysRemaining,
    strongestMatch: strongestMatch ? strongestMatch.label : null,
    primaryGap: primaryGap ? primaryGap.label : null,
    recommendation: analysis.recommendation,
    computedAt: analysis.computedAt,
  };
}

/**
 * The Preparation Optimizer entry point (spec sections 29-33). Available
 * time is derived from the student's stated weekly availability and the
 * days remaining, capped at one week's worth so a distant deadline doesn't
 * produce an unrealistically long "minimum effective" plan.
 */
async function planActionForStudent(opportunityId, studentId) {
  const opportunity = store.getOpportunity(opportunityId);
  const analysis = store.getAnalysis(opportunityId, studentId);
  const student = store.getStudent(studentId);
  if (!opportunity || !analysis || !student) return null;

  const daysRemaining = analysis.recommendation.daysRemaining;
  const dailyMinutes = ((student.availableHoursPerWeek || 5) * 60) / 7;
  const availableMinutes = daysRemaining && daysRemaining > 0
    ? Math.min(dailyMinutes * daysRemaining, dailyMinutes * 7)
    : dailyMinutes;

  const plan = generateActionPlan({
    eligibilityState: analysis.eligibility.state,
    gaps: analysis.gaps,
    availableMinutes,
    simulationAvailable: simulationService.isAvailable(),
  });
  return store.saveActionPlan(opportunityId, studentId, plan);
}

/**
 * "My Opportunities" (spec sections 26-27): buckets every analyzed,
 * non-expired opportunity into a priority tier instead of a flat list.
 */
function priorityQueueForStudent(studentId) {
  const rows = store.listAnalysesForStudent(studentId)
    .map((analysis) => ({ opportunity: store.getOpportunity(analysis.opportunityId), analysis }))
    .filter((r) => r.opportunity && r.opportunity.status !== 'EXPIRED');

  const tierOf = (r) => {
    const fit = r.analysis.match.overallFit.band;
    const urgency = r.analysis.recommendation.urgency;
    if (r.analysis.eligibility.state === 'NOT_ELIGIBLE') return 4;
    if (fit === 'Weak' || fit === 'Unknown') return 4;
    if ((fit === 'Strong' || fit === 'Good') && urgency === 'Tight') return 1;
    if (fit === 'Strong' || fit === 'Good') return 2;
    return 3;
  };

  const tiers = { 1: [], 2: [], 3: [], 4: [] };
  rows.forEach((r) => tiers[tierOf(r)].push(r));
  Object.values(tiers).forEach((list) => list.sort(
    (a, b) => (a.analysis.recommendation.daysRemaining ?? 999) - (b.analysis.recommendation.daysRemaining ?? 999),
  ));

  return { priority1: tiers[1], priority2: tiers[2], priority3: tiers[3], watch: tiers[4] };
}

/** Best-effort PATH notification - never blocks the caller (spec section 79). */
async function notifyPathIfConnected(studentId, bottleneck) {
  if (!pathService.isAvailable()) return;
  try { await pathService.notifyBottleneck(studentId, bottleneck); } catch (_e) { /* best-effort only */ }
}

module.exports = {
  ingestOpportunity,
  analyzeOpportunityForStudent,
  buildOpportunityBrief,
  planActionForStudent,
  priorityQueueForStudent,
  notifyPathIfConnected,
};
