import { AdaptivePathState, PathStage, NextBestChallenge, PathIntent } from '../types';

const STAGE_ORDER: PathStage[] = [
  'FOUNDATION',
  'PRACTICE',
  'VARIATION',
  'TRANSFER',
  'APPLICATION',
  'ADVANCED',
  'ROLE_ASSESSMENT',
];

function nextStage(stage: PathStage): PathStage {
  const idx = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
}

export function initAdaptivePath(studentId: string): AdaptivePathState {
  const now = new Date().toISOString();
  return {
    studentId,
    currentStage: 'FOUNDATION',
    history: [{ stage: 'FOUNDATION', enteredAt: now, reason: 'Initial enrollment.' }],
  };
}

/**
 * Advances (or holds) the student's adaptive-path stage based on the
 * PathIntent of the challenge just completed and its outcome. This is
 * intentionally evidence-driven rather than a fixed animation — see
 * "Adaptive Path Visualization" in the spec. A single failure never causes
 * a stage regression here; whether the underlying skill classification
 * changes is governed separately by the overfit guard in
 * evidence/aggregateEvidence.ts.
 */
export function advanceAdaptivePath(
  state: AdaptivePathState,
  selected: NextBestChallenge,
  outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL'
): AdaptivePathState {
  const now = new Date().toISOString();
  const intent: PathIntent = selected.pathIntent;
  let newStage = state.currentStage;
  let reason: string;

  if (outcome === 'SUCCESS') {
    if (intent === 'TRANSFER' || intent === 'PROGRESSION') {
      newStage = nextStage(state.currentStage);
      reason = `Advanced after a successful ${intent.toLowerCase()} challenge.`;
    } else if (intent === 'RETENTION_CHECK' || intent === 'REINFORCEMENT') {
      reason = 'Retention confirmed; stage held.';
    } else if (intent === 'REMEDIATION') {
      reason = 'Remediation succeeded; stage held pending confirmation.';
    } else {
      reason = 'Diagnostic completed; stage held pending further evidence.';
    }
  } else if (outcome === 'FAILURE') {
    reason =
      intent === 'PROGRESSION' || intent === 'TRANSFER'
        ? 'Struggled at this stage; remaining here before any further advancement.'
        : 'Remediation/diagnostic attempt did not succeed; stage held.';
  } else {
    reason = 'Partial result recorded; stage held.';
  }

  const event = { stage: newStage, enteredAt: now, reason, challengeId: selected.challengeId };
  return { ...state, currentStage: newStage, history: [...state.history, event] };
}
