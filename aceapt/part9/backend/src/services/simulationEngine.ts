import { randomUUID } from 'node:crypto';
import { Errors } from '../domain/errors';
import {
  AnswerRecord,
  PressureMode,
  PublicQuestion,
  Simulation,
  SimulationEvent,
  SimulationQuestionRef,
} from '../domain/types';
import { Integrations } from '../integrations';
import { SimulationRepository } from '../repositories/simulationRepository';
import { BlueprintService } from './blueprintService';
import { QuestionSelectionService, getQuestionById, toPublicQuestion } from './questionSelectionService';
import { QUESTION_BANK } from '../data/questionBank';
import { TimerService } from './timerService';
import { SimulationReportService } from './simulationReportService';

// ============================================================
// SIMULATION ENGINE  (spec sections 47, 48, 51 + phases 6-11)
// ============================================================
// The single write-path for simulation state. Every mutation is
// ownership-checked and timer-checked here before anything touches the
// repository, so route handlers in src/api/routes.ts stay thin.

function emptyAnswerRecord(questionId: string): AnswerRecord {
  return {
    questionId,
    selectedOptionId: null,
    previousOptionIds: [],
    isCorrect: null,
    firstOpenedAt: null,
    answeredAt: null,
    timeSpentSeconds: 0,
    skipped: false,
    returned: false,
    remainingTimeFractionAtAnswer: null,
  };
}

export interface PublicSimulationView {
  id: string;
  mode: string;
  pressureMode: string;
  status: string;
  questionCount: number;
  currentQuestionIndex: number;
  durationSeconds: number;
  remainingSeconds: number;
  startedAt: number;
  progress: { answered: number; skipped: number; untouched: number };
}

export class SimulationEngine {
  private questionSelection = new QuestionSelectionService();
  private blueprintService = new BlueprintService();
  private timer = new TimerService();
  private reportService: SimulationReportService;

  constructor(private repo: SimulationRepository, private integrations: Integrations) {
    this.reportService = new SimulationReportService(repo, integrations);
  }

  async start(
    studentId: string,
    blueprintId: string,
    pressureOverride?: PressureMode,
  ): Promise<{ simulation: PublicSimulationView; firstQuestion: PublicQuestion }> {
    const blueprint = this.blueprintService.getOrThrow(blueprintId, pressureOverride);

    const skills = [...new Set(blueprint.skillDistribution.map((s) => s.skill))];
    // Consulted per spec section 36 (mastery evidence informs which
    // skills the report should connect back to Feature 8's state) -
    // the actual mastery-state lookup happens again in the report
    // service once the session completes.
    await this.integrations.feature8.getMasteryEvidence(studentId, skills);

    const candidateQuestionIds = QUESTION_BANK.filter((q) => skills.includes(q.skill)).map((q) => q.id);
    const exposure = await this.integrations.feature8.getQuestionExposure(studentId, candidateQuestionIds);

    const questionRefs = this.questionSelection.selectQuestions(blueprint, exposure);

    const now = this.timer.now();
    const simulation: Simulation = {
      id: randomUUID(),
      studentId,
      blueprintId: blueprint.id,
      mode: blueprint.mode,
      pressureMode: blueprint.pressureMode,
      status: 'IN_PROGRESS',
      questionRefs,
      answers: Object.fromEntries(questionRefs.map((q) => [q.questionId, emptyAnswerRecord(q.questionId)])),
      startedAt: now,
      completedAt: null,
      durationSeconds: blueprint.durationSeconds,
      negativeMarking: blueprint.negativeMarking,
      hideTopicLabels: blueprint.hideTopicLabels,
      currentQuestionIndex: 0,
    };

    await this.repo.save(simulation);
    await this.logEvent(simulation.id, null, 'OPEN', now);
    await this.logEvent(simulation.id, questionRefs[0]?.questionId ?? null, 'START', now);
    await this.integrations.feature8.recordExposure(studentId, questionRefs.map((q) => q.questionId));

    const firstQuestion = this.getPublicQuestion(simulation, questionRefs[0]);
    return { simulation: this.toPublicView(simulation), firstQuestion };
  }

