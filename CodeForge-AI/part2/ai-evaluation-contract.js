'use strict';
/**
 * Structured, schema-validated contract for AI-assisted evaluation of
 * open-ended (CONCEPTUAL / TECHNICAL_REASONING / EXPLANATION) responses.
 * Deterministic outcomes (code execution, multiple choice, SQL clause
 * checks) never go through here — see adaptive-engine.js: evaluateDeterministic.
 * That separation is deliberate (spec section 32): the AI is never allowed
 * to decide "your code passed" when the execution result says otherwise.
 *
 * PROVIDER ABSTRACTION
 * adaptive-engine.js calls an injected `evaluator(task, responseText) =>
 * Promise<{performance, detail, aiEvaluation}>`. This file provides:
 *
 *   - validateAiEvaluation(raw)   schema gate — invalid shape is rejected,
 *                                 never persisted as if it were a real grade
 *   - buildEvaluationPrompt(...)  the exact prompt to send to a real model
 *   - parseProviderJson(...)      strip fences, parse, validate — call this
 *                                 on whatever a real provider returns
 *   - createDeterministicMockProvider()  no-network heuristic stand-in,
 *                                 used by demo-verify.js
 *
 * No real Groq/Gemini/Claude network call is wired up in this file — this
 * build environment has no network and no provider keys. The React view
 * (codeforge-diagnostic-view.jsx) wires a REAL Claude call using this same
 * prompt builder + validator, as a stand-in for Groq/Gemini (see that
 * file's `claudeProvider`, and the truth table in ARCHITECTURE_AND_TRUTH_TABLE.md).
 * Swapping in real Groq/Gemini means writing a fetch call whose response
 * text is piped through parseProviderJson() — nothing else changes.
 */

const EVAL_SCHEMA_VERSION = 'ai-eval-v1';
const ALLOWED_UNDERSTANDING = ['FOUNDATION', 'DEVELOPING', 'COMPETENT', 'STRONG'];
const ALLOWED_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'];

function validateAiEvaluation(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['not an object'] };
  if (!ALLOWED_UNDERSTANDING.includes(raw.conceptual_understanding)) errors.push('conceptual_understanding invalid');
  if (typeof raw.reasoning_quality !== 'string' || !raw.reasoning_quality.trim()) errors.push('reasoning_quality must be a non-empty string');
  if (!Array.isArray(raw.misconceptions)) errors.push('misconceptions must be an array');
  if (!Array.isArray(raw.evidence)) errors.push('evidence must be an array');
  if (!ALLOWED_CONFIDENCE.includes(raw.confidence)) errors.push('confidence invalid');
  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      conceptual_understanding: raw.conceptual_understanding,
      reasoning_quality: String(raw.reasoning_quality).slice(0, 300),
      misconceptions: raw.misconceptions.slice(0, 5).map(String),
      evidence: raw.evidence.slice(0, 5).map(String),
      confidence: raw.confidence,
      schemaVersion: EVAL_SCHEMA_VERSION,
    },
  };
}

function parseProviderJson(rawText) {
  try {
    const cleaned = String(rawText).replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateAiEvaluation(parsed);
  } catch (e) {
    return { valid: false, errors: [`JSON parse failed: ${e.message}`] };
  }
}

function buildEvaluationPrompt(task, responseText) {
  return [
    'You are grading one open-ended technical diagnostic response.',
    'Return ONLY a JSON object, no prose, no markdown fences, matching exactly this shape:',
    '{"conceptual_understanding":"FOUNDATION|DEVELOPING|COMPETENT|STRONG","reasoning_quality":"<one short sentence>","misconceptions":["<short phrase>"],"evidence":["<short phrase quoting or paraphrasing what the student actually wrote>"],"confidence":"LOW|MEDIUM|HIGH"}',
    '',
    `Task: ${task.title}`,
    `Prompt given to the student: ${task.prompt}`,
    task.aiRubric ? `Grading rubric: ${task.aiRubric}` : '',
    '',
    `Student response: ${responseText || '(empty)'}`,
    '',
    "confidence reflects YOUR certainty in this grade, not the student's skill level. Use LOW if the response is very short, off-topic, or ambiguous.",
  ].filter(Boolean).join('\n');
}

// performance is derived from conceptual_understanding for evidence-recording
// purposes; the richer aiEvaluation object is kept alongside for drilldown.
function understandingToPerformance(understanding) {
  if (understanding === 'STRONG' || understanding === 'COMPETENT') return 'CORRECT';
  if (understanding === 'DEVELOPING') return 'PARTIAL';
  return 'INCORRECT';
}

// No network, no model call. Rewards responses that touch the rubric's key
// terms, penalizes very short answers. This is a heuristic stand-in for
// grading quality, not a claim about it — see the truth table.
function createDeterministicMockProvider() {
  return async function mockEvaluate(task, responseText) {
    const text = (responseText || '').toLowerCase().trim();
    if (text.length < 8) {
      const aiEvaluation = {
        conceptual_understanding: 'FOUNDATION',
        reasoning_quality: 'Response too short to assess.',
        misconceptions: [], evidence: [], confidence: 'LOW', schemaVersion: EVAL_SCHEMA_VERSION,
      };
      return { performance: 'INCORRECT', detail: 'Response too short to evaluate', aiEvaluation };
    }
    // Prefer an explicit keyTerms list (a handful of load-bearing terms) over
    // extracting every 4+-letter word from the prose rubric — the latter
    // dilutes the ratio with connective words ("correct", "explains") that
    // no answer needs to literally contain.
    const rubricTerms = task.keyTerms && task.keyTerms.length
      ? task.keyTerms
      : [...new Set((task.aiRubric || '').toLowerCase().match(/[a-z]{4,}/g) || [])];
    const hits = rubricTerms.filter((t) => text.includes(t));
    const hitRatio = rubricTerms.length ? hits.length / rubricTerms.length : 0.5;
    const understanding = hitRatio > 0.22 ? 'COMPETENT' : hitRatio > 0.1 ? 'DEVELOPING' : 'FOUNDATION';
    const aiEvaluation = {
      conceptual_understanding: understanding,
      reasoning_quality: hitRatio > 0.22
        ? 'Touches the key mechanism the rubric looks for.'
        : 'Missing some of the key mechanism the rubric looks for.',
      misconceptions: [],
      evidence: hits.slice(0, 3),
      confidence: hitRatio > 0.22 ? 'MEDIUM' : 'LOW',
      schemaVersion: EVAL_SCHEMA_VERSION,
    };
    return {
      performance: understandingToPerformance(understanding),
      detail: `Mock provider: matched ${hits.length}/${rubricTerms.length} rubric terms`,
      aiEvaluation,
    };
  };
}

module.exports = {
  EVAL_SCHEMA_VERSION,
  validateAiEvaluation,
  parseProviderJson,
  buildEvaluationPrompt,
  understandingToPerformance,
  createDeterministicMockProvider,
};
