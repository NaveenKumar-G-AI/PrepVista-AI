import { beforeEach, describe, expect, it } from 'vitest';
import { SimulationEngine } from '../src/services/simulationEngine';
import { InMemorySimulationRepository } from '../src/repositories/simulationRepository';
import { createDefaultIntegrations, MockFeature7Client, MockFeature6Client } from '../src/integrations';
import { getQuestionById } from '../src/data/questionBank';
import { Errors } from '../src/domain/errors';

describe('SimulationEngine (end to end)', () => {
  let repo: InMemorySimulationRepository;
  let integrations: ReturnType<typeof createDefaultIntegrations>;
  let engine: SimulationEngine;

  beforeEach(() => {
    repo = new InMemorySimulationRepository();
    integrations = createDefaultIntegrations();
    engine = new SimulationEngine(repo, integrations);
  });

  it('runs a full quick simulation: mixed questions, hidden labels, skip + return, negative-marking-aware scoring, and a report', async () => {
    const studentId = 'student-42';
    const { simulation, firstQuestion } = await engine.start(studentId, 'quick-simulation-v1');

    expect(simulation.questionCount).toBe(8);
    expect(simulation.status).toBe('IN_PROGRESS');
    // Topic labels must be hidden for this blueprint (spec section 8).
    expect(firstQuestion.skill).toBeNull();
    expect(firstQuestion.difficulty).toBeNull();

    const stored = await repo.findById(simulation.id);
    expect(stored).toBeDefined();
    const refs = stored!.questionRefs;
    expect(new Set(refs.map((r) => r.questionId)).size).toBe(8); // no duplicate questions

    // Answer the first 6 correctly and efficiently, skip #7, get #8 wrong quickly.
    for (let i = 0; i < 6; i++) {
      const ref = refs[i];
      const question = getQuestionById(ref.questionId)!;
      await engine.answer(studentId, simulation.id, ref.questionId, question.correctOptionId);
    }
    await engine.skip(studentId, simulation.id, refs[6].questionId);
    const wrongOption = getQuestionById(refs[7].questionId)!.options.find(
      (o) => o.id !== getQuestionById(refs[7].questionId)!.correctOptionId,
    )!;
    await engine.answer(studentId, simulation.id, refs[7].questionId, wrongOption.id);

    // Return to the skipped question and answer it correctly on the second pass.
    await engine.returnTo(studentId, simulation.id, refs[6].questionId);
    const skippedQuestion = getQuestionById(refs[6].questionId)!;
    await engine.answer(studentId, simulation.id, refs[6].questionId, skippedQuestion.correctOptionId);

    const report = await engine.complete(studentId, simulation.id);

    expect(report.correctCount).toBe(7);
    expect(report.wrongCount).toBe(1);
    expect(report.skippedCount).toBe(0);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.dimensions.accuracy).toBe(87.5); // 7/8
    expect(report.topStrengths.length).toBeGreaterThan(0);
    expect(report.topBottlenecks.length).toBeGreaterThan(0);
    expect(report.performanceCurve).toHaveLength(3);

    // Completing again must be idempotent (spec section 51: no duplicate submission).
    const secondReport = await engine.complete(studentId, simulation.id);
    expect(secondReport.simulationId).toBe(report.simulationId);
    expect(secondReport.overallScore).toBe(report.overallScore);

    // Feature 6/7 integration actually fired exactly once.
    const feature6 = integrations.feature6 as MockFeature6Client;
    const feature7 = integrations.feature7 as MockFeature7Client;
    expect(feature6.getSubmissions()).toHaveLength(1);
    expect(feature7.getReceivedSignals()).toHaveLength(1);
    expect(feature7.getReceivedSignals()[0].student_id).toBe(studentId);

    // History now shows this simulation.
    const history = await engine.listHistory(studentId);
    expect(history).toHaveLength(1);
    expect(history[0].overallScore).toBe(report.overallScore);
  });

  it('rejects access to a simulation that belongs to a different student', async () => {
    const { simulation } = await engine.start('student-A', 'quick-simulation-v1');
    await expect(engine.getSimulation('student-B', simulation.id)).rejects.toMatchObject({
      status: Errors.notOwner().status,
    });
  });

  it('rejects skipping a question that has already been answered', async () => {
    const studentId = 'student-1';
    const { simulation } = await engine.start(studentId, 'quick-simulation-v1');
    const stored = await repo.findById(simulation.id);
    const ref = stored!.questionRefs[0];
    const question = getQuestionById(ref.questionId)!;

    await engine.answer(studentId, simulation.id, ref.questionId, question.correctOptionId);
    await expect(engine.skip(studentId, simulation.id, ref.questionId)).rejects.toMatchObject({
      code: 'ALREADY_ANSWERED',
    });
  });

  it('rejects returning to a question that was never skipped', async () => {
    const studentId = 'student-1';
    const { simulation } = await engine.start(studentId, 'quick-simulation-v1');
    const stored = await repo.findById(simulation.id);
    const ref = stored!.questionRefs[0];

    await expect(engine.returnTo(studentId, simulation.id, ref.questionId)).rejects.toMatchObject({
      code: 'NOT_SKIPPED',
    });
  });
});
