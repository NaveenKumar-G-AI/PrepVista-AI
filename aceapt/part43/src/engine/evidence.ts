import { ENGINE_CONSTANTS as C } from './constants';
import { CapabilityLabel, EvidenceConfidence, Question, ResponseRecord, SkillId } from '../domain/types';
import { SkillEvidence } from '../domain/state';

// ---------------------------------------------------------------------------
// Capability model
//
// This is a simplified Rasch-derived (1-parameter IRT) online ability
// update, NOT a full Bayesian posterior or 3-parameter IRT model. It was
// chosen deliberately: the spec (section 99) explicitly warns against
// implementing complex statistical machinery "because it sounds impressive"
// without validating it first, while section 16-17 requires a genuine,
// explainable notion of information value. A 1PL/Rasch-style update gives
// us both a defensible probability-of-success model AND a closed-form
// "information value" (Fisher information - see informationValue.ts) with a
// handful of interpretable parameters, all documented in constants.ts.
//
// Upgrade path (spec P2, section 99): if you later want full 2PL/3PL IRT or
// a proper Bayesian posterior (e.g. a Beta-Binomial or particle filter per
// skill), this module is the only place that needs to change - everything
// else in the engine consumes `estimate` and `uncertainty` as opaque
// numbers plus the derived labels below.
// ---------------------------------------------------------------------------

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function predictedProbability(ability: number, difficulty: number): number {
  return logistic(ability - difficulty);
}

export interface CapabilityUpdateInput {
  priorAbility: number;
  priorUncertainty: number;
  difficulty: number;
  isCorrect: boolean;
  recentSurprises: number[];
}

export interface CapabilityUpdateResult {
  ability: number;
  uncertainty: number;
  surprise: number;
  isUnstable: boolean;
  updatedSurpriseWindow: number[];
}

export function updateCapability(input: CapabilityUpdateInput): CapabilityUpdateResult {
  const { priorAbility, priorUncertainty, difficulty, isCorrect, recentSurprises } = input;
  const predicted = predictedProbability(priorAbility, difficulty);
  const actual = isCorrect ? 1 : 0;
  const surprise = actual - predicted;

  // Learning rate shrinks as uncertainty shrinks: early responses move the
  // estimate a lot, later (more evidenced) responses move it a little.
  const learningRate = C.BASE_LEARNING_RATE * priorUncertainty;
  const ability = priorAbility + learningRate * surprise;

  const updatedSurpriseWindow = [...recentSurprises, surprise].slice(-C.UNSTABLE_WINDOW);
  const isUnstable =
    updatedSurpriseWindow.length >= 2 && variance(updatedSurpriseWindow) > C.UNSTABLE_SURPRISE_VARIANCE_THRESHOLD;

  // Uncertainty normally decays with evidence, but when evidence is unstable
  // we should trust the point estimate LESS, not more - so we let it widen
  // back out rather than keep shrinking.
  let uncertainty = priorUncertainty * C.UNCERTAINTY_DECAY;
  if (isUnstable) {
    uncertainty = Math.min(C.INITIAL_UNCERTAINTY, uncertainty / C.UNCERTAINTY_DECAY);
  }
  uncertainty = Math.max(C.MIN_UNCERTAINTY, uncertainty);

  return { ability, uncertainty, surprise, isUnstable, updatedSurpriseWindow };
}

function variance(nums: number[]): number {
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
}

export function deriveCapabilityLabel(evidenceCount: number, ability: number): CapabilityLabel {
  if (evidenceCount === 0) return 'unknown'; // never "weak" from absence of evidence (spec section 11)
  const t = C.CAPABILITY_THRESHOLDS;
  if (ability < t.emergingMax) return 'emerging';
  if (ability < t.developingMax) return 'developing';
  if (ability < t.proficientMax) return 'proficient';
  return 'advanced';
}

export function deriveConfidenceLabel(
  evidenceCount: number,
  uncertainty: number,
  isUnstable: boolean
): EvidenceConfidence {
  if (isUnstable) return 'low';
  if (evidenceCount >= C.HIGH_CONFIDENCE_MIN_EVIDENCE && uncertainty <= C.HIGH_CONFIDENCE_MAX_UNCERTAINTY) return 'high';
  if (evidenceCount >= C.MODERATE_CONFIDENCE_MIN_EVIDENCE && uncertainty <= C.MODERATE_CONFIDENCE_MAX_UNCERTAINTY) {
    return 'moderate';
  }
  return 'low';
}

