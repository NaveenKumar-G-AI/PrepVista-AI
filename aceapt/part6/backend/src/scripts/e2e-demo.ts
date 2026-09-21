/* eslint-disable no-console */
/**
 * Runs the full closed loop from section 6/60 of the spec against the REAL
 * service layer and REAL SQLite database - nothing here is mocked except
 * simulated "how the student performed", because there is no real student
 * to click through a UI. Every number printed (accuracy, readiness,
 * dimension scores, diagnosis text) is computed by the actual engine from
 * that simulated attempt data, the same code path the HTTP API uses.
 *
 * TESTING SHORTCUT (clearly isolated to this file): rather than sleeping in
 * real time for the ~30 minutes a real assessment would take, this script
 * calls the real navigate/answer/skip service functions (which is what
 * populates first_viewed_at, navigation logs, answer-change counts, etc. for
 * real) and then directly overwrites attempts.time_spent_ms with a chosen
 * simulated duration. Production code (attemptService/timerService) never
 * does this - it always derives time from real server timestamps.
 */
import { resetDb, getDb } from '../db/db';
import { seed, DEMO_STUDENT_ID } from '../db/seed';
import { createAssessment } from '../services/assessmentGenerationService';
import { startAssessment, getOwnedAssessment } from '../services/sessionService';
import { viewQuestion, submitAnswer, skipQuestion } from '../services/attemptService';
import { getQuestionsByIds } from '../services/questionSelectionService';
import { generateAssessmentResult } from '../services/assessmentReportService';
import { feature5Adapter } from '../adapters/feature5Adapter';
import { Difficulty, Question, Readiness, ReadinessDimension } from '../domain/types';

const STUDENT_ID = DEMO_STUDENT_ID;

function setSimulatedTime(assessmentId: string, questionId: string, seconds: number): void {
  const db = getDb();
  db.prepare(`UPDATE attempts SET time_spent_ms = ? WHERE assessment_id = ? AND question_id = ?`).run(
    Math.max(500, Math.round(seconds * 1000)),
    assessmentId,
    questionId
  );
}

function backdateStart(assessmentId: string, totalSimulatedSeconds: number): void {
  const db = getDb();
  const newStart = new Date(Date.now() - totalSimulatedSeconds * 1000).toISOString();
  db.prepare(`UPDATE assessments SET started_at = ? WHERE id = ?`).run(newStart, assessmentId);
}

const DIFF_BASE_TIME: Record<Difficulty, number> = { EASY: 45, MEDIUM: 75, MEDIUM_PLUS: 110, HARD: 150 };

interface SimPlan {
  correct: boolean;
  timeSeconds: number;
  skipFirst: boolean;
  revisitAfterSkip: boolean;
  neverView: boolean;
  changeSequence: ('wrong' | 'correct')[] | null; // sequence of intermediate answers before the final one implied by `correct`
}

/**
 * Decides how the simulated student performs on each question, adaptively
 * (based on the question's own attributes, not hardcoded IDs, since exactly
 * which questions the selection engine assigns can vary run to run). `phase`
 * lets the SECOND assessment show genuine, mechanism-driven improvement
 * specifically on the skill that was flagged and "practiced" after the first.
 */
