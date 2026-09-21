import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectInterviewProblems } from './problemSelectionService';
import { InMemoryChallengeRepository, InMemoryExposureRepository } from '../integration/mockAdapters';

test('prefers an unseen problem over a previously-solved one with the same competency', async () => {
  const repo = new InMemoryChallengeRepository([
    { id: 'a', title: 'Two Sum variant', statement: '', constraints: '', competencies: ['hash-map'], difficulty: 'MEDIUM', supportedLanguages: ['python'] },
    { id: 'b', title: 'Unseen hash-map problem', statement: '', constraints: '', competencies: ['hash-map'], difficulty: 'MEDIUM', supportedLanguages: ['python'] },
  ]);
  const exposure = new InMemoryExposureRepository(new Map([
    ['student-1:a', { challengeId: 'a', viewedAt: '2026-01-01', attemptedAt: '2026-01-01', solvedAt: '2026-01-01', usedInAssessmentAt: null, usedInInterviewAt: null }],
  ]));

  const result = await selectInterviewProblems(
    { studentId: 'student-1', competencies: ['hash-map'], problemCount: 1 },
    repo, exposure,
  );

  assert.equal(result[0].challenge.id, 'b');
  assert.match(result[0].reason, /unseen/);
});

test('a problem already used in a prior interview is ranked last', async () => {
  const repo = new InMemoryChallengeRepository([
    { id: 'x', title: 'Used before', statement: '', constraints: '', competencies: ['graph'], difficulty: 'HARD', supportedLanguages: ['python'] },
    { id: 'y', title: 'Fresh', statement: '', constraints: '', competencies: ['graph'], difficulty: 'HARD', supportedLanguages: ['python'] },
  ]);
  const exposure = new InMemoryExposureRepository(new Map([
    ['student-1:x', { challengeId: 'x', viewedAt: null, attemptedAt: null, solvedAt: null, usedInAssessmentAt: null, usedInInterviewAt: '2026-02-01' }],
  ]));

  const result = await selectInterviewProblems(
    { studentId: 'student-1', competencies: ['graph'], problemCount: 2 },
    repo, exposure,
  );

  assert.deepEqual(result.map(r => r.challenge.id), ['y', 'x']);
});
