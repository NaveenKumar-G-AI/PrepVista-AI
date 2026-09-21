import { IllegalTransitionError } from '../errors.js';
import { Question } from '../types/domain.js';
import { LifecycleStatus } from '../types/enums.js';

const {
  DRAFT,
  PROCESSING,
  VALIDATING,
  NEEDS_REVIEW,
  APPROVED,
  PUBLISHED,
  SUSPENDED,
  DEPRECATED,
  RETIRED,
  REVALIDATION_REQUIRED,
  REJECTED,
} = LifecycleStatus;

const ALLOWED_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  [DRAFT]: [PROCESSING, VALIDATING],
  [PROCESSING]: [VALIDATING, NEEDS_REVIEW],
  [VALIDATING]: [NEEDS_REVIEW, APPROVED, REVALIDATION_REQUIRED],
  [NEEDS_REVIEW]: [APPROVED, REJECTED, VALIDATING, SUSPENDED, REVALIDATION_REQUIRED, DEPRECATED, RETIRED],
  [APPROVED]: [PUBLISHED, NEEDS_REVIEW, SUSPENDED, DEPRECATED, REVALIDATION_REQUIRED, RETIRED],
  [PUBLISHED]: [SUSPENDED, DEPRECATED, REVALIDATION_REQUIRED, NEEDS_REVIEW],
  [SUSPENDED]: [PUBLISHED, APPROVED, NEEDS_REVIEW, RETIRED, REVALIDATION_REQUIRED],
  [DEPRECATED]: [RETIRED, PUBLISHED, REVALIDATION_REQUIRED],
  [RETIRED]: [],
  [REVALIDATION_REQUIRED]: [VALIDATING],
  [REJECTED]: [VALIDATING, RETIRED, REVALIDATION_REQUIRED],
};

/**
 * Enforces section 8's lifecycle as an actual guarded state machine rather than a free-text
 * status column — this is the "state transitions" deterministic validation called out in
 * section 14. Mutates the passed Question in place (status + bumps lifecycleVersion, the
 * optimistic-concurrency counter ReviewService uses for section 165); the caller is responsible
 * for persisting it afterward.
 */
export class LifecycleService {
  transition(question: Question, to: LifecycleStatus, actor: string, _reason?: string): void {
    const from = question.lifecycleStatus;
    if (from === to) return;
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalTransitionError(
        `Cannot move question ${question.id} from ${from} to ${to} (attempted by ${actor}).`,
      );
    }
    question.lifecycleStatus = to;
    question.lifecycleVersion += 1;
    question.updatedAt = new Date().toISOString();
  }

  canTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
    return from === to || (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
  }

  /**
   * Routes a question into VALIDATING from whatever state it's currently in. Revalidation of
   * already-published content is routed through REVALIDATION_REQUIRED first (section 105) rather
   * than jumping straight back to PROCESSING, which is reserved for brand-new drafts.
   */
  moveToValidating(question: Question, actor: string): void {
    if (question.lifecycleStatus === VALIDATING) return;
    if (question.lifecycleStatus === DRAFT) {
      this.transition(question, PROCESSING, actor);
      this.transition(question, VALIDATING, actor);
      return;
    }
    if (question.lifecycleStatus === PROCESSING || question.lifecycleStatus === REVALIDATION_REQUIRED) {
      this.transition(question, VALIDATING, actor);
      return;
    }
    this.transition(question, REVALIDATION_REQUIRED, actor);
    this.transition(question, VALIDATING, actor);
  }
}
