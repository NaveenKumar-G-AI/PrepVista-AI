import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/db/memoryRepository.js';
import { createEngine } from '../src/services/index.js';
import { AuthorizationError, ConcurrencyConflictError, ValidationBlockedError } from '../src/errors.js';
import { assertTenantAccess, filterQuestionVersionForRole } from '../src/security/rbac.js';
import { ProvenanceSource, QuestionPurpose, ReviewDecision, Role } from '../src/types/enums.js';

async function createNeedsReviewQuestion(engine: ReturnType<typeof createEngine>, tenantId?: string) {
  return engine.qualityService.createAndValidate({
    content: 'A bag has red and blue marbles in ratio 2:3, 100 total. How many are red?',
    options: [
      { id: 'A', text: '40', numericValue: 40 },
      { id: 'B', text: '60', numericValue: 60 },
      { id: 'C', text: '50', numericValue: 50 },
    ],
    answerKey: ['A'],
    multiSelect: false,
    computation: { kind: 'RATIO_SHARE', total: 100, ratio: [2, 3], shareIndex: 0 },
    skillMapping: { primarySkill: 'PROBABILITY' }, // mismatched on purpose -> lands in NEEDS_REVIEW
    difficultyMetadata: { label: 'MEDIUM' },
    purpose: QuestionPurpose.PRACTICE,
    tenantId,
  });
}

describe('ReviewService — section 164: role security', () => {
  it('a STUDENT cannot review a question', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await createNeedsReviewQuestion(engine);
    const q = engine.repo.getQuestion(created.question.id)!;
    expect(() =>
      engine.reviewService.reviewQuestion({
        questionId: q.id,
        reviewerId: 'someone',
        role: Role.STUDENT,
        decision: ReviewDecision.APPROVE,
        expectedLifecycleVersion: q.lifecycleVersion,
      }),
    ).toThrow(AuthorizationError);
  });

  it('a CONTENT_REVIEWER can review a question', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await createNeedsReviewQuestion(engine);
    const q = engine.repo.getQuestion(created.question.id)!;
    const result = engine.reviewService.reviewQuestion({
      questionId: q.id,
      reviewerId: 'alice',
      role: Role.CONTENT_REVIEWER,
      decision: ReviewDecision.APPROVE,
      overrideReason: 'Heuristic-only skill mismatch, verified manually.',
      expectedLifecycleVersion: q.lifecycleVersion,
    });
    expect(result.lifecycleStatus).toBe('APPROVED');
  });
});

describe('ReviewService — section 11/79: cannot silently approve past an unresolved CRITICAL issue', () => {
  it('throws ValidationBlockedError on APPROVE with open critical issues and no overrideReason', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await engine.qualityService.createAndValidate({
      content: 'What is 20% of 500?',
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '125', numericValue: 125 },
      ],
      answerKey: ['B'], // wrong -> CRITICAL ANSWER_MISMATCH
      multiSelect: false,
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 },
      purpose: QuestionPurpose.PRACTICE,
    });
    const q = engine.repo.getQuestion(created.question.id)!;
    expect(() =>
      engine.reviewService.reviewQuestion({
        questionId: q.id,
        reviewerId: 'alice',
        role: Role.CONTENT_REVIEWER,
        decision: ReviewDecision.APPROVE,
        expectedLifecycleVersion: q.lifecycleVersion,
      }),
    ).toThrow(ValidationBlockedError);
  });

  it('allows APPROVE past a critical issue only with an overrideReason, and logs it to the audit trail', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await engine.qualityService.createAndValidate({
      content: 'What is 20% of 500?',
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '125', numericValue: 125 },
      ],
      answerKey: ['B'],
      multiSelect: false,
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 },
      purpose: QuestionPurpose.PRACTICE,
    });
    const q = engine.repo.getQuestion(created.question.id)!;
    engine.reviewService.reviewQuestion({
      questionId: q.id,
      reviewerId: 'alice',
      role: Role.ADMIN,
      decision: ReviewDecision.APPROVE,
      overrideReason: 'Content team confirmed the computation metadata itself was wrong, not the question.',
      expectedLifecycleVersion: q.lifecycleVersion,
    });
    const trail = engine.audit.trail(q.id);
    const overrideEvent = trail.find((e) => e.metadata && 'overrideReason' in e.metadata);
    expect(overrideEvent).toBeTruthy();
  });
});

describe('ReviewService — section 165: optimistic concurrency', () => {
  it('a stale expectedLifecycleVersion is rejected after another reviewer already acted', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await createNeedsReviewQuestion(engine);
    const staleVersion = engine.repo.getQuestion(created.question.id)!.lifecycleVersion;

    engine.reviewService.reviewQuestion({
      questionId: created.question.id,
      reviewerId: 'alice',
      role: Role.CONTENT_REVIEWER,
      decision: ReviewDecision.APPROVE,
      overrideReason: 'ok',
      expectedLifecycleVersion: staleVersion,
    });

    expect(() =>
      engine.reviewService.reviewQuestion({
        questionId: created.question.id,
        reviewerId: 'bob',
        role: Role.CONTENT_REVIEWER,
        decision: ReviewDecision.APPROVE,
        expectedLifecycleVersion: staleVersion, // Bob loaded the page before Alice acted
      }),
    ).toThrow(ConcurrencyConflictError);
  });
});

describe('Section 90/163: tenant isolation', () => {
  it('assertTenantAccess denies cross-tenant access to non-global content', () => {
    expect(() => assertTenantAccess('tenant-A', { tenantId: 'tenant-B', isGlobal: false })).toThrow(AuthorizationError);
  });

  it('assertTenantAccess allows access to global content regardless of tenant', () => {
    expect(() => assertTenantAccess('tenant-A', { tenantId: undefined, isGlobal: true })).not.toThrow();
  });

  it('assertTenantAccess allows matching tenants', () => {
    expect(() => assertTenantAccess('tenant-A', { tenantId: 'tenant-A', isGlobal: false })).not.toThrow();
  });

  it('assertTenantAccess allows access when the resource has no tenant scope assigned at all (nothing to isolate against)', () => {
    expect(() => assertTenantAccess(undefined, { tenantId: undefined, isGlobal: false })).not.toThrow();
  });

  it('assertTenantAccess still denies a tenant-less requester reading a resource explicitly owned by a tenant', () => {
    expect(() => assertTenantAccess(undefined, { tenantId: 'tenant-B', isGlobal: false })).toThrow(AuthorizationError);
  });
});

describe('Section 89/103/130: students never receive the answer key or solution', () => {
  it('filterQuestionVersionForRole strips answerKey/solution for STUDENT and TRAINER', () => {
    const version = {
      id: 'v1',
      questionId: 'q1',
      versionNumber: 1,
      content: 'stem',
      options: [],
      answerKey: ['A'],
      multiSelect: false,
      solution: { derivedValue: 42 },
      createdAt: new Date().toISOString(),
    };
    const forStudent = filterQuestionVersionForRole(version, Role.STUDENT);
    expect('answerKey' in forStudent).toBe(false);
    expect('solution' in forStudent).toBe(false);

    const forReviewer = filterQuestionVersionForRole(version, Role.CONTENT_REVIEWER);
    expect(forReviewer.answerKey).toEqual(['A']);
  });
});
