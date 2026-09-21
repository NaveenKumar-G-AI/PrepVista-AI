import { QuestionRepository } from '../db/repository.js';
import { NotFoundError } from '../errors.js';
import { Question, QuestionVersion } from '../types/domain.js';
import { LifecycleStatus, ProductionMode, QuestionHealth, TrustLevel } from '../types/enums.js';
import { LifecycleService } from './lifecycleService.js';
import { AnalyticsService, AuditService } from './telemetry.js';

/**
 * Section 125: "Only publish quality-eligible content." This is the single choke point every
 * downstream "Feature 42-52"-style consumer should call through — isEligibleForMode /
 * getEligiblePool — rather than reading Question.lifecycleStatus directly, so the eligibility
 * policy only has to be correct in one place.
 */
export class PublicationService {
  constructor(
    private repo: QuestionRepository,
    private lifecycle: LifecycleService,
    private audit: AuditService,
    private analytics: AnalyticsService,
  ) {}

  publish(questionId: string, actor: string): Question {
    const question = this.mustGetQuestion(questionId);
    this.lifecycle.transition(question, LifecycleStatus.PUBLISHED, actor, 'Publishing approved, quality-eligible content.');
    question.trustLevel = TrustLevel.APPROVED;
    question.health = QuestionHealth.HEALTHY;
    this.repo.saveQuestion(question);
    this.audit.record({ questionId, action: 'QUESTION_PUBLISHED', actor });
    this.analytics.emit('question_published', { questionId });
    return question;
  }

  /** Section 55: "When a serious issue is discovered: move PUBLISHED -> SUSPENDED. Prevent
   *  further use in affected modes." Never deletes QuestionVersion/QuestionReport/AuditEvent
   *  rows — section 56: "Do not erase historical attempt records." */
  async suspend(questionId: string, reason: string, actor: string): Promise<Question> {
    const question = this.mustGetQuestion(questionId);
    this.lifecycle.transition(question, LifecycleStatus.SUSPENDED, actor, reason);
    question.health = QuestionHealth.SUSPENDED;
    this.repo.saveQuestion(question);
    this.audit.record({ questionId, action: 'QUESTION_SUSPENDED', actor, reason });
    this.analytics.emit('question_suspended', { questionId, reason });
    return question;
  }

  restore(questionId: string, actor: string, reason?: string): Question {
    const question = this.mustGetQuestion(questionId);
    this.lifecycle.transition(question, LifecycleStatus.PUBLISHED, actor, reason ?? 'Restored after resolution.');
    question.health = QuestionHealth.HEALTHY;
    this.repo.saveQuestion(question);
    this.audit.record({ questionId, action: 'QUESTION_RESTORED', actor, reason });
    this.analytics.emit('question_restored', { questionId });
    return question;
  }

  /**
   * Section 44/60/70: purpose-aware, mode-aware eligibility. TIMED_CHALLENGE and ASSESSMENT
   * demand full HEALTHY status and at least an auto-validated trust level; PRACTICE/DIAGNOSTIC
   * tolerate WATCH-health content that's still under observation but not yet flagged anomalous.
   */
  isEligibleForMode(questionId: string, mode: ProductionMode): boolean {
    const question = this.repo.getQuestion(questionId);
    if (!question) return false;
    if (question.health === QuestionHealth.SUSPENDED || question.health === QuestionHealth.RETIRED) return false;
    if (![LifecycleStatus.APPROVED, LifecycleStatus.PUBLISHED].includes(question.lifecycleStatus)) return false;

    switch (mode) {
      case ProductionMode.TIMED_CHALLENGE:
      case ProductionMode.ASSESSMENT:
        return question.health === QuestionHealth.HEALTHY && question.trustLevel !== TrustLevel.UNVERIFIED;
      case ProductionMode.DIAGNOSTIC:
      case ProductionMode.PRACTICE:
      default:
        return question.health !== QuestionHealth.ANOMALOUS;
    }
  }

  getEligiblePool(filter?: { tenantId?: string; skill?: string; mode?: ProductionMode }): QuestionVersion[] {
    const mode = filter?.mode ?? ProductionMode.PRACTICE;
    return this.repo
      .listQuestions({ tenantId: filter?.tenantId, includeGlobal: true })
      .filter((q) => this.isEligibleForMode(q.id, mode))
      .map((q) => this.repo.getCurrentVersion(q.id))
      .filter((v): v is QuestionVersion => Boolean(v))
      .filter((v) => !filter?.skill || v.skillMapping?.primarySkill === filter.skill);
  }

  /**
   * Section 57-59/70: the integration seam other systems (accuracy, speed, mastery, readiness)
   * should call before folding a question's results into an aggregate. A suspended/retired
   * question never disappears from history — this only tells the caller not to trust its
   * evidence going forward.
   */
  shouldExcludeFromAggregate(questionId: string, _metric: 'ACCURACY' | 'SPEED' | 'MASTERY' | 'READINESS'): boolean {
    const question = this.repo.getQuestion(questionId);
    if (!question) return true;
    return (
      question.health === QuestionHealth.SUSPENDED ||
      question.health === QuestionHealth.RETIRED ||
      [LifecycleStatus.SUSPENDED, LifecycleStatus.RETIRED, LifecycleStatus.REJECTED].includes(question.lifecycleStatus)
    );
  }

  private mustGetQuestion(id: string): Question {
    const q = this.repo.getQuestion(id);
    if (!q) throw new NotFoundError(`Question ${id} not found.`);
    return q;
  }
}
