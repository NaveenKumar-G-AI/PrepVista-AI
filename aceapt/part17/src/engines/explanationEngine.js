// Explanation Engine (Section 34, 35, 64).
//
// Section 34 is explicit: keep the "why am I getting this question?" copy
// concise and do not expose sensitive internal system information. So this
// module deliberately never surfaces raw confidence numbers, misconception
// tag codenames, or internal branch-action strings to the student — those
// live only in the "System Intelligence" debug view the frontend gates
// behind an explicit toggle, described in the README as a judge/demo view
// a real product would not ship to end users.

const { humanizeSkill } = require('../utils/text');

const ARC_STEP_COPY = {
  INTERVENTION_VERIFICATION: () => "You just worked through a short explanation on this. Let's see if it clicked.",
  TRANSFER: () => "Strategy is looking steadier — let's check it holds up in an unfamiliar setting.",
  MIXED_PRACTICE: () => "Let's see if you can spot this strategy when it's mixed in with other topics.",
};

function buildWhyThisQuestion({ purposeCtx }) {
  return purposeCtx.rationale || 'Selected based on your current progress on this skill.';
}

function buildTargets(question) {
  const list = [];
  list.push({ label: 'Strategy selection', active: question.difficulty.strategy !== 'easy' });
  list.push({ label: 'Transfer / unfamiliar application', active: !!question.transferLevel && question.transferLevel !== 'none' });
  list.push({ label: 'Speed', active: question.difficulty.expectedTimeSeconds <= 30 });
  list.push({ label: 'Concept depth', active: question.difficulty.concept !== 'easy' });
  list.push({ label: 'Multi-step reasoning', active: question.cognitiveDemand === 'analysis' });
  return list;
}

const BRANCH_COPY = {
  ARC_STARTED: "This points to a specific, fixable gap — not just \"wrong.\" A short targeted explanation is coming up before the next question on this skill.",
  ARC_STEP_ADVANCED: "That's progress. Building on it next.",
  ARC_STEP_RETRY: "Not quite yet — let's try this angle once more before moving on.",
  ARC_RESET_TO_DIAGNOSTIC: "Let's step back and re-check with a fresh diagnostic question.",
  ARC_COMPLETE: 'That confirms the gap is closing — concept, strategy, and transfer all moved in the same session.',
  DIAGNOSTIC_FOLLOWUP: 'One more focused question will help pin down exactly where the gap is.',
  ADVANCE: "Nice work — this supports growing mastery.",
};

function buildWhatWeLearned({ question, evidence, branchOutcome }) {
  const skillLabel = humanizeSkill(question.microSkill);
  const headline = evidence.correct
    ? `${skillLabel}: correct — this supports growing mastery.`
    : `${skillLabel}: that answer points to a specific gap, not just a wrong click.`;
  const followUp = BRANCH_COPY[branchOutcome.action] || '';
  return [headline, followUp].filter(Boolean).join(' ');
}

module.exports = { buildWhyThisQuestion, buildTargets, buildWhatWeLearned, ARC_STEP_COPY };