function planPerformance(
  questions: Question[],
  phase: 'BEFORE_PRACTICE' | 'AFTER_PRACTICE',
  weakTopics: Set<string>
): Map<string, SimPlan> {
  const plan = new Map<string, SimPlan>();
  let overInvestBudget = phase === 'BEFORE_PRACTICE' ? 4 : 0;
  let guessBudget = phase === 'BEFORE_PRACTICE' ? 2 : 0;
  let skipBudget = phase === 'BEFORE_PRACTICE' ? 2 : 1;
  let revisitGranted = false;
  let changeBudget = phase === 'BEFORE_PRACTICE' ? 4 : 1;
  let changeKindsUsed = 0;
  let unviewBudget = phase === 'BEFORE_PRACTICE' ? 1 : 0;

  const baseCorrectProb: Record<Difficulty, number> = { EASY: 0.92, MEDIUM: 0.82, MEDIUM_PLUS: 0.58, HARD: 0.38 };
  const improvedCorrectProb: Record<Difficulty, number> = { EASY: 0.95, MEDIUM: 0.88, MEDIUM_PLUS: 0.78, HARD: 0.6 };

  questions.forEach((q, idx) => {
    if (unviewBudget > 0 && idx === questions.length - 1) {
      plan.set(q.id, { correct: false, timeSeconds: 0, skipFirst: false, revisitAfterSkip: false, neverView: true, changeSequence: null });
      unviewBudget -= 1;
      return;
    }

    const isWeak = weakTopics.has(q.topic);
    const base = DIFF_BASE_TIME[q.difficulty];
    const probTable = phase === 'AFTER_PRACTICE' ? improvedCorrectProb : baseCorrectProb;
    let correctProb = probTable[q.difficulty];
    if (isWeak && phase === 'BEFORE_PRACTICE') correctProb -= 0.2; // the injected weakness
    if (isWeak && phase === 'AFTER_PRACTICE') correctProb += 0.12; // the practiced improvement

    let timeSeconds = base * (0.65 + Math.random() * 0.4); // normal pace band

    // Special case: over-investment, concentrated on the weak topic at higher difficulty (section 19/60 narrative).
    if (overInvestBudget > 0 && isWeak && (q.difficulty === 'MEDIUM_PLUS' || q.difficulty === 'HARD')) {
      timeSeconds = base * (1.9 + Math.random() * 0.6);
      overInvestBudget -= 1;
      plan.set(q.id, { correct: Math.random() < 0.35, timeSeconds, skipFirst: false, revisitAfterSkip: false, neverView: false, changeSequence: null });
      return;
    }

    // Special case: rushed guess on a HARD question (section 20/21).
    if (guessBudget > 0 && q.difficulty === 'HARD') {
      timeSeconds = base * (0.15 + Math.random() * 0.1);
      guessBudget -= 1;
      plan.set(q.id, { correct: false, timeSeconds, skipFirst: false, revisitAfterSkip: false, neverView: false, changeSequence: null });
      return;
    }

    // Special case: skip, with the first one revisited-and-solved (effective skip) and the second left skipped.
    if (skipBudget > 0 && (q.difficulty === 'MEDIUM_PLUS' || q.difficulty === 'HARD')) {
      const revisit = !revisitGranted;
      revisitGranted = revisitGranted || revisit;
      skipBudget -= 1;
      plan.set(q.id, {
        correct: revisit,
        timeSeconds: revisit ? base * 0.9 : 0,
        skipFirst: true,
        revisitAfterSkip: revisit,
        neverView: false,
        changeSequence: null,
      });
      return;
    }

    // Special case: answer changes - rotate through correct->wrong, wrong->correct, correct->correct.
    if (changeBudget > 0 && q.difficulty !== 'HARD') {
      changeBudget -= 1;
      const kind = changeKindsUsed % 4;
      changeKindsUsed += 1;
      if (kind === 0 || kind === 1) {
        // correct -> wrong (weighted more heavily to match the "trust your first read" narrative)
        plan.set(q.id, { correct: false, timeSeconds, skipFirst: false, revisitAfterSkip: false, neverView: false, changeSequence: ['correct', 'wrong'] });
      } else if (kind === 2) {
        // wrong -> correct
        plan.set(q.id, { correct: true, timeSeconds, skipFirst: false, revisitAfterSkip: false, neverView: false, changeSequence: ['wrong', 'correct'] });
      } else {
        // correct -> correct (bounced but landed right)
        plan.set(q.id, { correct: true, timeSeconds, skipFirst: false, revisitAfterSkip: false, neverView: false, changeSequence: ['correct', 'correct'] });
      }
      return;
    }

    const correct = Math.random() < correctProb;
    plan.set(q.id, { correct, timeSeconds, skipFirst: false, revisitAfterSkip: false, neverView: false, changeSequence: null });
  });

  return plan;
}

