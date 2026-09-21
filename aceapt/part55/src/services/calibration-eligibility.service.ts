import type pg from 'pg';
import { calibrationConfig } from '../config/calibration.config.js';
import type { ValidationGate, QualityGate } from '../integrations/types.js';
import type { PassthroughNoveltyAdapter } from '../integrations/feature49-novelty.adapter.js';
import type {
  EligibilityExclusion,
  EligibilityResult,
  EligibleObservation,
} from '../types/difficulty.types.js';

interface RawAttemptRow {
  id: string;
  is_correct: boolean | null;
  response_time_ms: number | null;
  mode: 'UNTIMED' | 'TIMED';
  hints_used: number;
  exposure_number: number;
  is_novel: boolean;
  session_position_pct: string | null;
  respondent_ability_proxy: string | null;
  completed: boolean;
  created_at: Date;
  is_test_account: boolean;
}

/**
 * Answers exactly one question: "is this attempt allowed to influence item
 * calibration?" (§103). Nothing else in the pipeline re-derives eligibility;
 * everything downstream trusts EligibilityResult.eligible completely.
 *
 * Order of checks matters for the exclusion reason reported, but not for
 * correctness — an attempt failing multiple checks is still excluded once.
 */
export class CalibrationEligibilityService {
  constructor(
    private readonly db: pg.PoolClient | pg.Pool,
    private readonly validationGate: ValidationGate,
    private readonly qualityGate: QualityGate,
    private readonly noveltyAdapter: PassthroughNoveltyAdapter
  ) {}

  async getEligibleObservations(
    questionVersionId: string,
    opts: { sinceDays?: number; tenantId?: string } = {}
  ): Promise<EligibilityResult> {
    const isValid = await this.validationGate.isValid(questionVersionId);
    const quality = await this.qualityGate.getQualityVerdict(questionVersionId);

    // §22, §23: an invalid question, or one whose quality policy blocks
    // calibration outright, contributes NO eligible observations at all —
    // we still return the shape so callers can tell "genuinely zero
    // attempts" apart from "blocked by policy" (surfaced differently in the
    // anomaly/status layer).
    if (!isValid || quality.blocksCalibration) {
      return {
        eligible: [],
        excluded: [],
        questionVersionValid: isValid,
        qualityBlocksCalibration: quality.blocksCalibration,
      };
    }

    const params: unknown[] = [questionVersionId];
    let tenantClause = '';
    if (opts.tenantId) {
      params.push(opts.tenantId);
      tenantClause = `AND a.tenant_id = $${params.length}`;
    }
    let sinceClause = '';
    if (opts.sinceDays) {
      params.push(opts.sinceDays);
      sinceClause = `AND a.created_at >= now() - ($${params.length} || ' days')::interval`;
    }

    const { rows } = await this.db.query<RawAttemptRow>(
      `SELECT a.id, a.is_correct, a.response_time_ms, a.mode, a.hints_used,
              a.exposure_number, a.is_novel, a.session_position_pct,
              a.respondent_ability_proxy, a.completed, a.created_at,
              s.is_test_account
       FROM attempts a
       JOIN students s ON s.id = a.student_id
       WHERE a.question_version_id = $1
       ${tenantClause}
       ${sinceClause}
       ORDER BY a.created_at ASC`,
      params
    );

    const eligible: EligibleObservation[] = [];
    const excluded: EligibilityExclusion[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (seen.has(row.id)) {
        excluded.push({ attemptId: row.id, reason: 'DUPLICATE' });
        continue;
      }
      seen.add(row.id);

      if (calibrationConfig.eligibility.excludeTestAccounts && row.is_test_account) {
        excluded.push({ attemptId: row.id, reason: 'TEST_ACCOUNT' });
        continue;
      }
      if (calibrationConfig.eligibility.requireCompletedAttempt && !row.completed) {
        excluded.push({ attemptId: row.id, reason: 'INCOMPLETE' });
        continue;
      }
      if (row.is_correct === null) {
        excluded.push({ attemptId: row.id, reason: 'INCOMPLETE' });
        continue;
      }

      // §105: impossible timing doesn't kill the attempt's contribution to
      // facility, only to *time* statistics — a 0ms or multi-hour duration
      // on a 30-second question is still informative about correctness.
      const rt = row.response_time_ms;
      const timeIsReliable =
        rt !== null &&
        rt >= calibrationConfig.eligibility.minAttemptDurationMs &&
        rt <= calibrationConfig.eligibility.maxPlausibleDurationMs;

      const { isNovel, exposureNumber } = this.noveltyAdapter.classifyExposure({
        isNovelRaw: row.is_novel,
        exposureNumberRaw: row.exposure_number,
      });

      eligible.push({
        attemptId: row.id,
        isCorrect: row.is_correct,
        responseTimeMs: rt,
        timeIsReliable,
        mode: row.mode,
        hintsUsed: row.hints_used,
        isNovel,
        exposureNumber,
        sessionPositionPct: row.session_position_pct === null ? null : Number(row.session_position_pct),
        abilityProxy:
          row.respondent_ability_proxy === null ? null : Number(row.respondent_ability_proxy),
        createdAt: row.created_at,
      });
    }

    return { eligible, excluded, questionVersionValid: isValid, qualityBlocksCalibration: false };
  }
}
