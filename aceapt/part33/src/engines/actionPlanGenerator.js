'use strict';

const IMPACT_BY_SEVERITY = { high: 3, moderate: 2, low: 1, unmapped: 1 };

const CAPABILITY_INTERVENTIONS = {
  cap_system_design: { title: 'System Design Fundamentals', estMinutes: 45 },
  cap_sql: { title: 'SQL Applied Practice', estMinutes: 30 },
  cap_python: { title: 'Python Applied Practice', estMinutes: 30 },
  cap_data_structures: { title: 'Data Structures Refresher', estMinutes: 40 },
  cap_algorithms: { title: 'Algorithms Practice Set', estMinutes: 40 },
  cap_rest_apis: { title: 'REST API Design Scenario', estMinutes: 30 },
  cap_fastapi: { title: 'FastAPI Quick-Start Walkthrough', estMinutes: 35 },
  cap_communication: { title: 'Structured Explanation Practice', estMinutes: 20 },
};
const DEFAULT_INTERVENTION = { title: 'Targeted Capability Review', estMinutes: 30 };
const EVIDENCE_INTERVENTION_MINUTES = 20;
const MAX_PREP_TASKS = 4; // spec section 32 - don't overload the student

function gapToTask(gapRow) {
  const base = (gapRow.capabilityId && CAPABILITY_INTERVENTIONS[gapRow.capabilityId]) || DEFAULT_INTERVENTION;
  const impact = IMPACT_BY_SEVERITY[gapRow.capabilityGap] || 1;

  if (gapRow.capabilityGap) {
    return {
      title: `${base.title} - ${gapRow.label}`,
      description: `Targeted review for "${gapRow.label}", which this opportunity evaluates directly.`,
      estMinutes: base.estMinutes,
      type: 'prepare',
      linkedRequirementId: gapRow.requirementId,
      impact,
    };
  }
  if (gapRow.evidenceGap) {
    return {
      title: `Add evidence for ${gapRow.label}`,
      description: 'Your capability looks reasonable, but there is limited proof of it on file. Attach or write up a relevant project or result.',
      estMinutes: EVIDENCE_INTERVENTION_MINUTES,
      type: 'evidence',
      linkedRequirementId: gapRow.requirementId,
      impact: Math.max(impact - 1, 1),
    };
  }
  return null;
}

/**
 * Generates the smallest set of actions that meaningfully improves
 * opportunity readiness within the student's available time (spec section
 * 33 - "Opportunity Preparation Optimizer"). Greedy by impact-per-minute
 * rather than an exhaustive search, so every choice stays explainable.
 */
function generateActionPlan({ eligibilityState, gaps, availableMinutes, simulationAvailable }) {
  const items = [];
  let order = 1;

  if (eligibilityState === 'UNCERTAIN') {
    items.push({ order: order++, title: 'Verify eligibility', description: "Confirm the detail ACEAPT couldn't determine automatically before investing prep time.", estMinutes: 5, type: 'verify' });
  }

  const candidateTasks = gaps.required
    .map(gapToTask)
    .filter(Boolean)
    .sort((a, b) => (b.impact / b.estMinutes) - (a.impact / a.estMinutes));

  const budget = typeof availableMinutes === 'number' && availableMinutes > 0 ? availableMinutes : 60;
  let used = 0;
  const chosen = [];
  for (const task of candidateTasks) {
    if (chosen.length >= MAX_PREP_TASKS) break;
    if (used + task.estMinutes <= budget || chosen.length === 0) {
      chosen.push(task);
      used += task.estMinutes;
    }
  }
  chosen.forEach((task) => items.push({ order: order++, ...task }));

  if (simulationAvailable) {
    items.push({ order: order++, title: 'Run opportunity-aligned simulation', description: "See where you're likely to struggle under realistic conditions before you apply.", estMinutes: 20, type: 'simulate' });
  }

  items.push({ order: order++, title: 'Review resume evidence', description: "Make sure your resume actually reflects the capabilities you're strongest in for this opportunity.", estMinutes: 10, type: 'evidence' });
  items.push({ order: order++, title: 'Apply', description: 'Submit your application.', estMinutes: 10, type: 'apply' });

  const totalEstMinutes = items.reduce((s, i) => s + i.estMinutes, 0);
  return { items, totalEstMinutes, budgetMinutes: Math.round(budget) };
}

module.exports = { generateActionPlan };