function wrongOptionFor(q: Question): string {
  return q.options.find((o) => o.id !== q.correctOptionId)!.id;
}

async function runAssessment(
  type: Parameters<typeof createAssessment>[1],
  phase: 'BEFORE_PRACTICE' | 'AFTER_PRACTICE',
  weakTopics: Set<string>
) {
  const { assessment: created, warnings } = await createAssessment(STUDENT_ID, type);
  if (warnings.length) console.log('  [selection warnings]', warnings);

  let assessment = startAssessment(created.id, STUDENT_ID);
  const questions = getQuestionsByIds(assessment.questionIds);
  const plan = planPerformance(questions, phase, weakTopics);

  let previousId: string | null = null;
  let totalSimulated = 0;

  for (const q of questions) {
    const p = plan.get(q.id)!;
    if (p.neverView) {
      previousId = q.id; // not actually viewed; nothing to navigate away from for this one
      continue;
    }

    viewQuestion(assessment.id, STUDENT_ID, q.id, previousId);
    previousId = q.id;

    if (p.skipFirst && !p.revisitAfterSkip) {
      skipQuestion(assessment.id, q.id);
      setSimulatedTime(assessment.id, q.id, DIFF_BASE_TIME[q.difficulty] * 0.25);
      totalSimulated += DIFF_BASE_TIME[q.difficulty] * 0.25;
      continue;
    }
    if (p.skipFirst && p.revisitAfterSkip) {
      skipQuestion(assessment.id, q.id);
      // ... later comes back (simulated immediately here for script simplicity) ...
      viewQuestion(assessment.id, STUDENT_ID, q.id, q.id);
      submitAnswer(assessment.id, q.id, q.correctOptionId);
    } else if (p.changeSequence) {
      const [first, final] = p.changeSequence;
      submitAnswer(assessment.id, q.id, first === 'correct' ? q.correctOptionId : wrongOptionFor(q));
      submitAnswer(assessment.id, q.id, final === 'correct' ? q.correctOptionId : wrongOptionFor(q));
    } else {
      submitAnswer(assessment.id, q.id, p.correct ? q.correctOptionId : wrongOptionFor(q));
    }

    setSimulatedTime(assessment.id, q.id, p.timeSeconds);
    totalSimulated += p.timeSeconds;
  }

  backdateStart(assessment.id, Math.round(totalSimulated));
  assessment = getOwnedAssessment(assessment.id, STUDENT_ID);

  const outcome = await generateAssessmentResult(assessment.id, STUDENT_ID);
  return outcome;
}

function printReadiness(label: string, r: Readiness) {
  console.log(`\n${label}`);
  console.log(`  Overall Readiness: ${r.overallScore}%  [${r.state}]  (confidence: ${r.confidence})`);
  console.log(`  ${r.confidenceReason}`);
  console.log('  Dimensions:');
  for (const d of r.dimensions) {
    console.log(`    - ${d.dimension.padEnd(24)} ${String(d.score).padStart(3)}%  ${d.scored ? '' : '(unscored - neutral default)'}`);
  }
  console.log('  Section readiness:', r.sectionReadiness.map((s) => `${s.domain} ${s.score}%`).join(', '));
}