  async getSimulation(studentId: string, simulationId: string): Promise<PublicSimulationView> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    await this.autoCompleteIfExpired(sim);
    return this.toPublicView(sim);
  }

  async getQuestionAt(studentId: string, simulationId: string, sequence: number): Promise<PublicQuestion> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    const ref = sim.questionRefs.find((r) => r.sequence === sequence);
    if (!ref) throw Errors.questionNotInSimulation(String(sequence));
    return this.getPublicQuestion(sim, ref);
  }

  async recordOpenEvent(studentId: string, simulationId: string, questionId: string): Promise<void> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    this.assertQuestionInSimulation(sim, questionId);
    const record = sim.answers[questionId];
    const now = this.timer.now();
    if (record.firstOpenedAt === null) {
      record.firstOpenedAt = now;
      await this.repo.save(sim);
    }
    await this.logEvent(simulationId, questionId, 'OPEN', now);
  }

  async answer(
    studentId: string,
    simulationId: string,
    questionId: string,
    optionId: string,
  ): Promise<{ simulation: PublicSimulationView }> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    if (await this.autoCompleteIfExpired(sim)) throw Errors.notInProgress();
    this.assertQuestionInSimulation(sim, questionId);

    const question = getQuestionById(questionId);
    if (!question) throw Errors.questionNotFound(questionId);

    const record = sim.answers[questionId];
    const now = this.timer.now();
    if (record.firstOpenedAt === null) record.firstOpenedAt = now;

    const isChange = record.selectedOptionId !== null && record.selectedOptionId !== optionId;
    if (isChange) record.previousOptionIds.push(record.selectedOptionId as string);

    record.selectedOptionId = optionId;
    record.answeredAt = now;
    record.skipped = false;
    record.isCorrect = question.correctOptionId === optionId;
    record.timeSpentSeconds = Math.max(0, (now - record.firstOpenedAt) / 1000);
    record.remainingTimeFractionAtAnswer = this.timer.remainingFraction(sim);

    await this.repo.save(sim);
    await this.logEvent(simulationId, questionId, isChange ? 'ANSWER_CHANGED' : 'ANSWER', now, {
      optionId,
    });

    return { simulation: this.toPublicView(sim) };
  }

  async skip(studentId: string, simulationId: string, questionId: string): Promise<{ simulation: PublicSimulationView }> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    if (await this.autoCompleteIfExpired(sim)) throw Errors.notInProgress();
    this.assertQuestionInSimulation(sim, questionId);

    const blueprint = this.blueprintService.getOrThrow(sim.blueprintId);
    if (!blueprint.allowSkip) throw Errors.skipNotAllowed();

    const record = sim.answers[questionId];
    if (record.selectedOptionId !== null) throw Errors.alreadyAnswered();

    const now = this.timer.now();
    if (record.firstOpenedAt === null) record.firstOpenedAt = now;
    record.skipped = true;
    record.timeSpentSeconds = Math.max(0, (now - record.firstOpenedAt) / 1000);

    await this.repo.save(sim);
    await this.logEvent(simulationId, questionId, 'SKIP', now);

    return { simulation: this.toPublicView(sim) };
  }

  async returnTo(studentId: string, simulationId: string, questionId: string): Promise<{ simulation: PublicSimulationView }> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    if (await this.autoCompleteIfExpired(sim)) throw Errors.notInProgress();
    this.assertQuestionInSimulation(sim, questionId);

    const blueprint = this.blueprintService.getOrThrow(sim.blueprintId);
    if (!blueprint.allowReturn) throw Errors.returnNotAllowed();

    const record = sim.answers[questionId];
    if (!record.skipped) throw Errors.notSkipped();
    record.returned = true;

    const now = this.timer.now();
    await this.repo.save(sim);
    await this.logEvent(simulationId, questionId, 'RETURN', now);

    return { simulation: this.toPublicView(sim) };
  }

  /** Convenience navigation helper (beyond the spec's literal route list - see README). */
  async goto(studentId: string, simulationId: string, index: number): Promise<{ simulation: PublicSimulationView }> {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    if (index < 0 || index >= sim.questionRefs.length) {
      throw Errors.questionNotInSimulation(String(index));
    }
    sim.currentQuestionIndex = index;
    await this.repo.save(sim);
    return { simulation: this.toPublicView(sim) };
  }

  async complete(studentId: string, simulationId: string) {
    const sim = await this.getOwnedSimulation(studentId, simulationId);

    if (sim.status === 'COMPLETED') {
      // Idempotent: never allow duplicate submissions to double-score.
      return this.reportService.getExistingReport(sim);
    }

    return this.finalize(sim);
  }

  async getReport(studentId: string, simulationId: string) {
    const sim = await this.getOwnedSimulation(studentId, simulationId);
    if (sim.status !== 'COMPLETED') {
      throw Errors.notInProgress();
    }
    return this.reportService.getExistingReport(sim);
  }

  async listHistory(studentId: string) {
    return this.reportService.getHistory(studentId);
  }

  // ---------------- internal helpers ----------------

  private async finalize(sim: Simulation) {
    const now = this.timer.now();
    sim.status = 'COMPLETED';
    sim.completedAt = now;
    await this.repo.save(sim);
    await this.logEvent(sim.id, null, 'SUBMIT', now);
    return this.reportService.finalizeAndBuildReport(sim);
  }

  private async autoCompleteIfExpired(sim: Simulation): Promise<boolean> {
    if (sim.status === 'IN_PROGRESS' && this.timer.isExpired(sim)) {
      await this.finalize(sim);
      return true;
    }
    return sim.status !== 'IN_PROGRESS';
  }

  private async getOwnedSimulation(studentId: string, simulationId: string): Promise<Simulation> {
    const sim = await this.repo.findById(simulationId);
    if (!sim) throw Errors.simulationNotFound(simulationId);
    if (sim.studentId !== studentId) throw Errors.notOwner();
    return sim;
  }

  private assertQuestionInSimulation(sim: Simulation, questionId: string): void {
    if (!sim.answers[questionId]) throw Errors.questionNotInSimulation(questionId);
  }

  private getPublicQuestion(sim: Simulation, ref?: SimulationQuestionRef): PublicQuestion {
    if (!ref) throw Errors.questionNotFound('unknown');
    const question = getQuestionById(ref.questionId);
    if (!question) throw Errors.questionNotFound(ref.questionId);
    return toPublicQuestion(question, ref.sequence, sim.hideTopicLabels);
  }

  private async logEvent(
    simulationId: string,
    questionId: string | null,
    type: SimulationEvent['type'],
    timestamp: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.appendEvent({
      id: randomUUID(),
      simulationId,
      questionId,
      type,
      timestamp,
      metadata,
    });
  }

  private toPublicView(sim: Simulation): PublicSimulationView {
    const answered = Object.values(sim.answers).filter((a) => a.selectedOptionId !== null).length;
    const skipped = Object.values(sim.answers).filter((a) => a.skipped).length;
    const untouched = sim.questionRefs.length - answered - skipped;
    return {
      id: sim.id,
      mode: sim.mode,
      pressureMode: sim.pressureMode,
      status: sim.status,
      questionCount: sim.questionRefs.length,
      currentQuestionIndex: sim.currentQuestionIndex,
      durationSeconds: sim.durationSeconds,
      remainingSeconds: Math.round(this.timer.remainingSeconds(sim)),
      startedAt: sim.startedAt,
      progress: { answered, skipped, untouched },
    };
  }
}
