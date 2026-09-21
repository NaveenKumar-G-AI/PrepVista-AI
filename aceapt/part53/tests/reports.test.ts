import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/db/memoryRepository.js';
import { createEngine } from '../src/services/index.js';
import { computeReportPriority } from '../src/services/reportService.js';
import { QuestionPurpose, ReportType } from '../src/types/enums.js';

describe('computeReportPriority — section 54: not just raw report count', () => {
  it('an objectively-confirmed critical defect always ranks CRITICAL, even with zero prior reports', () => {
    const priority = computeReportPriority({
      reportType: ReportType.ANSWER_WRONG,
      existingOpenReportsForThisIssue: 0,
      recheckFoundCriticalIssue: true,
    });
    expect(priority).toBe('CRITICAL');
  });

  it('a single low-stakes report with no recheck confirmation is only LOW', () => {
    const priority = computeReportPriority({
      reportType: ReportType.TYPO,
      existingOpenReportsForThisIssue: 0,
      purpose: QuestionPurpose.PRACTICE,
      recheckFoundCriticalIssue: false,
    });
    expect(priority).toBe('LOW');
  });

  it('repeated reports raise priority even without a confirmed recheck', () => {
    const priority = computeReportPriority({
      reportType: ReportType.UNCLEAR,
      existingOpenReportsForThisIssue: 5,
      recheckFoundCriticalIssue: false,
    });
    expect(priority).toBe('HIGH');
  });

  it('an ANSWER_WRONG report on a high-stakes assessment item is escalated even with no prior reports', () => {
    const priority = computeReportPriority({
      reportType: ReportType.ANSWER_WRONG,
      existingOpenReportsForThisIssue: 0,
      purpose: QuestionPurpose.ASSESSMENT,
      recheckFoundCriticalIssue: false,
    });
    expect(priority).toBe('HIGH');
  });
});

describe('ReportService — section 152/53: submitting a report', () => {
  it('pseudonymizes the student id — never stores it raw', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await engine.qualityService.createAndValidate({
      content: 'A clean, unrelated question stem for reporting purposes.',
      options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }],
      answerKey: ['A'],
      multiSelect: false,
      purpose: QuestionPurpose.PRACTICE,
    });

    const record = await engine.reportService.submitReport({
      questionId: created.question.id,
      versionId: created.version.id,
      studentId: 'student-secret-42',
      reportType: ReportType.UNCLEAR,
    });

    expect(record.studentHash).not.toBe('student-secret-42');
    expect(record.studentHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex digest
  });

  it('auto-suspends when the automated recheck confirms a critical defect (section 55/153)', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await engine.qualityService.createAndValidate({
      content: 'What is 50% of 200?',
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '150', numericValue: 150 },
        { id: 'C', text: '90', numericValue: 90 },
      ],
      answerKey: ['A'],
      multiSelect: false,
      computation: { kind: 'PERCENTAGE_OF', percent: 50, of: 200 },
      skillMapping: { primarySkill: 'PERCENTAGE' },
      difficultyMetadata: { label: 'EASY' },
      purpose: QuestionPurpose.PRACTICE,
    });
    await engine.publicationService.publish(created.question.id, 'admin:1');

    // A careless edit introduces a real defect.
    const broken = await engine.versioningService.createNewVersion(created.question.id, { answerKey: ['B'] }, 'reviewer:careless');

    const report = await engine.reportService.submitReport({
      questionId: created.question.id,
      versionId: broken.id,
      studentId: 'student-1',
      reportType: ReportType.ANSWER_WRONG,
    });

    expect(report.priority).toBe('CRITICAL');
    const question = engine.repo.getQuestion(created.question.id)!;
    expect(question.health).toBe('SUSPENDED');
  });

  it('section 166: groups repeated reports by (version, type) while retaining individual evidence', async () => {
    const engine = createEngine(new MemoryRepository());
    const created = await engine.qualityService.createAndValidate({
      content: 'A clean question for the clustering test.',
      options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }, { id: 'C', text: '3' }],
      answerKey: ['A'],
      multiSelect: false,
      purpose: QuestionPurpose.PRACTICE,
    });

    for (const studentId of ['s1', 's2', 's3']) {
      await engine.reportService.submitReport({
        questionId: created.question.id,
        versionId: created.version.id,
        studentId,
        reportType: ReportType.UNCLEAR,
      });
    }

    const clusters = engine.reportService.getReportClusters(created.question.id);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
    expect(clusters[0].reports).toHaveLength(3); // individual evidence retained, not collapsed away
  });
});