function estimateFromHistoricalLabel(label: CapabilityLabel): number {
  switch (label) {
    case 'emerging':
      return -1.5;
    case 'developing':
      return -0.5;
    case 'proficient':
      return 0.6;
    case 'advanced':
      return 1.6;
    default:
      return C.INITIAL_ABILITY;
  }
}

// ---------------------------------------------------------------------------
// Response-time classification (spec sections 24-28, 56)
// ---------------------------------------------------------------------------

const DEFAULT_EXPECTED_MS_BY_BAND: Record<Question['difficultyBand'], number> = {
  foundation: 30000,
  easy: 45000,
  medium: 60000,
  hard: 90000,
  advanced: 120000,
};

export interface SpeedClassification {
  relative: number;
  status: 'fast' | 'moderate' | 'slow';
}

export function classifyRelativeSpeed(responseTimeMs: number, question: Question): SpeedClassification {
  const expected = question.expectedResponseTimeMs ?? DEFAULT_EXPECTED_MS_BY_BAND[question.difficultyBand];
  const relative = responseTimeMs / expected;
  const status = relative < C.SPEED_FAST_THRESHOLD ? 'fast' : relative > C.SPEED_SLOW_THRESHOLD ? 'slow' : 'moderate';
  return { relative, status };
}

// ---------------------------------------------------------------------------
// Skill evidence lifecycle
// ---------------------------------------------------------------------------

export function createInitialSkillEvidence(
  skillId: SkillId,
  historical?: { label: CapabilityLabel }
): SkillEvidence {
  const initialEstimate = historical ? estimateFromHistoricalLabel(historical.label) : C.INITIAL_ABILITY;
  const now = new Date(0).toISOString();
  return {
    skillId,
    estimate: initialEstimate,
    // Even with history, CURRENT evidence starts wide-open - past performance
    // informs the prior but must not lock the student in (spec sections 41-43).
    uncertainty: C.INITIAL_UNCERTAINTY,
    surpriseWindow: [],
    evidenceCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isUnstable: false,
    capabilityLabel: historical?.label ?? 'unknown',
    confidenceLabel: 'low',
    upperBoundaryDifficulty: initialEstimate,
    recentCorrectStreakAtOrAboveBoundary: 0,
    transferEvidenceCount: 0,
    transferCorrectCount: 0,
    potentialTransferGap: false,
    speedStatus: 'unknown',
    relativeResponseTimeEma: 1,
    speedCheckDone: false,
    needsSpeedCheck: false,
    fastWrongStreak: 0,
    needsRushInvestigation: false,
    highConfidenceWrongStreak: 0,
    lowConfidenceCorrectStreak: 0,
    calibrationFlag: 'none',
    initializedFromHistory: !!historical,
    historicalLabel: historical?.label,
    history: [],
    lastUpdatedAt: now,
  };
}

