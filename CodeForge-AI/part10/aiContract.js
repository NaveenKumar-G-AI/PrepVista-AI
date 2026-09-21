/**
 * AI Evaluation Contract (Phase 21, 41-43).
 *
 * This is the shape every AI code-review call must return, whether it
 * comes from a live Groq/Gemini call (aiProvider.js) or the demo stand-in
 * (demoAIReviewer.js). evaluationEngine.js only ever depends on this
 * shape — it doesn't know or care which one produced it.
 *
 * validateAIReviewResponse / sanitizeAIReviewResponse are the deterministic
 * enforcement of Phase 21's rule: "AI must never invent files, functions or
 * behavior. If it cannot prove an observation from the repository, do not
 * present it as fact." A prompt instruction alone can't guarantee that — an
 * automated grounding check against the actual submitted files can.
 */

export const QUALITATIVE_CATEGORIES = ['code_quality', 'architecture', 'documentation'];

/**
 * @param {unknown} response
 * @param {Record<string,string>} submissionFiles - path -> content, what the AI was actually shown
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAIReviewResponse(response, submissionFiles) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response is not an object.'] };
  }
  if (!Array.isArray(response.feedback)) {
    errors.push('feedback must be an array.');
  }
  if (response.categoryScoreAdjustments && typeof response.categoryScoreAdjustments !== 'object') {
    errors.push('categoryScoreAdjustments must be an object.');
  }
  if (response.categoryScoreAdjustments) {
    for (const [key, val] of Object.entries(response.categoryScoreAdjustments)) {
      if (!QUALITATIVE_CATEGORIES.includes(key)) {
        errors.push(
          `categoryScoreAdjustments contains a non-qualitative key "${key}" — only ${QUALITATIVE_CATEGORIES.join(', ')} may come from AI (Phase 42); functionality/testing/security stay deterministic.`
        );
      }
      if (typeof val !== 'number' || val < 0 || val > 100) {
        errors.push(`categoryScoreAdjustments.${key} must be a number 0-100 (got ${JSON.stringify(val)}).`);
      }
    }
  }

  const knownFiles = Object.keys(submissionFiles ?? {});
  for (const [i, item] of (response.feedback ?? []).entries()) {
    if (!item?.category || !item?.observation) {
      errors.push(`feedback[${i}] is missing category/observation.`);
      continue;
    }
    if (item.evidenceRef) {
      const grounded = knownFiles.some((f) => item.evidenceRef.includes(f));
      if (!grounded) {
        errors.push(
          `feedback[${i}].evidenceRef ("${item.evidenceRef}") doesn't match any file actually in the submission — likely a hallucinated reference.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Strips ungrounded feedback items instead of rejecting the whole response —
 * one hallucinated observation shouldn't discard everything the review got
 * right. Clamps score adjustments and drops any non-qualitative key.
 *
 * @param {any} response
 * @param {Record<string,string>} submissionFiles
 */
export function sanitizeAIReviewResponse(response, submissionFiles) {
  const knownFiles = Object.keys(submissionFiles ?? {});

  const feedback = (response?.feedback ?? []).filter((item) => {
    if (!item?.category || !item?.observation) return false;
    if (!item.evidenceRef) return true; // no reference claimed — nothing to ground-check
    return knownFiles.some((f) => item.evidenceRef.includes(f));
  });

  const categoryScoreAdjustments = {};
  for (const [key, val] of Object.entries(response?.categoryScoreAdjustments ?? {})) {
    if (QUALITATIVE_CATEGORIES.includes(key) && typeof val === 'number') {
      categoryScoreAdjustments[key] = Math.max(0, Math.min(100, val));
    }
  }

  return { feedback, categoryScoreAdjustments };
}
