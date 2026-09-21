import { buildTestEngine } from '../helpers/buildEngine';
import { EngineError } from '../../src/engine/AdaptiveDiagnosticEngine';

describe('Security and integrity (spec sections 66-67, 88)', () => {
  it('rejects access to a session by a different student', async () => {
    const { engine } = buildTestEngine({ seed: 1 });
    const owner = { studentId: 'owner' };
    const intruder = { studentId: 'intruder' };
    const state = await engine.startSession({ student: owner, config: { requiredDomains: ['Quant'], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 5 } });

    await expect(engine.getNextQuestion(state.sessionId, intruder.studentId)).rejects.toThrow(EngineError);
    await expect(engine.getState(state.sessionId, intruder.studentId)).rejects.toThrow(EngineError);
    await expect(engine.getResult(state.sessionId, intruder.studentId)).rejects.toThrow(EngineError);
  });

  it('rejects a response submitted for a question that is not the current pending question (no duplicate/mismatched responses)', async () => {
    const { engine } = buildTestEngine({ seed: 2 });
    const student = { studentId: 'stu' };
    const state = await engine.startSession({ student, config: { requiredDomains: ['Quant'], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 5 } });
    await engine.getNextQuestion(state.sessionId, student.studentId);

    await expect(
      engine.submitResponse(state.sessionId, student.studentId, { questionId: 'not-the-pending-question', isCorrect: true, responseTimeMs: 1000 })
    ).rejects.toThrow(EngineError);
  });

  it('rejects resuming a session that is not paused', async () => {
    const { engine } = buildTestEngine({ seed: 4 });
    const student = { studentId: 'stu2' };
    const state = await engine.startSession({ student, config: { requiredDomains: ['Quant'], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 5 } });
    await expect(engine.resumeSession(state.sessionId, student.studentId)).rejects.toThrow(EngineError);
  });

  it('rejects pausing a session twice in a row', async () => {
    const { engine } = buildTestEngine({ seed: 6 });
    const student = { studentId: 'stu3' };
    const state = await engine.startSession({ student, config: { requiredDomains: ['Quant'], minQuestionsPerDomain: 0, minQuestions: 1, maxQuestions: 5 } });
    await engine.pauseSession(state.sessionId, student.studentId);
    await expect(engine.pauseSession(state.sessionId, student.studentId)).rejects.toThrow(EngineError);
  });
});
