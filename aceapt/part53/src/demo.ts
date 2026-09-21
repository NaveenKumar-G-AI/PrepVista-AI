import { MemoryRepository } from './db/memoryRepository.js';
import { createEngine } from './services/index.js';
import {
  ProductionMode,
  ProvenanceSource,
  QualityStatus,
  QuestionPurpose,
  ReportType,
  ReviewDecision,
  Role,
} from './types/enums.js';

function section(title: string) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
}

function printResult(label: string, status: QualityStatus, issues: { type: string; severity: string; message: string }[]) {
  console.log(`\n${label} -> ${status}`);
  if (issues.length === 0) {
    console.log('  (no issues)');
  }
  for (const i of issues) {
    console.log(`  [${i.severity}] ${i.type}: ${i.message}`);
  }
}

async function main() {
  const repo = new MemoryRepository();
  const engine = createEngine(repo);

  // ---------------------------------------------------------------------------------------
  section('1. Section 19/144 — "20% of 500" answer mismatch (stored 125, independently 100)');
  const bad = await engine.qualityService.createAndValidate({
    content: 'What is 20% of 500?',
    options: [
      { id: 'A', text: '100', numericValue: 100 },
      { id: 'B', text: '125', numericValue: 125 },
      { id: 'C', text: '90', numericValue: 90 },
    ],
    answerKey: ['B'],
    multiSelect: false,
    computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 },
    skillMapping: { primarySkill: 'PERCENTAGE' },
    difficultyMetadata: { label: 'EASY' },
    purpose: QuestionPurpose.PRACTICE,
    source: ProvenanceSource.AI_GENERATED,
  });
  printResult('20%-of-500 question', bad.status, bad.issues);

  // ---------------------------------------------------------------------------------------
  section('2. A clean question — every dimension passes, auto-approved (PRACTICE purpose)');
  const good = await engine.qualityService.createAndValidate({
    content: 'A sum of ₹1000 is invested at 10% simple interest per annum. What is the interest earned in 2 years?',
    options: [
      { id: 'A', text: '₹200', numericValue: 200 },
      { id: 'B', text: '₹220', numericValue: 220 },
      { id: 'C', text: '₹180', numericValue: 180 },
    ],
    answerKey: ['A'],
    multiSelect: false,
    computation: { kind: 'SIMPLE_INTEREST', principal: 1000, ratePercent: 10, years: 2 },
    skillMapping: { primarySkill: 'SIMPLE_INTEREST' },
    difficultyMetadata: { label: 'EASY' },
    purpose: QuestionPurpose.PRACTICE,
    source: ProvenanceSource.HUMAN_AUTHORED,
  });
  printResult('Simple-interest question', good.status, good.issues);
  console.log(`  Lifecycle status: ${engine.repo.getQuestion(good.question.id)?.lifecycleStatus}`);

  // ---------------------------------------------------------------------------------------
  section('3. Section 40/148 — tagged skill does not match the detected computation type');
  const skillMismatch = await engine.qualityService.createAndValidate({
    content: 'A bag has red and blue marbles in ratio 2:3, 100 total. How many are red?',
    options: [
      { id: 'A', text: '40', numericValue: 40 },
      { id: 'B', text: '60', numericValue: 60 },
      { id: 'C', text: '50', numericValue: 50 },
    ],
    answerKey: ['A'],
    multiSelect: false,
    computation: { kind: 'RATIO_SHARE', total: 100, ratio: [2, 3], shareIndex: 0 },
    skillMapping: { primarySkill: 'PROBABILITY' }, // wrong — this is a ratio/proportion question
    difficultyMetadata: { label: 'MEDIUM' },
    purpose: QuestionPurpose.PRACTICE,
  });
  printResult('Ratio question mistagged as Probability', skillMismatch.status, skillMismatch.issues);

  // ---------------------------------------------------------------------------------------
  section('4. Section 149/167 — near-duplicate detection (reworded restatement of question #2)');
  const dup = await engine.qualityService.createAndValidate({
    content: 'A sum of ₹1000 is invested at 10% simple interest per annum. What is the interest earned after 2 years?',
    options: [
      { id: 'A', text: '₹200', numericValue: 200 },
      { id: 'B', text: '₹220', numericValue: 220 },
      { id: 'C', text: '₹180', numericValue: 180 },
    ],
    answerKey: ['A'],
    multiSelect: false,
    computation: { kind: 'SIMPLE_INTEREST', principal: 1000, ratePercent: 10, years: 2 },
    skillMapping: { primarySkill: 'SIMPLE_INTEREST' },
    difficultyMetadata: { label: 'EASY' },
    purpose: QuestionPurpose.PRACTICE,
  });
  printResult('Near-duplicate of question #2 ("in 2 years" -> "after 2 years")', dup.status, dup.issues);

  // ---------------------------------------------------------------------------------------
  section('5. Section 47/151 — difficulty anomaly (labeled EASY, historical accuracy 20%)');
  const anomalyQuestion = await engine.qualityService.createAndValidate({
    content: 'A train 120m long crosses a platform 180m long in 20 seconds. Find its speed in km/h.',
    options: [
      { id: 'A', text: '54 km/h', numericValue: 54 },
      { id: 'B', text: '45 km/h', numericValue: 45 },
      { id: 'C', text: '50 km/h', numericValue: 50 },
    ],
    answerKey: ['A'],
    multiSelect: false,
    skillMapping: { primarySkill: 'TIME_SPEED_DISTANCE' },
    difficultyMetadata: { label: 'EASY' },
    purpose: QuestionPurpose.ASSESSMENT, // high-stakes -> needs human review even if it passes cleanly
  });
  engine.repo.setHistoricalStats(anomalyQuestion.question.id, { accuracyRate: 0.2, sampleSize: 250 });
  const revalidated = await engine.qualityService.validateQuestion(anomalyQuestion.version.id);
  printResult('Train-speed question after 250 real attempts at 20% accuracy', revalidated.status, revalidated.issues);
  console.log(
    `  Lifecycle status: ${engine.repo.getQuestion(anomalyQuestion.question.id)?.lifecycleStatus} (ASSESSMENT purpose always needs a human, section 44)`,
  );

  // ---------------------------------------------------------------------------------------
  section('6. Student reporting -> automated recheck -> auto-suspend when the recheck confirms a defect');
  const reportable = await engine.qualityService.createAndValidate({
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
  console.log(`  Initial lifecycle status: ${engine.repo.getQuestion(reportable.question.id)?.lifecycleStatus}`);
  await engine.publicationService.publish(reportable.question.id, 'admin:demo');
  console.log(`  Published. Lifecycle status: ${engine.repo.getQuestion(reportable.question.id)?.lifecycleStatus}`);

  // Someone edits the key incorrectly later:
  const brokenVersion = await engine.versioningService.createNewVersion(
    reportable.question.id,
    { answerKey: ['B'] },
    'reviewer:careless',
  );
  console.log(`  After a bad edit, lifecycle status: ${engine.repo.getQuestion(reportable.question.id)?.lifecycleStatus}`);

  const report = await engine.reportService.submitReport({
    questionId: reportable.question.id,
    versionId: brokenVersion.id,
    studentId: 'student-42',
    reportType: ReportType.ANSWER_WRONG,
    description: 'I get 100, not 150.',
  });
  console.log(`  Report priority: ${report.priority}`);
  console.log(`  Question health after report: ${engine.repo.getQuestion(reportable.question.id)?.health}`);
  console.log(
    `  Eligible for TIMED_CHALLENGE now? ${engine.publicationService.isEligibleForMode(reportable.question.id, ProductionMode.TIMED_CHALLENGE)}`,
  );
  console.log(`  Version history retained: ${engine.repo.listVersions(reportable.question.id).length} versions (nothing was deleted)`);

  // ---------------------------------------------------------------------------------------
  section('7. Reviewer approves a NEEDS_REVIEW question (RBAC + optimistic concurrency)');
  const q = engine.repo.getQuestion(skillMismatch.question.id)!;
  const approved = engine.reviewService.reviewQuestion({
    questionId: q.id,
    reviewerId: 'alice',
    role: Role.CONTENT_REVIEWER,
    decision: ReviewDecision.APPROVE,
    reason: 'Confirmed the ratio-vs-probability tag mismatch is a heuristic-only flag; content itself is correct.',
    expectedLifecycleVersion: q.lifecycleVersion,
  });
  console.log(`  Alice approves. New lifecycle status: ${approved.lifecycleStatus}, lifecycleVersion: ${approved.lifecycleVersion}`);

  try {
    engine.reviewService.reviewQuestion({
      questionId: q.id,
      reviewerId: 'bob',
      role: Role.CONTENT_REVIEWER,
      decision: ReviewDecision.APPROVE,
      expectedLifecycleVersion: q.lifecycleVersion, // stale on purpose — Bob loaded the page before Alice acted
    });
  } catch (err) {
    console.log(`  Bob's stale concurrent review is correctly rejected: ${(err as Error).message}`);
  }

  try {
    engine.reviewService.reviewQuestion({
      questionId: bad.question.id,
      reviewerId: 'trainee',
      role: Role.STUDENT, // students cannot review — section 164
      decision: ReviewDecision.APPROVE,
      expectedLifecycleVersion: engine.repo.getQuestion(bad.question.id)!.lifecycleVersion,
    });
  } catch (err) {
    console.log(`  A STUDENT-role review attempt is correctly rejected: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------------------
  section('Summary — analytics events emitted this run (section 138)');
  console.log(engine.analytics.countsByEvent());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
