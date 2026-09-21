import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/db/memoryRepository.js';
import { createEngine } from '../src/services/index.js';
import { ProductionMode, QuestionPurpose } from '../src/types/enums.js';

async function createPublishedQuestion(engine: ReturnType<typeof createEngine>, content = 'A clean question for suspension/protection tests.') {
  const created = await engine.qualityService.createAndValidate({
    content,
    options: [
      { id: 'A', text: '1', numericValue: 1 },
      { id: 'B', text: '2', numericValue: 2 },
      { id: 'C', text: '3', numericValue: 3 },
    ],
    answerKey: ['A'],
    multiSelect: false,
    skillMapping: { primarySkill: 'GENERAL' },
    difficultyMetadata: { label: 'EASY' },
    purpose: QuestionPurpose.PRACTICE,
  });
  await engine.publicationService.publish(created.question.id, 'admin:1');
  return created;
}

describe('PublicationService — sections 55-60/70/104/153-157', () => {
  it('section 153: a suspended question is no longer eligible for any production mode', async () => {
    const engine = createEngine(new MemoryRepository());
    const { question } = await createPublishedQuestion(engine);
    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.PRACTICE)).toBe(true);

    await engine.publicationService.suspend(question.id, 'critical defect found', 'system:test');

    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.PRACTICE)).toBe(false);
    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.TIMED_CHALLENGE)).toBe(false);
    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.ASSESSMENT)).toBe(false);
  });

  it('section 154: suspension does not delete version history', async () => {
    const engine = createEngine(new MemoryRepository());
    const { question } = await createPublishedQuestion(engine);
    await engine.publicationService.suspend(question.id, 'issue', 'system:test');
    expect(engine.repo.listVersions(question.id)).toHaveLength(1);
    expect(engine.repo.getQuestion(question.id)).toBeTruthy();
  });

  it('sections 57-59/70: shouldExcludeFromAggregate is the hook downstream analytics must call', async () => {
    const engine = createEngine(new MemoryRepository());
    const { question } = await createPublishedQuestion(engine);
    expect(engine.publicationService.shouldExcludeFromAggregate(question.id, 'ACCURACY')).toBe(false);

    await engine.publicationService.suspend(question.id, 'issue', 'system:test');

    expect(engine.publicationService.shouldExcludeFromAggregate(question.id, 'ACCURACY')).toBe(true);
    expect(engine.publicationService.shouldExcludeFromAggregate(question.id, 'SPEED')).toBe(true);
    expect(engine.publicationService.shouldExcludeFromAggregate(question.id, 'MASTERY')).toBe(true);
    expect(engine.publicationService.shouldExcludeFromAggregate(question.id, 'READINESS')).toBe(true);
  });

  it('section 60: TIMED_CHALLENGE demands full HEALTHY status; PRACTICE tolerates WATCH', async () => {
    const engine = createEngine(new MemoryRepository());
    const { question } = await createPublishedQuestion(engine);
    // Directly poke health to WATCH to simulate a monitored-but-not-yet-suspended item.
    const q = engine.repo.getQuestion(question.id)!;
    q.health = 'WATCH' as typeof q.health;
    engine.repo.saveQuestion(q);

    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.PRACTICE)).toBe(true);
    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.TIMED_CHALLENGE)).toBe(false);
  });

  it('restore brings a suspended question back into eligible pools', async () => {
    const engine = createEngine(new MemoryRepository());
    const { question } = await createPublishedQuestion(engine);
    await engine.publicationService.suspend(question.id, 'issue', 'system:test');
    engine.publicationService.restore(question.id, 'admin:1', 'False alarm, content was fine.');
    expect(engine.publicationService.isEligibleForMode(question.id, ProductionMode.PRACTICE)).toBe(true);
  });

  it('getEligiblePool only returns quality-eligible content', async () => {
    const engine = createEngine(new MemoryRepository());
    const a = await createPublishedQuestion(engine, 'A shopkeeper buys pencils wholesale and sells them at a markup.');
    const b = await createPublishedQuestion(engine, 'Two trains depart from opposite ends of a rail line at the same time.');
    await engine.publicationService.suspend(b.question.id, 'issue', 'system:test');

    const pool = engine.publicationService.getEligiblePool();
    const ids = pool.map((v) => v.questionId);
    expect(ids).toContain(a.question.id);
    expect(ids).not.toContain(b.question.id);
  });
});
