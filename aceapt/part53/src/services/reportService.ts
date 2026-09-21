import { QuestionRepository } from '../db/repository.js';
import { NotFoundError } from '../errors.js';
import { validateAnswer } from '../validators/answerValidator.js';
import { validateSolution } from '../validators/solutionValidator.js';
import { generateId, now, sha256 } from '../utils/misc.js';
import { ReportRecord } from '../types/domain.js';
import { IssueSeverity, QuestionPurpose, ReportType } from '../types/enums.js';
import { LifecycleStatus } from '../types/enums.js';
import { LifecycleService } from './lifecycleService.js';
import { PublicationService } from './publicationService.js';
import { AnalyticsService, AuditService } from './telemetry.js';

function pseudonymize(studentId: string): string {
  const salt = process.env.REPORT_HASH_SALT || 'dev-salt-change-me';
  return sha256(`${studentId}:${salt}`);
}

/**
 * Section 54: "Prioritize based on severity, repeated reports, assessment importance, student
 * impact, objective validation failure. Do not equate report count with truth." Repeat count is
 * one input among several here, not the deciding factor by itself — an objectively re-confirmed
 * critical defect always outranks raw report volume.
 */
export function computeReportPriority(input: {
  reportType: ReportType;
  existingOpenReportsForThisIssue: number;
  purpose?: QuestionPurpose;
  recheckFoundCriticalIssue: boolean;
}): ReportRecord['priority'] {
  if (input.recheckFoundCriticalIssue) return 'CRITICAL';
  const highStakes = input.purpose === QuestionPurpose.ASSESSMENT || input.purpose === QuestionPurpose.MASTERY;
  if (highStakes && (input.reportType === ReportType.ANSWER_WRONG || input.reportType === ReportType.MULTIPLE_CORRECT)) {
    return 'HIGH';
  }
  if (input.existingOpenReportsForThisIssue >= 3) return 'HIGH';
  if (input.existingOpenReportsForThisIssue >= 1) return 'MEDIUM';
  return 'LOW';
}

export class ReportService {
  constructor(
    private repo: QuestionRepository,
    private lifecycle: LifecycleService,
    private publication: PublicationService,
    private audit: AuditService,
    private analytics: AnalyticsService,
  ) {}

  /** Section 53 pipeline: REPORT -> AUTOMATED RECHECK -> SEVERITY -> REVIEW QUEUE -> DECISION. */
  async submitReport(input: {
    questionId: string;
    versionId: string;
    studentId: string;
    reportType: ReportType;
    description?: string;
  }): Promise<ReportRecord> {
    const question = this.repo.getQuestion(input.questionId);
    if (!question) throw new NotFoundError(`Question ${input.questionId} not found.`);
    const version = this.repo.getVersion(input.versionId);
    if (!version) throw new NotFoundError(`Question version ${input.versionId} not found.`);

    const studentHash = pseudonymize(input.studentId);
    const existingOpen = this.repo
      .listReports(input.questionId)
      .filter((r) => r.versionId === input.versionId && r.reportType === input.reportType && r.status === 'OPEN');

    // Automated recheck: re-run only the cheap, deterministic checks synchronously.
    const recheckIssues = [...validateAnswer(version).issues, ...validateSolution(version).issues];
    const recheckCritical = recheckIssues.some((i) => i.severity === IssueSeverity.CRITICAL);

    const record: ReportRecord = {
      id: generateId(),
      questionId: input.questionId,
      versionId: input.versionId,
      studentHash,
      reportType: input.reportType,
      description: input.description,
      status: 'OPEN',
      priority: computeReportPriority({
        reportType: input.reportType,
        existingOpenReportsForThisIssue: existingOpen.length,
        purpose: version.purpose,
        recheckFoundCriticalIssue: recheckCritical,
      }),
      createdAt: now(),
    };
    this.repo.saveReport(record);

    this.audit.record({
      questionId: input.questionId,
      action: 'QUESTION_REPORTED',
      actor: `student:${studentHash}`,
      metadata: { reportType: input.reportType, priority: record.priority },
    });
    this.analytics.emit('question_reported', { questionId: input.questionId, reportType: input.reportType, priority: record.priority });

    if (recheckCritical) {
      for (const issue of recheckIssues) {
        this.repo.saveIssue({ ...issue, questionVersionId: version.id });
      }
      await this.publication.suspend(
        input.questionId,
        `Student report triggered an automated recheck confirming a critical issue (${input.reportType}).`,
        'system:report-triage',
      );
    } else if (question.lifecycleStatus === LifecycleStatus.PUBLISHED || question.lifecycleStatus === LifecycleStatus.APPROVED) {
      this.lifecycle.transition(question, LifecycleStatus.NEEDS_REVIEW, 'system:report-triage', 'Student report received; queued for human review.');
      this.repo.saveQuestion(question);
    }

    return record;
  }

  /** Section 166: "reports can be grouped while retaining individual evidence." */
  getReportClusters(questionId: string) {
    const reports = this.repo.listReports(questionId);
    const groups = new Map<string, ReportRecord[]>();
    for (const r of reports) {
      const key = `${r.versionId}::${r.reportType}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const priorityRank: Record<ReportRecord['priority'], number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
    return [...groups.values()].map((items) => ({
      versionId: items[0].versionId,
      reportType: items[0].reportType,
      count: items.length,
      highestPriority: items.reduce((best, r) => (priorityRank[r.priority] > priorityRank[best] ? r.priority : best), items[0].priority),
      reports: items,
    }));
  }
}
