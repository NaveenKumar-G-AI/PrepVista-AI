/**
 * Demo AI Reviewer — a deterministic, hand-authored stand-in for a live
 * Groq/Gemini call (same pattern used for CodeForge's diagnostic AI
 * evaluation contract: a fixed, schema-conformant response standing in
 * for the real provider, so the AI-available path can be demoed and
 * tested with no network access).
 *
 * Implements the same shape evaluationEngine.js expects from any
 * `aiReview` dependency: (submission, project, testResult) => response.
 *
 * Every observation below references a file that's actually present in
 * DEMO_SUBMISSION_FILES, on purpose — so the grounding check in
 * aiContract.js has something real to verify against, and this doubles
 * as a working example of Phase 21's "never invent files, functions, or
 * behavior" being enforced, not just asserted.
 *
 * Swap this module out for aiProvider.js wired to a real key once you're
 * ready to go live — evaluationEngine.js doesn't need to change either way.
 */

export const DEMO_SUBMISSION_FILES = {
  'src/notificationService.ts': `export class NotificationService {
  constructor(private db: Database, private mailer: Mailer) {}

  async handleStatusChange(event: StatusChangeEvent) {
    // validates, persists, AND sends the email — three responsibilities in one method
    if (!event.applicationId) throw new Error('missing applicationId');
    const record = await this.db.notifications.insert({
      applicationId: event.applicationId,
      status: event.newStatus,
    });
    await this.mailer.send(event.studentEmail, \`Status updated: \${event.newStatus}\`);
    return record;
  }
}`,
  'src/eventHandler.ts': `export async function onStatusChangeEvent(req, res) {
  const service = new NotificationService(db, mailer);
  const result = await service.handleStatusChange(req.body);
  res.status(202).json(result);
}`,
};

/**
 * @param {import('../types').ProjectDefinition} project
 * @param {Record<string,string>} [submissionFiles]
 * @returns {Promise<{ feedback: Array<object>, categoryScoreAdjustments: Record<string, number> }>}
 */
export async function reviewSubmission(project, submissionFiles = DEMO_SUBMISSION_FILES) {
  return {
    feedback: [
      {
        category: 'architecture',
        observation: 'NotificationService.handleStatusChange validates input, persists the notification, and sends the email all in one method.',
        impact: 'Coupling orchestration to persistence and delivery makes each concern harder to test in isolation and harder to change independently (e.g. swapping email for push).',
        recommendation: 'Separate validation, persistence, and delivery into distinct steps or classes, composed by the handler.',
        evidenceRef: 'src/notificationService.ts',
      },
      {
        category: 'architecture',
        observation: 'No idempotency check before inserting a notification record for an event.',
        impact: 'A retried request — the exact ambiguity this project calls out — will create a duplicate notification.',
        recommendation: 'Key the insert on a unique event id, or check for an existing record for that event before writing.',
        evidenceRef: 'src/notificationService.ts',
      },
      {
        category: 'code_quality',
        observation: 'eventHandler.ts constructs a new NotificationService per request instead of receiving it as a dependency.',
        impact: 'Makes the handler harder to unit test without a real db/mailer.',
        recommendation: 'Inject the service (or a factory) rather than constructing it inline.',
        evidenceRef: 'src/eventHandler.ts',
      },
      {
        category: 'documentation',
        observation: "Neither file explains the retry/idempotency decision the project's documentation requirements explicitly ask for.",
        impact: "A reviewer can't tell whether the duplicate-event edge case was considered or missed.",
        recommendation: 'Add a short README section on the delivery model and idempotency strategy.',
        evidenceRef: 'src/notificationService.ts',
      },
    ],
    categoryScoreAdjustments: {
      architecture: 58,
      code_quality: 66,
      documentation: 40,
    },
  };
}

/**
 * A deliberately "poisoned" variant, for testing the grounding check in
 * aiContract.js — references a file that was never part of the submission.
 */
export async function reviewSubmissionWithHallucination(project, submissionFiles = DEMO_SUBMISSION_FILES) {
  const clean = await reviewSubmission(project, submissionFiles);
  return {
    ...clean,
    feedback: [
      ...clean.feedback,
      {
        category: 'security',
        observation: 'config/secrets.yaml commits an API key in plaintext.',
        impact: 'Credential leak.',
        recommendation: 'Move to environment variables.',
        evidenceRef: 'config/secrets.yaml', // intentionally not in DEMO_SUBMISSION_FILES
      },
    ],
  };
}
