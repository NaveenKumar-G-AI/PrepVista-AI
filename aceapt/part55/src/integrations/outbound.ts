import type {
  AccuracyTrainingPort,
  AdaptiveSelectionPort,
  DifficultySelectionView,
  ExpectedTimeView,
  SpeedTrainingPort,
  TimedChallengePort,
  TimedChallengeProfile,
} from './types.js';
import type { DifficultyCalibrationService } from '../services/difficulty-calibration.service.js';
import type { ExpectedTimeService } from '../services/expected-time.service.js';

/**
 * Feature 55 IS the implementation of these four outbound ports — there is
 * nothing to mock, because Feature 55 is the provider, not the consumer.
 * These classes exist so Features 43/50/51/52 (or their own reference
 * implementations, if built the same way this one was) have a single
 * narrow, typed surface to import instead of reaching into Feature 55's
 * internals. Each method also enforces the read-side tenant boundary via
 * DifficultyCalibrationService, which already runs every read through
 * withTenant.
 */

interface SnapshotRowForSelection {
  question_version_id: string;
  category: 'EASY' | 'MEDIUM' | 'HARD' | null;
  estimate: string | number | null;
  status: 'PROVISIONAL' | 'CALIBRATED' | 'STALE' | 'NEEDS_REVIEW';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  sample_size: number;
  facility: string | number | null;
}

function toSelectionView(
  snapshot: SnapshotRowForSelection | null,
  tenantIsValid: boolean
): DifficultySelectionView {
  if (!snapshot) {
    return {
      questionVersionId: '',
      category: null,
      estimate: null,
      status: 'PROVISIONAL',
      confidence: 'LOW',
      eligibleForAdaptiveUse: false,
    };
  }
  return {
    questionVersionId: snapshot.question_version_id,
    category: snapshot.category,
    estimate: snapshot.estimate === null ? null : Number(snapshot.estimate),
    status: snapshot.status,
    confidence: snapshot.confidence,
    // §39: Feature 55 does not silently decide adaptive-selection eligibility
    // for Feature 43 — it surfaces status/confidence and lets Feature 43
    // apply its own selection-bias judgment. "Eligible" here only means
    // "not STALE and not built from zero evidence," nothing stronger.
    eligibleForAdaptiveUse: tenantIsValid && snapshot.status !== 'STALE' && snapshot.sample_size >= 0,
  };
}

export class Feature43AdaptiveSelectionAdapter implements AdaptiveSelectionPort {
  constructor(
    private readonly calibrationService: DifficultyCalibrationService,
    private readonly tenantId: string
  ) {}

  /** In the real monorepo, Feature 43 would resolve tenantId from its own
   * request context and this class could be constructed once per request.
   * This reference implementation takes it in the constructor instead of
   * threading it through every method, since nothing else here has a real
   * per-request scope to hook into. */
  async getDifficultyForSelection(
    questionVersionId: string,
    populationId = 'default'
  ): Promise<DifficultySelectionView> {
    const snapshot = await this.calibrationService.getQuestionDifficulty(
      this.tenantId,
      questionVersionId,
      populationId,
      'OVERALL'
    );
    return toSelectionView(snapshot, true);
  }
}

/** Function form of the same ports, used directly by the API layer and
 * tests where tenantId is naturally already in scope per-call. */
export function makeOutboundPorts(
  calibrationService: DifficultyCalibrationService,
  expectedTimeService: (tenantId: string) => ExpectedTimeService
) {
  return {
    forFeature43: {
      async getDifficultyForSelection(
        tenantId: string,
        questionVersionId: string,
        populationId = 'default'
      ): Promise<DifficultySelectionView> {
        const snapshot = await calibrationService.getQuestionDifficulty(
          tenantId,
          questionVersionId,
          populationId,
          'OVERALL'
        );
        return toSelectionView(snapshot, true);
      },
    },
    forFeature50: {
      async getExpectedTime(
        tenantId: string,
        questionVersionId: string,
        mode: 'UNTIMED' | 'TIMED' | 'OVERALL' = 'OVERALL'
      ): Promise<ExpectedTimeView> {
        return expectedTimeService(tenantId).getExpectedTime(questionVersionId, mode);
      },
    },
    forFeature51: {
      async getDifficultyContext(
        tenantId: string,
        questionVersionId: string
      ): Promise<DifficultySelectionView> {
        const snapshot = await calibrationService.getQuestionDifficulty(tenantId, questionVersionId);
        return toSelectionView(snapshot, true);
      },
    },
    forFeature52: {
      async getTimedChallengeProfile(
        tenantId: string,
        questionVersionId: string
      ): Promise<TimedChallengeProfile> {
        const [overall, timedSnapshot, untimedSnapshot, expectedTime] = await Promise.all([
          calibrationService.getQuestionDifficulty(tenantId, questionVersionId, 'default', 'OVERALL'),
          calibrationService.getQuestionDifficulty(tenantId, questionVersionId, 'default', 'TIMED'),
          calibrationService.getQuestionDifficulty(tenantId, questionVersionId, 'default', 'UNTIMED'),
          expectedTimeService(tenantId).getExpectedTime(questionVersionId, 'OVERALL'),
        ]);
        const timedFacility = timedSnapshot ? Number(timedSnapshot.facility) : null;
        const untimedFacility = untimedSnapshot ? Number(untimedSnapshot.facility) : null;
        const timePressureSensitive =
          timedFacility !== null && untimedFacility !== null
            ? untimedFacility - timedFacility >= 0.15
            : false;
        return {
          difficulty: toSelectionView(overall, true),
          expectedTime,
          timePressureSensitive,
        };
      },
    },
  };
}
