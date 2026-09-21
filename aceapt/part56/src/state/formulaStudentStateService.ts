import {
  COMPETENCY_DIMENSIONS,
  CompetencyDimension,
  DimensionEvidence,
  DimensionStatusLabel,
  FormulaStudentState,
  FormulaTrainingAttempt,
  SUPPORT_LEVELS,
  SupportLevel,
  TrainingActivityType,
} from '../types';
import { StudentStateRepository } from '../repositories';

export const MIN_SAMPLES_FOR_SIGNAL = 4;
export const ROLLING_WINDOW = 10;
const STRONG_THRESHOLD = 0.8;
const WEAK_THRESHOLD = 0.5;
const FADE_STREAK = 3;

/** Which competency dimension a given activity type produces evidence for. */
export function dimensionForActivity(activityType: TrainingActivityType): CompetencyDimension {
  switch (activityType) {
    case 'RECOGNIZE':
      return 'recognition';
    case 'RECALL':
      return 'recall';
    case 'SELECT':
      return 'selection';
    case 'MAP':
      return 'mapping';
    case 'APPLY':
      return 'application';
    case 'VERIFY':
      return 'verification';
    case 'TRANSFER':
      return 'transfer';
    case 'RETAIN':
      return 'retention';
    default: {
      const exhaustiveCheck: never = activityType;
      throw new Error(`Unhandled activity type: ${String(exhaustiveCheck)}`);
    }
  }
}

function emptyEvidence(): DimensionEvidence {
  return { attempts: 0, correct: 0, recentOutcomes: [] };
}

function emptyDimensions(): Record<CompetencyDimension, DimensionEvidence> {
  const dims = {} as Record<CompetencyDimension, DimensionEvidence>;
  for (const dim of COMPETENCY_DIMENSIONS) dims[dim] = emptyEvidence();
  return dims;
}

export function dimensionStatus(evidence: DimensionEvidence): DimensionStatusLabel {
  if (evidence.attempts < MIN_SAMPLES_FOR_SIGNAL || evidence.recentOutcomes.length === 0) return 'UNKNOWN';
  const acc = evidence.recentOutcomes.filter(Boolean).length / evidence.recentOutcomes.length;
  if (acc >= STRONG_THRESHOLD) return 'STRONG';
  if (acc <= WEAK_THRESHOLD) return 'NEEDS_ATTENTION';
  return 'DEVELOPING';
}

function detectDimensionRegression(evidence: DimensionEvidence): boolean {
  // Needs enough history to compare an "earlier" half against a "recent"
  // half - a single bad attempt is never enough (spec sections 180, 183).
  if (evidence.recentOutcomes.length < 8) return false;
  const mid = Math.floor(evidence.recentOutcomes.length / 2);
  const earlier = evidence.recentOutcomes.slice(0, mid);
  const recent = evidence.recentOutcomes.slice(mid);
  const earlierAcc = earlier.filter(Boolean).length / earlier.length;
  const recentAcc = recent.filter(Boolean).length / recent.length;
  return earlierAcc >= STRONG_THRESHOLD && recentAcc <= WEAK_THRESHOLD;
}

function nextSupport(current: SupportLevel, correct: boolean, streak: number): { level: SupportLevel; streak: number } {
  const idx = SUPPORT_LEVELS.indexOf(current);
  if (correct) {
    const newStreak = streak + 1;
    if (newStreak >= FADE_STREAK) {
      const nextIdx = Math.min(idx + 1, SUPPORT_LEVELS.length - 1);
      return { level: SUPPORT_LEVELS[nextIdx], streak: 0 };
    }
    return { level: current, streak: newStreak };
  }
  const prevIdx = Math.max(idx - 1, 0);
  return { level: SUPPORT_LEVELS[prevIdx], streak: 0 };
}

/**
 * Owns the per-student, per-formula competency state (spec sections 32-33,
 * 160). This is formula-specific evidence, and is explicitly NOT a
 * replacement for the platform's general mastery model (spec sections 34,
 * 77) - it is meant to feed into it, not compete with it.
 */
export class FormulaStudentStateService {
  constructor(private readonly stateRepo: StudentStateRepository) {}

  async getOrCreateState(studentId: string, formulaId: string): Promise<FormulaStudentState> {
    const existing = await this.stateRepo.getState(studentId, formulaId);
    if (existing) return existing;
    const fresh: FormulaStudentState = {
      studentId,
      formulaId,
      dimensions: emptyDimensions(),
      supportLevel: 'FORMULA_SHOWN',
      independentStreak: 0,
      regressionFlag: false,
    };
    await this.stateRepo.saveState(fresh);
    return fresh;
  }

  /**
   * Folds one attempt's outcome into the student's formula state. Does NOT
   * persist the attempt itself - that is the caller's job via
   * TrainingAttemptRepository, since the raw attempt log is also needed for
   * confusion-pattern analysis and historical reporting independent of the
   * rolled-up state (spec section 183: never mark a weakness fixed from a
   * single attempt - the attempt log is what makes that auditable).
   */
  async applyAttempt(attempt: FormulaTrainingAttempt): Promise<FormulaStudentState> {
    const state = await this.getOrCreateState(attempt.studentId, attempt.formulaId);
    const dimension = dimensionForActivity(attempt.activityType);
    const evidence = state.dimensions[dimension];

    evidence.attempts += 1;
    if (attempt.correct) evidence.correct += 1;
    evidence.recentOutcomes = [...evidence.recentOutcomes, attempt.correct].slice(-ROLLING_WINDOW);
    evidence.lastAttemptAt = attempt.createdAt;

    const next = nextSupport(state.supportLevel, attempt.correct, state.independentStreak);
    state.supportLevel = next.level;
    state.independentStreak = next.streak;

    state.regressionFlag = Object.values(state.dimensions).some(detectDimensionRegression);
    state.lastEvidenceAt = attempt.createdAt;

    await this.stateRepo.saveState(state);
    return state;
  }

  async getProfile(
    studentId: string,
  ): Promise<Array<{ formulaId: string; dimensions: Partial<Record<CompetencyDimension, DimensionStatusLabel>>; regressionFlag: boolean }>> {
    const states = await this.stateRepo.listStatesForStudent(studentId);
    return states.map((state) => {
      const dims: Partial<Record<CompetencyDimension, DimensionStatusLabel>> = {};
      for (const dim of COMPETENCY_DIMENSIONS) {
        const status = dimensionStatus(state.dimensions[dim]);
        // Only show dimensions with sufficient evidence (spec section 118).
        if (status !== 'UNKNOWN') dims[dim] = status;
      }
      return { formulaId: state.formulaId, dimensions: dims, regressionFlag: state.regressionFlag };
    });
  }
}
