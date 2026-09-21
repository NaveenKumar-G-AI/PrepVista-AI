import { QuestionRepository } from '../db/repository.js';
import { ConcurrencyConflictError, NotFoundError, ValidationBlockedError } from '../errors.js';
import { assertPermission } from '../security/rbac.js';
import { Question } from '../types/domain.js';
import { IssueSeverity, LifecycleStatus, QuestionHealth, ReviewDecision, Role } from '../types/enums.js';
import { generateId, now } from '../utils/misc.js';
import { LifecycleService } from './lifecycleService.js';
import { AnalyticsEvent, AnalyticsService, AuditService } from './telemetry.js';

export interface ReviewInput {
  questionId: string;
  reviewerId: string;
  role: Role;
  decision: ReviewDecision;
  reason?: string;
  /** Required to APPROVE while unresolved CRITICAL issues remain — see below. Always logged. */
  overrideReason?: string;
  /** The Question.lifecycleVersion the reviewer last observed — optimistic-concurrency guard
   *  for section 165 ("Two reviewers act simultaneously. Expected: no inconsistent final state."). */
  expectedLifecycleVersion: number;
}

const REVIEW_DECISION_TO_LIFECYCLE: Record<ReviewDecision, LifecycleStatus> = {
  [ReviewDecision.APPROVE]: LifecycleStatus.APPROVED,
  [ReviewDecision.REJECT]: LifecycleStatus.REJECTED,
  [ReviewDecision.SUSPEND]: LifecycleStatus.SUSPENDED,
  [ReviewDecision.RESTORE]: LifecycleStatus.PUBLISHED,
  [ReviewDecision.DEPRECATE]: LifecycleStatus.DEPRECATED,
  [ReviewDecision.RETIRE]: LifecycleStatus.RETIRED,
  [ReviewDecision.REQUEST_REVALIDATION]: LifecycleStatus.REVALIDATION_REQUIRED,
};

export class ReviewService {
  constructor(
    private repo: QuestionRepository,
    private lifecycle: LifecycleService,
    private audit: AuditService,
    private analytics: AnalyticsService,
  ) {}

  reviewQuestion(input: ReviewInput): Question {
    // Section 164: students/trainers cannot approve/suspend/edit.
    assertPermission(input.role, 'REVIEW_QUESTION');

    const question = this.repo.getQuestion(input.questionId);
    if (!question) throw new NotFoundError(`Question ${input.questionId} not found.`);

    if (question.lifecycleVersion !== input.expectedLifecycleVersion) {
      throw new ConcurrencyConflictError(
        `Question ${input.questionId} was changed by someone else (you saw version ` +
          `${input.expectedLifecycleVersion}, current is ${question.lifecycleVersion}). Reload and try again.`,
      );
    }

    const version = this.repo.getCurrentVersion(input.questionId);
    const openCritical = version
      ? this.repo.listIssues(version.id).filter((i) => i.status === 'OPEN' && i.severity === IssueSeverity.CRITICAL)
      : [];

    if (input.decision === ReviewDecision.APPROVE && openCritical.length > 0 && !input.overrideReason) {
      throw new ValidationBlockedError(
        `Cannot approve: ${openCritical.length} unresolved critical issue(s) ` +
          `(${openCritical.map((i) => i.type).join(', ')}). Fix the content and revalidate, or supply an ` +
          'overrideReason to approve anyway — this is logged prominently in the audit trail (section 11/79).',
      );
    }

    const targetStatus = REVIEW_DECISION_TO_LIFECYCLE[input.decision];
    this.lifecycle.transition(question, targetStatus, `reviewer:${input.reviewerId}`, input.reason);

    if (input.decision === ReviewDecision.SUSPEND) question.health = QuestionHealth.SUSPENDED;
    if (input.decision === ReviewDecision.RESTORE) question.health = QuestionHealth.HEALTHY;
    this.repo.saveQuestion(question);

    this.repo.saveReview({
      id: generateId(),
      questionVersionId: version?.id ?? '',
      reviewerId: input.reviewerId,
      decision: input.decision,
      reason: input.reason,
      overrideReason: input.overrideReason,
      createdAt: now(),
    });

    this.audit.record({
      questionId: input.questionId,
      action: `REVIEW_${input.decision}`,
      actor: `reviewer:${input.reviewerId}`,
      reason: input.reason,
      metadata: input.overrideReason
        ? { overrideReason: input.overrideReason, overriddenIssueIds: openCritical.map((i) => i.id) }
        : undefined,
    });

    this.analytics.emit(this.analyticsEventFor(input.decision), { questionId: input.questionId });

    return question;
  }

  private analyticsEventFor(decision: ReviewDecision): AnalyticsEvent {
    switch (decision) {
      case ReviewDecision.APPROVE:
        return 'question_approved';
      case ReviewDecision.REJECT:
        return 'question_rejected';
      case ReviewDecision.SUSPEND:
        return 'question_suspended';
      case ReviewDecision.RESTORE:
        return 'question_restored';
      case ReviewDecision.DEPRECATE:
        return 'question_deprecated';
      case ReviewDecision.RETIRE:
        return 'question_retired';
      case ReviewDecision.REQUEST_REVALIDATION:
        return 'question_revalidated';
    }
  }
}
