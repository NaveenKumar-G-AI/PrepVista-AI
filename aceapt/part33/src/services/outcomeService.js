'use strict';

const store = require('../db/memoryStore');
const { detectPatterns } = require('../engines/outcomeLearning');
const pathService = require('../integrations/pathService');

/**
 * Records one real-world outcome and re-runs pattern detection across the
 * student's full history (spec sections 44-51 - the Outcome Learning loop).
 */
async function recordOutcome(studentId, { opportunityId, stageReached, outcome, skillTag, feedback }) {
  const record = store.addOutcome(studentId, {
    opportunityId, stageReached, outcome, skillTag: skillTag || null, feedback: feedback || null,
  });
  const allOutcomes = store.listOutcomesByStudent(studentId);
  const patterns = detectPatterns(allOutcomes);

  const newlyConfident = patterns.bottlenecks.find((b) => b.occurrences >= 2);
  if (newlyConfident && pathService.isAvailable()) {
    try { await pathService.notifyBottleneck(studentId, newlyConfident); } catch (_e) { /* best-effort only */ }
  }

  return { record, patterns };
}

/** Opportunity Journey (spec section 48) - only ever real stored counts. */
function getJourney(studentId) {
  const applications = store.listApplicationsByStudent(studentId);
  const outcomes = store.listOutcomesByStudent(studentId);
  const reached = (statuses) => applications.filter((a) => statuses.includes(a.status)).length;

  const counts = {
    total: applications.length,
    applied: reached(['APPLIED', 'ASSESSMENT', 'INTERVIEW', 'FINAL_STAGE', 'REJECTED', 'SELECTED']),
    assessments: reached(['ASSESSMENT', 'INTERVIEW', 'FINAL_STAGE', 'SELECTED']),
    interviews: reached(['INTERVIEW', 'FINAL_STAGE', 'SELECTED']),
    finalStage: reached(['FINAL_STAGE', 'SELECTED']),
    selected: reached(['SELECTED']),
  };
  return { counts, outcomes, patterns: detectPatterns(outcomes) };
}

module.exports = { recordOutcome, getJourney };
