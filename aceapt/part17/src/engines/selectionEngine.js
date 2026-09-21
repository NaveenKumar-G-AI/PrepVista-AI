// Question Selection Engine (Section 7 & 8).
//
// Core rule from Section 7: before generating anything, ask "does a
// validated existing question already satisfy the objective?" This module
// only ever looks at the validated bank. The orchestrator is responsible
// for falling through to the Generation Engine when this returns null.

const antiRepetition = require('./antiRepetitionEngine');
const diagnosticEngine = require('./diagnosticEngine');

const LEVELS = { easy: 1, medium: 2, hard: 3 };
const BROAD_POOL_PURPOSES = new Set(['ASSESSMENT_SIMULATION', 'READINESS']);

function levelDistance(a, b) {
  if (!a || !b) return 0;
  return Math.abs((LEVELS[a] || 2) - (LEVELS[b] || 2));
}

function scoreCandidate(q, { purpose, difficultyTarget }) {
  let score = 0;

  // A question's PRIMARY purpose should always outrank it merely being
  // tagged as secondarily relevant to another purpose — otherwise a
  // MIXED_PRACTICE question that's also TRANSFER-tagged can wrongly beat
  // the question whose actual job is TRANSFER, just by tying on difficulty.
  if (q.primaryPurpose === purpose) {
    score += 6;
  } else if (q.purposeTags && q.purposeTags.includes(purpose)) {
    score += 2;
  }

  score -= levelDistance(q.difficulty.concept, difficultyTarget.concept);
  score -= levelDistance(q.difficulty.strategy, difficultyTarget.strategy);
  score -= levelDistance(q.difficulty.calculation, difficultyTarget.calculation);
  score -= levelDistance(q.difficulty.reading, difficultyTarget.reading);

  if (difficultyTarget.maxExpectedTimeSeconds && q.difficulty.expectedTimeSeconds > difficultyTarget.maxExpectedTimeSeconds) {
    score -= 3;
  }
  if (difficultyTarget.transferDistance && q.transferLevel === difficultyTarget.transferDistance) {
    score += 2;
  }
  if (purpose === 'DIAGNOSTIC') {
    score += diagnosticEngine.gapTypesCovered(q) * 2;
  }

  return score;
}

/**
 * @param {object} args
 * @param {object[]} args.bank full validated question bank
 * @param {string} args.skillId target micro-skill
 * @param {string} args.purpose desired QUESTION_PURPOSE
 * @param {object} args.difficultyTarget from difficultyEngine.targetFor
 * @param {object} args.exposures studentId's exposure map (questionId -> exposure)
 * @param {object[]|null} args.mixedPool full bank to draw from, for MIXED_PRACTICE
 * @returns {object|null} the chosen bank question, or null if nothing eligible
 */
function select({ bank, skillId, purpose, difficultyTarget, exposures, mixedPool }) {
  let pool;
  if (purpose === 'MIXED_PRACTICE' && mixedPool) {
    pool = mixedPool;
  } else if (BROAD_POOL_PURPOSES.has(purpose)) {
    pool = bank;
  } else {
    pool = bank.filter((q) => q.microSkill === skillId);
  }

  const eligible = pool.filter((q) => antiRepetition.isEligible(exposures[q.id], purpose));
  if (eligible.length === 0) return null;

  const scored = eligible.map((q) => ({ q, score: scoreCandidate(q, { purpose, difficultyTarget }) }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].q;
}

/**
 * Last-resort fallback (Section 57): ignore purpose/difficulty matching
 * entirely and just find *something* for this skill the student hasn't
 * drowned in yet. Used when generation fails or is rejected and even the
 * normal selection pass came up empty.
 */
function selectRelaxed({ bank, skillId, exposures }) {
  const pool = bank.filter((q) => q.microSkill === skillId);
  if (pool.length === 0) return null;
  const eligible = pool.filter((q) => !exposures[q.id] || exposures[q.id].timesSeen < 3);
  return eligible[0] || pool[0];
}

module.exports = { select, selectRelaxed, scoreCandidate };
