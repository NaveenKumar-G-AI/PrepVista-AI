/**
 * Evaluation Engine — orchestrates deterministic scoring (always runs)
 * with an optional AI qualitative layer (Phase 42/43): if AI is
 * unavailable or fails, evaluation still completes on deterministic
 * signal alone; if AI responds, its output is grounding-checked
 * (aiContract.js) before any of it reaches a student.
 *
 * @typedef {import('../types').ProjectDefinition} ProjectDefinition
 * @typedef {import('../types').Rubric} Rubric
 * @typedef {import('../types').EvaluationResult} EvaluationResult
 */
import { scoreSubmission } from './rubricEngine.js';
import { sanitizeAIReviewResponse } from '../ai/aiContract.js';

const SEVERITY_PENALTY = { low: 5, medium: 15, high: 30, critical: 60 };

/**
 * @param {{
 *   submission: { files?: Record<string,string>, testResultsClaimed?: string[] },
 *   project: ProjectDefinition,
 *   rubric: Rubric,
 *   deps: {
 *     runTests: import('./executionAdapter.js').RunTests,
 *     runSecurityChecks?: import('./executionAdapter.js').RunSecurityChecks,
 *     aiReview?: (submission: any, project: ProjectDefinition, testResult: any) => Promise<any>,
 *   },
 * }} args
 * @returns {Promise<EvaluationResult>}
 */
export async function evaluateSubmission({ submission, project, rubric, deps }) {
  const testResult = await deps.runTests(submission, project);
  const security = deps.runSecurityChecks
    ? await deps.runSecurityChecks(submission, project)
    : { securityFindings: [] };

  const deterministicScores = deriveDeterministicScores({ testResult, security });

  let aiAvailable = false;
  let aiFeedback = [];
  let aiScoreAdjustments = {};
  if (deps.aiReview) {
    try {
      const raw = await deps.aiReview(submission, project, testResult);
      if (raw) {
        const sanitized = sanitizeAIReviewResponse(raw, submission.files ?? {});
        aiFeedback = sanitized.feedback;
        aiScoreAdjustments = sanitized.categoryScoreAdjustments;
        aiAvailable = true;
      }
    } catch {
      aiAvailable = false; // AI failure never blocks evaluation — Phase 43
    }
  }

  const finalScores = { ...deterministicScores, ...aiScoreAdjustments };
  const { totalScore, breakdown, missingCategories, fullyAssessed } = scoreSubmission(rubric, finalScores);
  const passed = totalScore >= (project.passThreshold ?? 70) && testResult.hiddenPassed === testResult.hiddenTotal;

  return {
    totalScore,
    breakdown,
    passed,
    aiAvailable,
    fullyAssessed,
    missingCategories,
    testResult,
    security,
    feedback: [...deterministicFeedback({ testResult, security }), ...aiFeedback],
    evaluatedAt: new Date().toISOString(),
  };
}

function deriveDeterministicScores({ testResult, security }) {
  const visibleRate = testResult.visibleTotal ? testResult.visiblePassed / testResult.visibleTotal : 1;
  const hiddenRate = testResult.hiddenTotal ? testResult.hiddenPassed / testResult.hiddenTotal : 1;
  // Hidden tests weighted higher — passing only what you can see is worth less
  // than passing what you couldn't game (Phase 15).
  const functionality = Math.round((visibleRate * 0.4 + hiddenRate * 0.6) * 100);
  const testing = Math.round(hiddenRate * 100);
  const penalty = security.securityFindings.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 10), 0);
  const securityScore = Math.max(0, 100 - penalty);
  return { functionality, testing, security: securityScore };
}

function deterministicFeedback({ testResult, security }) {
  const feedback = [];
  for (const f of testResult.failures) {
    feedback.push({
      category: 'testing',
      observation: `Test failed: ${f.id}`,
      impact: f.message,
      recommendation: 'Reconcile the implementation with the requirement this acceptance criterion maps to.',
      evidenceRef: f.id,
    });
  }
  for (const s of security.securityFindings) {
    feedback.push({
      category: 'security',
      observation: s.description,
      impact: `Severity: ${s.severity}`,
      recommendation: 'Address before resubmission.',
    });
  }
  return feedback;
}
