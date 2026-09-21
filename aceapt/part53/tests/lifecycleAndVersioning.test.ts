import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/db/memoryRepository.js';
import { LifecycleService } from '../src/services/lifecycleService.js';
import { createEngine } from '../src/services/index.js';
import { IllegalTransitionError } from '../src/errors.js';
import { LifecycleStatus, QuestionHealth, QuestionPurpose, TrustLevel } from '../src/types/enums.js';
import { Question } from '../src/types/domain.js';

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    isGlobal: true,
    lifecycleStatus: LifecycleStatus.DRAFT,
    trustLevel: TrustLevel.UNVERIFIED,
    health: QuestionHealth.HEALTHY,
    lifecycleVersion: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LifecycleService — section 8/14: guarded state machine', () => {
  it('rejects an illegal transition (RETIRED is terminal)', () => {
    const svc = new LifecycleService();
    const q = makeQuestion({ lifecycleStatus: LifecycleStatus.RETIRED });
    expect(() => svc.transition(q, LifecycleStatus.PUBLISHED, 'admin:1')).toThrow(IllegalTransitionError);
  });

  it('allows a legal transition and bumps lifecycleVersion', () => {
    const svc = new LifecycleService();
    const q = makeQuestion({ lifecycleStatus: LifecycleStatus.NEEDS_REVIEW });
    svc.transition(q, LifecycleStatus.APPROVED, 'admin:1');
    expect(q.lifecycleStatus).toBe(LifecycleStatus.APPROVED);
    expect(q.lifecycleVersion).toBe(1);
  });

  it('moveToValidating routes a revalidation through REVALIDATION_REQUIRED, not straight from PUBLISHED', () => {
    const svc = new LifecycleService();
    const q = makeQuestion({ lifecycleStatus: LifecycleStatus.PUBLISHED });
    svc.moveToValidating(q, 'system');
    expect(q.lifecycleStatus).toBe(LifecycleStatus.VALIDATING);
  });
});

describe('VersioningService — sections 71/72/105/161/162', () => {
  it('creates a new version, preserves the old one unmutated, and triggers revalidation on an answer change', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await engine.qualityService.createAndValidate({
      content: 'What is 20% of 500?',
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '125', numericValue: 125 },
        { id: 'C', text: '90', numericValue: 90 },
      ],
      answerKey: ['A'],
      multiSelect: false,
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 },
      skillMapping: { primarySkill: 'PERCENTAGE' },
      difficultyMetadata: { label: 'EASY' },
      purpose: QuestionPurpose.PRACTICE,
    });
    expect(created.status).toBe('PASS');

    const v2 = await engine.versioningService.createNewVersion(created.question.id, { answerKey: ['B'] }, 'reviewer:1');
    expect(v2.versionNumber).toBe(2);
    expect(v2.changedFields).toContain('answerKey');

    const versions = engine.repo.listVersions(created.question.id);
    expect(versions).toHaveLength(2); // history retained, nothing deleted
    expect(versions[0].answerKey).toEqual(['A']); // v1 untouched
    expect(versions[1].answerKey).toEqual(['B']);

    // The bad edit (B is not independently correct) should have been caught by revalidation.
    const question = engine.repo.getQuestion(created.question.id)!;
    expect(question.lifecycleStatus).toBe(LifecycleStatus.NEEDS_REVIEW);
    const issues = engine.repo.listIssues(v2.id);
    expect(issues.some((i) => i.type === 'ANSWER_MISMATCH')).toBe(true);
  });
});
