import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGap } from '../../src/gaps/gapDetector.js';
import { computeMastery } from '../../src/mastery/estimators.js';
import type { Evidence, StudentSkillState } from '../../src/types.js';

function ev(partial: Partial<Evidence> & { rawScore: number }): Evidence {
  return {
    id: 'e', studentId: 's1', skillId: 'skill_x', attemptId: 'a', challengeId: 'c', isPrimary: true,
    difficultyScore: 3, independent: true, assistanceUsed: 'NONE', mistakeCategory: null, languageIssue: false,
    contextType: 'STANDARD', createdAt: new Date().toISOString(), ...partial,
  };
}
function state(partial: Partial<StudentSkillState>): StudentSkillState {
  return {
    studentId: 's1', skillId: 'skill_x', masteryScore: 50, confidenceScore: 50, masteryState: 'DEVELOPING',
    trend: 'STABLE', evidenceCount: 3, independentSuccessCount: 1, distinctChallengesCount: 3,
    contradictionFlag: false, masteryVerified: false, lastAssessedAt: null, nextReviewAt: null, ...partial,
  };
}

test('gap: zero/near-zero evidence -> INSUFFICIENT_EVIDENCE, not a weakness', () => {
  const g = detectGap(state({ evidenceCount: 1 }), [ev({ rawScore: 1 })]);
  assert.equal(g?.gapType, 'INSUFFICIENT_EVIDENCE');
});

test('gap: strong on STANDARD context, weak on NOVEL context -> TRANSFER_GAP (Phase 35 exact scenario)', () => {
  const evidence = [
    ev({ rawScore: 1, contextType: 'STANDARD', challengeId: 'binary_search' }),
    ev({ rawScore: 1, contextType: 'STANDARD', challengeId: 'binary_search_2' }),
    ev({ rawScore: 0, contextType: 'NOVEL', challengeId: 'search_rotated' }),
  ];
  const g = detectGap(state({ evidenceCount: 3, masteryState: 'COMPETENT' }), evidence);
  assert.equal(g?.gapType, 'TRANSFER_GAP');
});

test('gap: repeated timeouts -> COMPLEXITY_GAP', () => {
  const evidence = [
    ev({ rawScore: 0.5, mistakeCategory: 'COMPLEXITY_ISSUE' }),
    ev({ rawScore: 0.5, mistakeCategory: 'COMPLEXITY_ISSUE' }),
    ev({ rawScore: 1 }),
  ];
  const g = detectGap(state({}), evidence);
  assert.equal(g?.gapType, 'COMPLEXITY_GAP');
});

test('gap: state-management failure pattern -> DEBUGGING_GAP', () => {
  const evidence = [
    ev({ rawScore: 1, mistakeCategory: 'NONE' }),
    ev({ rawScore: 0.6, mistakeCategory: 'STATE_MANAGEMENT_ERROR' }),
  ];
  const g = detectGap(state({ masteryScore: 45, masteryState: 'DEVELOPING' }), evidence);
  assert.equal(g?.gapType, 'DEBUGGING_GAP');
});

test('gap: boundary-only failures -> APPLICATION_GAP, not KNOWLEDGE_GAP', () => {
  const evidence = [
    ev({ rawScore: 1, mistakeCategory: 'NONE' }),
    ev({ rawScore: 0.7, mistakeCategory: 'BOUNDARY_CONDITION' }),
  ];
  const g = detectGap(state({ masteryScore: 60, masteryState: 'COMPETENT' }), evidence);
  assert.equal(g?.gapType, 'APPLICATION_GAP');
});

test('gap: consistently low score with no specific pattern -> KNOWLEDGE_GAP', () => {
  const evidence = [ev({ rawScore: 0.2 }), ev({ rawScore: 0.1 }), ev({ rawScore: 0.3 })];
  const g = detectGap(state({ masteryScore: 20, masteryState: 'EXPLORING' }), evidence);
  assert.equal(g?.gapType, 'KNOWLEDGE_GAP');
});

test('gap: solid, unremarkable performance -> no gap at all', () => {
  const evidence = [ev({ rawScore: 1 }), ev({ rawScore: 1 }), ev({ rawScore: 1 }), ev({ rawScore: 1 })];
  const g = detectGap(state({ masteryScore: 80, masteryState: 'STRONG', evidenceCount: 4 }), evidence);
  assert.equal(g, null);
});

test('gap: language-only syntax errors are never classified as an algorithmic KNOWLEDGE_GAP (Phase 34)', () => {
  const evidence = [
    ev({ rawScore: 0, mistakeCategory: 'SYNTAX_ERROR', languageIssue: true }),
    ev({ rawScore: 0, mistakeCategory: 'SYNTAX_ERROR', languageIssue: true }),
    ev({ rawScore: 1, mistakeCategory: 'NONE' }),
  ];
  // Derive a realistic state the way the real pipeline does (mastery is computed FROM this evidence,
  // and computeMastery itself excludes language-issue rows) rather than hand-picking a number —
  // this is what actually caught the bug: hand-picking a "plausible" pre-fix score hid it.
  const mastery = computeMastery(evidence, { prerequisiteReadinessScore: null });
  const g = detectGap(state({ masteryScore: mastery.masteryScore, evidenceCount: mastery.evidenceCount, masteryState: 'DEVELOPING' }), evidence);
  if (g) assert.notEqual(g.gapType, 'KNOWLEDGE_GAP', 'syntax errors alone should not be reported as a conceptual knowledge gap');
  // And directly: the filtered mastery score should reflect ONLY the one clean independent pass, i.e. 100, not be dragged down by syntax noise.
  assert.equal(mastery.masteryScore, 100, 'mastery score should be computed only from the one real (non-language-issue) attempt');
  assert.equal(mastery.evidenceCount, 1, 'evidenceCount should reflect only meaningful (non-syntax-noise) evidence');
});
