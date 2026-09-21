import { QuestionRepository } from '../db/repository.js';
import { NotFoundError } from '../errors.js';
import { SemanticSimilarityPort } from '../validators/similarityValidator.js';
import { SkillGraphPort } from '../validators/skillAlignmentValidator.js';
import { determineQualityStatus, runValidationPipeline } from '../validators/pipeline.js';
import { generateId, now } from '../utils/misc.js';
import { NewQuestionInput, Question, QuestionVersion, Issue } from '../types/domain.js';
import {
  IssueSeverity,
  IssueType,
  LifecycleStatus,
  QualityStatus,
  QuestionHealth,
  QuestionPurpose,
  TrustLevel,
} from '../types/enums.js';
import { AnalyticsService, AuditService } from './telemetry.js';
import { LifecycleService } from './lifecycleService.js';

export interface QualityPorts {
  skillGraph?: SkillGraphPort;
  semanticSimilarity?: SemanticSimilarityPort;
  useAI?: boolean;
}

const HIGH_STAKES_PURPOSES = new Set([QuestionPurpose.ASSESSMENT, QuestionPurpose.MASTERY]);

/**
 * Section 44 — purpose-aware quality: "A practice question may tolerate exploratory variation.
 * A formal assessment question requires stronger review." Only low-stakes purposes (PRACTICE,
 * LEARNING, DIAGNOSTIC, GUIDED, TRANSFER, TIMED) can be auto-approved by the system; ASSESSMENT
 * and MASTERY items always land on a human's desk regardless of how clean the pipeline result is.
 * Section 11: BLOCKED never becomes an automatic REJECTED — a human decides that (see
 * ReviewService), the system only ever routes it to NEEDS_REVIEW.
 */
function decideLifecycleAfterValidation(status: QualityStatus, purpose: QuestionPurpose): LifecycleStatus {
  const highStakes = HIGH_STAKES_PURPOSES.has(purpose);
  switch (status) {
    case QualityStatus.BLOCKED:
    case QualityStatus.NEEDS_REVIEW:
      return LifecycleStatus.NEEDS_REVIEW;
    case QualityStatus.PASS_WITH_WARNING:
    case QualityStatus.PASS:
      return highStakes ? LifecycleStatus.NEEDS_REVIEW : LifecycleStatus.APPROVED;
    default:
      return LifecycleStatus.NEEDS_REVIEW;
  }
}

export class QuestionQualityService {
  constructor(
    private repo: QuestionRepository,
    private lifecycle: LifecycleService,
    private audit: AuditService,
    private analytics: AnalyticsService,
    private ports: QualityPorts = {},
  ) {}

  async createAndValidate(
    input: NewQuestionInput,
    actor = 'system:author',
  ): Promise<{ question: Question; version: QuestionVersion; issues: Issue[]; status: QualityStatus }> {
    const question: Question = {
      id: generateId(),
      tenantId: input.tenantId,
      isGlobal: input.isGlobal ?? false,
      lifecycleStatus: LifecycleStatus.DRAFT,
      trustLevel: TrustLevel.UNVERIFIED,
      health: QuestionHealth.HEALTHY,
      lifecycleVersion: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    const version: QuestionVersion = {
      ...input,
      id: generateId(),
      questionId: question.id,
      versionNumber: 1,
      createdAt: now(),
      createdBy: actor,
    };
    question.currentVersionId = version.id;

    this.repo.saveQuestion(question);
    this.repo.saveVersion(version);
    this.audit.record({ questionId: question.id, action: 'QUESTION_CREATED', actor });
    this.analytics.emit('question_created', { questionId: question.id });

    const result = await this.validateQuestion(version.id);
    return { question: this.repo.getQuestion(question.id)!, version, ...result };
  }

  async validateQuestion(versionId: string): Promise<{ issues: Issue[]; status: QualityStatus }> {
    const version = this.repo.getVersion(versionId);
    if (!version) throw new NotFoundError(`Question version ${versionId} not found.`);
    const question = this.repo.getQuestion(version.questionId);
    if (!question) throw new NotFoundError(`Question ${version.questionId} not found.`);

    this.lifecycle.moveToValidating(question, 'system:quality-engine');
    this.repo.saveQuestion(question);
    this.analytics.emit('question_validation_started', { questionId: question.id, versionId });

    const pool = this.repo.listPool({ skill: version.skillMapping?.primarySkill, excludeQuestionId: question.id });
    const historicalStats = this.repo.getHistoricalStats(question.id);

    let issues: Issue[];
    try {
      const result = await runValidationPipeline(version, {
        pool,
        historicalStats,
        skillGraphPort: this.ports.skillGraph,
        semanticSimilarityPort: this.ports.semanticSimilarity,
        useAI: this.ports.useAI,
      });
      issues = result.issues.map((i) => ({ ...i, questionVersionId: version.id }));
      for (const record of result.validations) {
        this.repo.saveValidation({ ...record, questionVersionId: version.id });
      }
    } catch (err) {
      // Section 136: "If a validator fails: do not automatically approve." A pipeline-level
      // crash becomes a MEDIUM VALIDATION_UNAVAILABLE issue, which forces NEEDS_REVIEW below —
      // it can never silently fall through to APPROVED.
      this.analytics.emit('question_validation_failed', { questionId: question.id, error: String(err) });
      issues = [
        {
          id: generateId(),
          questionVersionId: version.id,
          type: IssueType.VALIDATION_UNAVAILABLE,
          severity: IssueSeverity.MEDIUM,
          message: `Validation pipeline threw an error: ${err instanceof Error ? err.message : String(err)}`,
          status: 'OPEN',
          createdAt: now(),
        },
      ];
    }

    for (const issue of issues) {
      this.repo.saveIssue(issue);
      this.analytics.emit('question_issue_detected', { questionId: question.id, type: issue.type, severity: issue.severity });
    }

    const status = determineQualityStatus(issues);
    const targetLifecycle = decideLifecycleAfterValidation(status, version.purpose ?? QuestionPurpose.PRACTICE);
    this.lifecycle.transition(question, targetLifecycle, 'system:quality-engine', `Quality status: ${status}`);
    if (targetLifecycle === LifecycleStatus.APPROVED) {
      question.trustLevel = TrustLevel.AUTO_VALIDATED;
    }
    this.repo.saveQuestion(question);

    this.analytics.emit('question_validation_completed', { questionId: question.id, status });
    if (targetLifecycle === LifecycleStatus.APPROVED) {
      this.analytics.emit('question_approved', { questionId: question.id, actor: 'system:quality-engine' });
    }

    return { issues, status };
  }

  /** Section 75 scorecard — full dimension-by-dimension results, never one opaque number. */
  getScorecard(versionId: string) {
    const validations = this.repo.listValidations(versionId);
    const issues = this.repo.listIssues(versionId);
    return {
      validations,
      issues,
      status: determineQualityStatus(issues),
    };
  }
}
