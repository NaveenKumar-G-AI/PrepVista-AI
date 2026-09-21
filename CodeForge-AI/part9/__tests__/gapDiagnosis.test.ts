import { describe, expect, it } from 'vitest';
import { diagnoseGap } from '../src/domain/gapDiagnosis.js';
import type { SkillEvidence } from '../src/domain/types.js';

describe('diagnoseGap — PHASE 17/18', () => {
  it('recommends the weak prerequisite instead of the failing target skill', () => {
    const result = diagnoseGap(
      'dynamic-programming',
      [],
      [
        { skillId: 'recursion', state: 'STRONG' },
        { skillId: 'state-modeling', state: 'DEVELOPING' },
      ],
      [
        { fromSkillId: 'recursion', toSkillId: 'dynamic-programming', type: 'PREREQUISITE', weight: 1 },
        { fromSkillId: 'state-modeling', toSkillId: 'dynamic-programming', type: 'PREREQUISITE', weight: 1 },
      ]
    );
    expect(result.category).toBe('PREREQUISITE_GAP');
    expect(result.targetSkillId).toBe('state-modeling');
  });

  it('does not flag a prerequisite gap when all prerequisites are solid', () => {
    const result = diagnoseGap(
      'dynamic-programming',
      [],
      [{ skillId: 'recursion', state: 'STRONG' }],
      [{ fromSkillId: 'recursion', toSkillId: 'dynamic-programming', type: 'PREREQUISITE', weight: 1 }]
    );
    expect(result.category).not.toBe('PREREQUISITE_GAP');
  });

  it('classifies failure evidence by failureReason once prerequisites are solid', () => {
    const failures: SkillEvidence[] = [
      {
        id: '1',
        studentId: 's',
        skillId: 'graphs',
        problemId: 'p1',
        source: 'PRACTICE',
        difficulty: 'medium',
        independent: true,
        hintsUsed: 0,
        solutionViewed: false,
        isTransfer: false,
        timed: false,
        passed: false,
        failureReason: 'EDGE_CASE',
        createdAt: new Date().toISOString(),
      },
    ];
    const result = diagnoseGap('graphs', failures, [{ skillId: 'bfs-dfs', state: 'STRONG' }], [
      { fromSkillId: 'bfs-dfs', toSkillId: 'graphs', type: 'PREREQUISITE', weight: 1 },
    ]);
    expect(result.category).toBe('EDGE_CASE_GAP');
    expect(result.targetSkillId).toBe('graphs');
  });

  it('falls back to NEEDS_REVIEW instead of guessing when there is no failure evidence at all', () => {
    const result = diagnoseGap('graphs', [], [], []);
    expect(result.category).toBe('NEEDS_REVIEW');
  });
});