async function main() {
  console.log('================================================================');
  console.log('ACEAPT FEATURE 6 - END TO END DEMO');
  console.log('ASSESS -> DIAGNOSE -> PRACTICE -> REASSESS -> MEASURE');
  console.log('================================================================');

  resetDb();
  seed();

  // The weakness we deliberately inject and then "practice away" - multi-step,
  // higher-difficulty application questions, matching the spec's own demo narrative.
  const weakTopics = new Set(['ALGEBRA', 'DATA_INTERPRETATION']);

  console.log('\n--- STEP 1: ASSESS (Diagnostic Assessment) ---');
  const first = await runAssessment('DIAGNOSTIC_ASSESSMENT', 'BEFORE_PRACTICE', weakTopics);
  console.log(`  Accuracy: ${first.result.accuracyPct}%  Score: ${first.result.rawScore}/${first.result.maxScore}`);
  console.log(`  Attempted ${first.result.attemptedCount}, correct ${first.result.correctCount}, unanswered ${first.result.unansweredCount}`);
  printReadiness('READINESS (before practice):', first.result.readiness);

  console.log('\n--- STEP 2: DIAGNOSE ---');
  console.log('  What went well:');
  first.result.diagnosis.whatWentWell.forEach((s) => console.log(`    + ${s}`));
  console.log('  What reduced performance:');
  first.result.diagnosis.whatWentWrong.forEach((s) => console.log(`    - ${s}`));
  console.log('  Why:');
  first.result.diagnosis.why.forEach((s) => console.log(`    > ${s}`));
  console.log(`  Biggest risk: ${first.result.diagnosis.biggestRisk}`);
  console.log(`  Fix first: ${first.result.diagnosis.whatToFixFirst}`);
  console.log(`  Practice next: ${first.result.diagnosis.whatToPracticeNext}`);
  console.log(`  Reassess: ${first.result.diagnosis.whenToReassess}`);
  console.log(`  Top recommendations (-> handed to Feature 5 adapter):`);
  first.result.recommendations.forEach((r) =>
    console.log(`    [${r.priority}] ${r.topic}/${r.skill ?? ''}: ${r.objective}`)
  );
  console.log(`  practiceSessionId created: ${first.practiceSessionId}`);

  console.log('\n--- STEP 3: PRACTICE (simulating Feature 5 completing the recommended session) ---');
  if (first.practiceSessionId) {
    // Simulate the student practicing the weak skill and genuinely improving at it -
    // this is what "PROFILE AFTER_PRACTICE" above then reflects in assessment 2.
    await feature5Adapter.recordPracticeCompletion(first.practiceSessionId, { accuracyPct: 82, sampleSize: 10 });
    console.log('  Practice session marked COMPLETED with 82% accuracy over 10 questions (simulated).');
  } else {
    console.log('  No recommendation was generated (unexpectedly strong first attempt) - skipping practice simulation.');
  }

  console.log('\n--- STEP 4: REASSESS (equivalent Progress Assessment) ---');
  const second = await runAssessment('PROGRESS_ASSESSMENT', 'AFTER_PRACTICE', weakTopics);
  console.log(`  Accuracy: ${second.result.accuracyPct}%  Score: ${second.result.rawScore}/${second.result.maxScore}`);
  console.log(`  Attempted ${second.result.attemptedCount}, correct ${second.result.correctCount}, unanswered ${second.result.unansweredCount}`);
  printReadiness('READINESS (after practice):', second.result.readiness);

  console.log('\n--- STEP 5: MEASURE (before vs after, computed - not hardcoded) ---');
  const beforeDims = new Map(first.result.readiness.dimensions.map((d) => [d.dimension, d.score]));
  const afterDims = new Map(second.result.readiness.dimensions.map((d) => [d.dimension, d.score]));
  console.log(`  Overall Readiness: ${first.result.readiness.overallScore}% -> ${second.result.readiness.overallScore}%`);
  for (const dim of Object.keys(Object.fromEntries(beforeDims)) as ReadinessDimension[]) {
    const b = beforeDims.get(dim);
    const a = afterDims.get(dim);
    if (b === undefined || a === undefined) continue;
    const delta = Math.round((a - b) * 10) / 10;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '=';
    console.log(`    ${dim.padEnd(24)} ${String(b).padStart(3)}% -> ${String(a).padStart(3)}%   ${arrow} ${delta > 0 ? '+' : ''}${delta}`);
  }

  console.log('\n================================================================');
  console.log('DEMO COMPLETE');
  console.log('================================================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('DEMO FAILED:', err);
    process.exit(1);
  });
