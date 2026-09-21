// Diagnostic Engine (Section 12 — "Question as Diagnostic Sensor", and
// Section 33 — Diagnostic Mode).
//
// When the system can't yet tell which kind of gap a student has, the
// right move isn't to guess — it's to prefer a question whose wrong
// options are tagged with misconceptions mapped to DIFFERENT gap types.
// Whichever option the student picks then becomes evidence that actively
// discriminates between the hypotheses, instead of just being "another
// wrong answer."

const { TAG_TO_GAP } = require('../integrations/feature16-intervention.stub');

function gapTypesCovered(question) {
  const gapTypes = new Set();
  (question.options || []).forEach((o) => {
    if (o.misconceptionTag && TAG_TO_GAP[o.misconceptionTag]) {
      gapTypes.add(TAG_TO_GAP[o.misconceptionTag]);
    }
  });
  return gapTypes.size;
}

/**
 * Sort candidates so the ones with the most distinct gap-type coverage in
 * their distractors come first — those have the highest disambiguation
 * value for a DIAGNOSTIC-purpose question.
 */
function rankForDisambiguation(candidates) {
  return [...candidates].sort((a, b) => gapTypesCovered(b) - gapTypesCovered(a));
}

module.exports = { rankForDisambiguation, gapTypesCovered };
