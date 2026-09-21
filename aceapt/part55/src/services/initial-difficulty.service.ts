import type pg from 'pg';
import { calibrationConfig, facilityToCategory, labelToCategory } from '../config/calibration.config.js';
import { clamp01, contentHash } from '../lib/stats.js';
import type { InitialDifficultyAiAdapter } from '../ai/initial-difficulty-ai.adapter.js';
import type { DifficultyCategory } from '../types/difficulty.types.js';

interface QuestionVersionRow {
  id: string;
  content_hash: string;
  content_preview: string | null;
  reading_length: number | null;
  number_of_steps: number | null;
  number_of_variables: number | null;
  number_of_constraints: number | null;
  concept_dependencies: number | null;
  initial_difficulty_label: string | null;
  purpose: string;
  skill_name: string | null;
}

export interface InitialEstimateResult {
  structuralScore: number;
  aiScore: number | null;
  aiRationale: string | null;
  aiSource: 'anthropic' | 'fallback_template' | null;
  authorLabel: string | null;
  combinedEstimate: number;
  combinedCategory: DifficultyCategory | null;
  contentHash: string;
}

/**
 * §11-12, §29-32, §92-93: builds the PRE-EVIDENCE hypothesis a brand-new
 * question version starts from. Never itself "empirical truth" — the whole
 * point of the rest of the engine is to potentially override this once real
 * attempts exist (§32 label-mismatch, §95 empirical update).
 */
export class InitialDifficultyService {
  constructor(
    private readonly db: pg.PoolClient | pg.Pool,
    private readonly aiAdapter: InitialDifficultyAiAdapter,
    private readonly useAi: boolean = true
  ) {}

  computeStructuralScore(qv: {
    reading_length: number | null;
    number_of_steps: number | null;
    number_of_variables: number | null;
    number_of_constraints: number | null;
    concept_dependencies: number | null;
  }): number {
    const { weights, normalizationCeilings } = calibrationConfig.structural;
    const norm = (value: number | null, ceiling: number) =>
      value === null ? 0 : clamp01(value / ceiling);

    const score =
      weights.numberOfSteps * norm(qv.number_of_steps, normalizationCeilings.numberOfSteps) +
      weights.numberOfVariables * norm(qv.number_of_variables, normalizationCeilings.numberOfVariables) +
      weights.numberOfConstraints * norm(qv.number_of_constraints, normalizationCeilings.numberOfConstraints) +
      weights.conceptDependencies * norm(qv.concept_dependencies, normalizationCeilings.conceptDependencies) +
      weights.readingLength * norm(qv.reading_length, normalizationCeilings.readingLength);

    return clamp01(score);
  }

  async computeAndStore(tenantId: string, questionVersionId: string): Promise<InitialEstimateResult> {
    const { rows } = await this.db.query<QuestionVersionRow>(
      `SELECT qv.id, qv.content_hash, qv.content_preview, qv.reading_length,
              qv.number_of_steps, qv.number_of_variables, qv.number_of_constraints,
              qv.concept_dependencies, qv.initial_difficulty_label,
              q.purpose, s.name AS skill_name
       FROM question_versions qv
       JOIN questions q ON q.id = qv.question_id
       LEFT JOIN skills s ON s.id = q.skill_id
       WHERE qv.id = $1 AND qv.tenant_id = $2`,
      [questionVersionId, tenantId]
    );
    const qv = rows[0];
    if (!qv) throw new Error(`Question version ${questionVersionId} not found for tenant ${tenantId}`);

    const structuralScore = this.computeStructuralScore(qv);

    let aiScore: number | null = null;
    let aiRationale: string | null = null;
    let aiSource: InitialEstimateResult['aiSource'] = null;
    if (this.useAi) {
      const ai = await this.aiAdapter.estimate({
        questionText: qv.content_preview ?? `[No stored question text — structural metadata only: ${qv.number_of_steps ?? 0} steps, ${qv.number_of_variables ?? 0} variables, ${qv.number_of_constraints ?? 0} constraints]`,
        skillName: qv.skill_name,
        purpose: qv.purpose,
        structuralScore,
      });
      aiScore = ai.score;
      aiRationale = ai.rationale;
      aiSource = ai.source;
    }

    const authorCategory = labelToCategory(qv.initial_difficulty_label);
    // Blend: structural + AI (when we actually got a live AI opinion) each
    // count, author label only informs the CATEGORY (it's categorical, not
    // a 0-1 score) rather than the blended number. If AI merely echoed the
    // structural fallback, don't double-count it.
    const combinedEstimate =
      aiScore !== null && aiSource === 'anthropic' ? (structuralScore + aiScore) / 2 : structuralScore;

    const combinedCategory = authorCategory ?? facilityToCategory(1 - combinedEstimate);

    await this.db.query(
      `INSERT INTO difficulty_initial_estimates
        (tenant_id, question_version_id, structural_score, ai_score, ai_rationale,
         ai_source, author_label, combined_estimate, combined_category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId,
        questionVersionId,
        structuralScore,
        aiScore,
        aiRationale,
        aiSource,
        qv.initial_difficulty_label,
        combinedEstimate,
        combinedCategory,
      ]
    );

    return {
      structuralScore,
      aiScore,
      aiRationale,
      aiSource,
      authorLabel: qv.initial_difficulty_label,
      combinedEstimate,
      combinedCategory,
      contentHash: qv.content_hash,
    };
  }
}
