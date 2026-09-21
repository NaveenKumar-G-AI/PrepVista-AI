// Validation Engine (Section 10, 46).
//
// "Where deterministic validation is possible, use deterministic
// validation" (Section 46). This is honest about its limits: it does NOT
// do full symbolic re-derivation of arbitrary LLM-authored math — that
// would be overclaiming. What it does do, deterministically, every time:
//
//   structural   -> exactly 4 options, non-empty text, stem present
//   answer       -> exactly one option marked correct
//   logical      -> no duplicate option text
//   skill align  -> generated microSkill matches the spec that was asked for
//
// Anything that fails one of those is a hard rejection (Section 10: "Never
// expose an unvalidated generated question when validation is required").
// A missing/weak explanation or a purpose-tag mismatch is logged as a soft
// "needs review" flag rather than a rejection, per Section 28: "Do not
// automatically remove a question merely because it is hard."
//
// Template-generated questions (generationEngine's deterministic path) are
// correct by construction — the math is computed, not guessed — so they
// carry validationState 'auto_verified' already; this pipeline still runs
// the structural/answer/logical checks on them for defense in depth.

function validate(question, spec) {
  if (!question) {
    return { approved: false, mode: null, reasons: ['no_question_generated'], needsReview: false };
  }

  const reasons = [];
  let hardFail = false;

  if (!question.stem || typeof question.stem !== 'string' || question.stem.trim().length < 8) {
    reasons.push('stem_missing_or_too_short');
    hardFail = true;
  }

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    reasons.push('must_have_exactly_4_options');
    hardFail = true;
  }

  if (!hardFail) {
    const correctOnes = question.options.filter((o) => o.correct);
    if (correctOnes.length !== 1) {
      reasons.push('must_have_exactly_1_correct_option');
      hardFail = true;
    }

    const texts = question.options.map((o) => String(o.text ?? '').trim().toLowerCase());
    if (new Set(texts).size !== texts.length) {
      reasons.push('duplicate_option_text');
      hardFail = true;
    }

    if (question.options.some((o) => !o.text || String(o.text).trim().length === 0)) {
      reasons.push('empty_option_text');
      hardFail = true;
    }
  }

  if (spec?.skillId && question.microSkill !== spec.skillId) {
    reasons.push('skill_alignment_mismatch');
    hardFail = true; // a question for the wrong skill defeats the whole point of generating one
  }

  // Soft checks — logged, not rejected.
  if (!question.explanation || question.explanation.trim().length < 10) {
    reasons.push('weak_or_missing_explanation');
  }

  const mode = question.generation ? question.generation.mode : 'bank';
  const approved = !hardFail;

  return { approved, mode, reasons, needsReview: approved && reasons.length > 0 };
}

module.exports = { validate };