export function applyResponse(evidence: SkillEvidence, response: ResponseRecord, question: Question): SkillEvidence {
  const update = updateCapability({
    priorAbility: evidence.estimate,
    priorUncertainty: evidence.uncertainty,
    difficulty: question.difficultyRating,
    isCorrect: response.isCorrect,
    recentSurprises: evidence.surpriseWindow,
  });

  const evidenceCount = evidence.evidenceCount + 1;
  const correctCount = evidence.correctCount + (response.isCorrect ? 1 : 0);
  const incorrectCount = evidence.incorrectCount + (response.isCorrect ? 0 : 1);

  const speed = classifyRelativeSpeed(response.responseTimeMs, question);
  const relativeResponseTimeEma =
    evidence.evidenceCount === 0 ? speed.relative : evidence.relativeResponseTimeEma * 0.7 + speed.relative * 0.3;

  // --- difficulty boundary / challenge streak (spec sections 14, 18-20) ---
  let upperBoundaryDifficulty = evidence.upperBoundaryDifficulty;
  let recentCorrectStreakAtOrAboveBoundary = evidence.recentCorrectStreakAtOrAboveBoundary;
  if (response.isCorrect) {
    if (question.difficultyRating >= upperBoundaryDifficulty - 0.05) {
      recentCorrectStreakAtOrAboveBoundary += 1;
      upperBoundaryDifficulty = Math.max(upperBoundaryDifficulty, question.difficultyRating);
    } else {
      recentCorrectStreakAtOrAboveBoundary = 1;
    }
  } else {
    recentCorrectStreakAtOrAboveBoundary = 0;
  }

  // --- slow + correct: fluency unconfirmed, needs exactly one controlled-timing check (spec section 27) ---
  let needsSpeedCheck = evidence.needsSpeedCheck;
  let speedCheckDone = evidence.speedCheckDone;
  if (response.isCorrect && speed.status === 'slow' && !speedCheckDone) {
    needsSpeedCheck = true;
  } else if (!speedCheckDone && evidence.needsSpeedCheck) {
    // This response IS the dedicated check, regardless of its own speed.
    speedCheckDone = true;
    needsSpeedCheck = false;
  }

  // --- fast + wrong: track a streak rather than concluding immediately (spec section 26) ---
  const fastWrongStreak = !response.isCorrect && speed.status === 'fast' ? evidence.fastWrongStreak + 1 : 0;
  const needsRushInvestigation = fastWrongStreak >= 2;

  // --- confidence calibration (spec section 29) ---
  let highConfidenceWrongStreak = evidence.highConfidenceWrongStreak;
  let lowConfidenceCorrectStreak = evidence.lowConfidenceCorrectStreak;
  if (response.confidence?.level === 'high' && !response.isCorrect) {
    highConfidenceWrongStreak += 1;
  } else if (response.confidence && response.confidence.level !== 'high') {
    highConfidenceWrongStreak = 0;
  }
  if (response.confidence?.level === 'low' && response.isCorrect) {
    lowConfidenceCorrectStreak += 1;
  } else if (response.confidence && response.confidence.level !== 'low') {
    lowConfidenceCorrectStreak = 0;
  }
  const calibrationFlag: SkillEvidence['calibrationFlag'] =
    highConfidenceWrongStreak >= 2 ? 'overconfidence' : lowConfidenceCorrectStreak >= 2 ? 'underconfidence' : 'none';

  // --- transfer tracking (spec sections 15, 58, 79) ---
  let transferEvidenceCount = evidence.transferEvidenceCount;
  let transferCorrectCount = evidence.transferCorrectCount;
  if (question.isTransferVariant) {
    transferEvidenceCount += 1;
    transferCorrectCount += response.isCorrect ? 1 : 0;
  }
  const familiarEvidenceCount = evidenceCount - transferEvidenceCount;
  const familiarCorrectCount = correctCount - transferCorrectCount;
  const familiarAccuracy = familiarEvidenceCount > 0 ? familiarCorrectCount / familiarEvidenceCount : 0;
  const transferAccuracy = transferEvidenceCount > 0 ? transferCorrectCount / transferEvidenceCount : null;
  const potentialTransferGap =
    transferAccuracy !== null && familiarEvidenceCount > 0 && familiarAccuracy - transferAccuracy >= C.TRANSFER_GAP_THRESHOLD;

  const capabilityLabel = deriveCapabilityLabel(evidenceCount, update.ability);
  const confidenceLabel = deriveConfidenceLabel(evidenceCount, update.uncertainty, update.isUnstable);

  return {
    ...evidence,
    estimate: update.ability,
    uncertainty: update.uncertainty,
    surpriseWindow: update.updatedSurpriseWindow,
    isUnstable: update.isUnstable,
    evidenceCount,
    correctCount,
    incorrectCount,
    capabilityLabel,
    confidenceLabel,
    upperBoundaryDifficulty,
    recentCorrectStreakAtOrAboveBoundary,
    speedStatus: speed.status,
    relativeResponseTimeEma,
    speedCheckDone,
    needsSpeedCheck,
    fastWrongStreak,
    needsRushInvestigation,
    highConfidenceWrongStreak,
    lowConfidenceCorrectStreak,
    calibrationFlag,
    transferEvidenceCount,
    transferCorrectCount,
    potentialTransferGap,
    history: [...evidence.history, response],
    lastUpdatedAt: response.answeredAt,
  };
}
