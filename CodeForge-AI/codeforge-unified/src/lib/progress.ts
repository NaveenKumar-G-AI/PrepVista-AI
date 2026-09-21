import type { LocalState } from './state';
import { challenges } from './challenges';
import { computeMastery } from '@/engines/mastery/mastery/estimators';
import type { Evidence } from '@/engines/mastery/types';
import { calculateGrowth } from '@/engines/growth/growth';
import type { SkillObservation } from '@/engines/growth/types';
export function progressFor(challengeId: string, attempts: LocalState['attempts']) {
  const challenge = challenges.find(c => c.challengeId === challengeId)!;
  const rows = attempts.filter(a => a.challengeId === challengeId);
  const evidence: Evidence[] = rows.map(a => ({ id: a.id, studentId: 'local', skillId: challenge.skill, attemptId: a.id, challengeId, isPrimary: true, rawScore: a.passed / a.total, difficultyScore: challenge.difficulty.conceptualComplexity * 2, independent: !a.assisted, assistanceUsed: a.assisted ? 'HINT' : 'NONE', mistakeCategory: null, languageIssue: a.languageIssue, contextType: 'STANDARD', createdAt: a.at }));
  const estimate = computeMastery(evidence);
  const latest = rows.at(-1);
  const comparable = rows.filter(r => !r.languageIssue && r.assisted === latest?.assisted && r.total === latest?.total);
  function observation(window: typeof rows): SkillObservation {
    const last = window[window.length - 1];
    return { skillId: challengeId, skillName: challenge.title, value: window.reduce((sum, r) => sum + r.passed / r.total * 100, 0) / window.length, observedAt: last.at, calculationVersion: 'practice-checks-v1', assessmentType: `${last.assisted ? 'guided' : 'independent'}:${last.total}`, sourceType: 'ASSESSMENT', evidence: window.map(row => ({ id: row.id, type: 'CHALLENGE_SUBMISSION', skillId: challengeId, observedAt: row.at, successful: row.passed === row.total })) };
  }
  const growth = comparable.length >= 6 ? calculateGrowth(observation(comparable.slice(0, 3)), observation(comparable.slice(-3)), { requireSameAssessmentType: true }) : null;
  return { rows, estimate, growth };
}
