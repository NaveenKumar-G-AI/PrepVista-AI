import { repo } from './store/repository.js';
import { genId } from './domain/id.js';
import type { SkillEvidence } from './domain/types.js';

export const STUDENT = 'demo-student-1';
export const OTHER_STUDENT = 'demo-student-2'; // seeded with nothing, used to test cross-student access denial

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function ev(partial: Omit<SkillEvidence, 'id' | 'studentId'>): SkillEvidence {
  return { id: genId('ev'), studentId: STUDENT, ...partial };
}

repo.load();
repo.reset();

// Feature 1 — self-reported context
repo.setSelfPerception({ studentId: STUDENT, domain: 'Quantitative', selfRating: 'strong', capturedAt: daysAgo(30) });
repo.setSelfPerception({ studentId: STUDENT, domain: 'Logical', selfRating: 'weak', capturedAt: daysAgo(30) });

// Feature 2 — diagnostic + practice evidence
const evidence: SkillEvidence[] = [
  // Percentage Fundamentals — strong, well-evidenced (HIGH tier, uncapped)
  ev({ skillId: 'skl_pct_fund', role: 'primary_skill', questionId: 'q1', questionAttemptId: 'a1', correct: true, difficulty: 1, cognitiveLevel: 'foundation', timeTakenMs: 30000, expectedTimeMs: 35000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_pct_fund', role: 'primary_skill', questionId: 'q2', questionAttemptId: 'a2', correct: true, difficulty: 1, cognitiveLevel: 'foundation', timeTakenMs: 28000, expectedTimeMs: 35000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_pct_fund', role: 'primary_skill', questionId: 'q3', questionAttemptId: 'a3', correct: true, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 40000, expectedTimeMs: 45000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_pct_fund', role: 'primary_skill', questionId: 'q4', questionAttemptId: 'a4', correct: false, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 50000, expectedTimeMs: 45000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_pct_fund', role: 'primary_skill', questionId: 'q5', questionAttemptId: 'a5', correct: true, difficulty: 3, cognitiveLevel: 'foundation', timeTakenMs: 55000, expectedTimeMs: 55000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_pct_fund', role: 'primary_skill', questionId: 'q6', questionAttemptId: 'a6', correct: true, difficulty: 3, cognitiveLevel: 'foundation', timeTakenMs: 52000, expectedTimeMs: 55000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Percentage Application — developing, application gap (MODERATE tier)
  ev({ skillId: 'skl_pct_app', role: 'primary_skill', questionId: 'q7', questionAttemptId: 'a7', correct: false, difficulty: 2, cognitiveLevel: 'application', timeTakenMs: 60000, expectedTimeMs: 50000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_pct_app', role: 'primary_skill', questionId: 'q8', questionAttemptId: 'a8', correct: true, difficulty: 2, cognitiveLevel: 'application', timeTakenMs: 58000, expectedTimeMs: 50000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_pct_app', role: 'primary_skill', questionId: 'q9', questionAttemptId: 'a9', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 70000, expectedTimeMs: 60000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_pct_app', role: 'primary_skill', questionId: 'q10', questionAttemptId: 'a10', correct: false, difficulty: 4, cognitiveLevel: 'application', timeTakenMs: 80000, expectedTimeMs: 65000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_pct_app', role: 'primary_skill', questionId: 'q11', questionAttemptId: 'a11', correct: true, difficulty: 2, cognitiveLevel: 'application', timeTakenMs: 55000, expectedTimeMs: 50000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),

  // Profit & Loss — weak, moderate evidence. q12 also exercises Percentage
  // Application as a supporting skill (a P&L question leans on it).
  ev({ skillId: 'skl_pnl', role: 'primary_skill', questionId: 'q12', questionAttemptId: 'a12', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 75000, expectedTimeMs: 60000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_pct_app', role: 'supporting_skill', questionId: 'q12', questionAttemptId: 'a12b', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 75000, expectedTimeMs: 60000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_pnl', role: 'primary_skill', questionId: 'q13', questionAttemptId: 'a13', correct: true, difficulty: 2, cognitiveLevel: 'application', timeTakenMs: 65000, expectedTimeMs: 60000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_pnl', role: 'primary_skill', questionId: 'q14', questionAttemptId: 'a14', correct: false, difficulty: 4, cognitiveLevel: 'transfer', timeTakenMs: 90000, expectedTimeMs: 70000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_pnl', role: 'primary_skill', questionId: 'q15', questionAttemptId: 'a15', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 85000, expectedTimeMs: 60000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Ratio — strong, well-evidenced (HIGH tier)
  ev({ skillId: 'skl_ratio', role: 'primary_skill', questionId: 'q16', questionAttemptId: 'a16', correct: true, difficulty: 1, cognitiveLevel: 'foundation', timeTakenMs: 25000, expectedTimeMs: 30000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_ratio', role: 'primary_skill', questionId: 'q17', questionAttemptId: 'a17', correct: true, difficulty: 1, cognitiveLevel: 'foundation', timeTakenMs: 24000, expectedTimeMs: 30000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_ratio', role: 'primary_skill', questionId: 'q18', questionAttemptId: 'a18', correct: true, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 35000, expectedTimeMs: 40000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_ratio', role: 'primary_skill', questionId: 'q19', questionAttemptId: 'a19', correct: true, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 33000, expectedTimeMs: 40000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_ratio', role: 'primary_skill', questionId: 'q20', questionAttemptId: 'a20', correct: true, difficulty: 3, cognitiveLevel: 'foundation', timeTakenMs: 45000, expectedTimeMs: 48000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_ratio', role: 'primary_skill', questionId: 'q21', questionAttemptId: 'a21', correct: true, difficulty: 3, cognitiveLevel: 'foundation', timeTakenMs: 44000, expectedTimeMs: 48000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Proportion — developing (MODERATE tier)
  ev({ skillId: 'skl_proportion', role: 'primary_skill', questionId: 'q22', questionAttemptId: 'a22', correct: true, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 38000, expectedTimeMs: 40000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_proportion', role: 'primary_skill', questionId: 'q23', questionAttemptId: 'a23', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 60000, expectedTimeMs: 50000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_proportion', role: 'primary_skill', questionId: 'q24', questionAttemptId: 'a24', correct: true, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 37000, expectedTimeMs: 40000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Time & Work — contradictory evidence: perfect one session, zero the next
  ev({ skillId: 'skl_time_work', role: 'primary_skill', questionId: 'q25', questionAttemptId: 'a25', correct: true, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 70000, expectedTimeMs: 65000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_time_work', role: 'primary_skill', questionId: 'q26', questionAttemptId: 'a26', correct: true, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 68000, expectedTimeMs: 65000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_time_work', role: 'primary_skill', questionId: 'q27', questionAttemptId: 'a27', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 75000, expectedTimeMs: 65000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_time_work', role: 'primary_skill', questionId: 'q28', questionAttemptId: 'a28', correct: false, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 78000, expectedTimeMs: 65000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Logical Reasoning — strong, well-evidenced, but self-rated weak (hidden strength)
  ev({ skillId: 'skl_log_reasoning', role: 'primary_skill', questionId: 'q29', questionAttemptId: 'a29', correct: true, difficulty: 1, cognitiveLevel: 'foundation', timeTakenMs: 40000, expectedTimeMs: 45000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_log_reasoning', role: 'primary_skill', questionId: 'q30', questionAttemptId: 'a30', correct: true, difficulty: 2, cognitiveLevel: 'foundation', timeTakenMs: 50000, expectedTimeMs: 55000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),
  ev({ skillId: 'skl_log_reasoning', role: 'primary_skill', questionId: 'q31', questionAttemptId: 'a31', correct: true, difficulty: 2, cognitiveLevel: 'application', timeTakenMs: 55000, expectedTimeMs: 58000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_log_reasoning', role: 'primary_skill', questionId: 'q32', questionAttemptId: 'a32', correct: true, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 65000, expectedTimeMs: 68000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_log_reasoning', role: 'primary_skill', questionId: 'q33', questionAttemptId: 'a33', correct: false, difficulty: 4, cognitiveLevel: 'application', timeTakenMs: 90000, expectedTimeMs: 80000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_log_reasoning', role: 'primary_skill', questionId: 'q34', questionAttemptId: 'a34', correct: true, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 60000, expectedTimeMs: 68000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Circular Seating — accurate but consistently slow (speed gap)
  ev({ skillId: 'skl_circular_seating', role: 'primary_skill', questionId: 'q35', questionAttemptId: 'a35', correct: true, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 150000, expectedTimeMs: 90000, source: 'practice', sessionId: 's2', createdAt: daysAgo(14) }),
  ev({ skillId: 'skl_circular_seating', role: 'primary_skill', questionId: 'q36', questionAttemptId: 'a36', correct: true, difficulty: 3, cognitiveLevel: 'application', timeTakenMs: 140000, expectedTimeMs: 90000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),
  ev({ skillId: 'skl_circular_seating', role: 'primary_skill', questionId: 'q37', questionAttemptId: 'a37', correct: true, difficulty: 4, cognitiveLevel: 'application', timeTakenMs: 170000, expectedTimeMs: 100000, source: 'practice', sessionId: 's3', createdAt: daysAgo(6) }),

  // Contextual Vocabulary — a single data point (cold start)
  ev({ skillId: 'skl_vocab_context', role: 'primary_skill', questionId: 'q38', questionAttemptId: 'a38', correct: true, difficulty: 2, cognitiveLevel: 'application', timeTakenMs: 30000, expectedTimeMs: 30000, source: 'diagnostic', sessionId: 's1', createdAt: daysAgo(20) }),

  // Data Sufficiency — zero evidence, intentionally left out (NOT_ASSESSED)
];

for (const e of evidence) repo.addEvidence(e);
repo.save();

console.log(`Seeded ${evidence.length} evidence records for "${STUDENT}".`);
console.log(`"${OTHER_STUDENT}" has no data — used to test cross-student access denial.`);
