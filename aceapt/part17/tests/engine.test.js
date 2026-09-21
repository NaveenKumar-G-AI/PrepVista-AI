// Plain-Node smoke tests (no test framework dependency, to keep the
// prototype's dependency footprint minimal). Run with `npm test`.
//
// IMPORTANT: the env var override must happen before any src/db module is
// required, since db/index.js loads the store at module-load time.
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const TEST_DB_PATH = path.join(__dirname, '.tmp-test-db.json');
if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
process.env.ACEAPT_DB_PATH = TEST_DB_PATH;
process.env.GENERATION_MODE = 'auto'; // no ANTHROPIC_API_KEY in this test run -> template/bank fallback exercised
process.env.RETENTION_INTERVAL_SECONDS = '120';

const orchestrator = require('../src/services/questionOrchestrator');
const purposeEngine = require('../src/engines/purposeEngine');
const diagnosticEngine = require('../src/engines/diagnosticEngine');
const validationEngine = require('../src/engines/validationEngine');
const questionBank = require('../data/question-bank.json');

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${label}`);
  } catch (e) {
    console.error(`FAIL  - ${label}`);
    console.error(`        ${e.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('ACEAPT Feature 17 — engine smoke tests\n');

  // -------------------------------------------------------------------
  // 1. Bank integrity
  // -------------------------------------------------------------------
  check('every bank question has exactly one correct option', () => {
    questionBank.forEach((q) => {
      const correctCount = q.options.filter((o) => o.correct).length;
      assert.strictEqual(correctCount, 1, `${q.id} has ${correctCount} correct options`);
    });
  });

  check('validationEngine approves every bank question against its own skill', () => {
    questionBank.forEach((q) => {
      const result = validationEngine.validate(q, { skillId: q.microSkill });
      assert.ok(result.approved, `${q.id} failed validation: ${result.reasons.join(', ')}`);
    });
  });

  // -------------------------------------------------------------------
  // 2. Purpose engine reacts to real state, not randomness
  // -------------------------------------------------------------------
  check('purposeEngine picks FOUNDATION_PRACTICE for a weak-concept student', () => {
    const { purpose } = purposeEngine.decidePurpose({
      skillState: { concept: 0.3, strategy: 0.3, transfer: 0.2, speed: 0.3, attempts: ['a'] },
    });
    assert.strictEqual(purpose, 'FOUNDATION_PRACTICE');
  });

  check('purposeEngine picks DIAGNOSTIC for strong-concept/weak-strategy student', () => {
    const { purpose } = purposeEngine.decidePurpose({
      skillState: { concept: 0.75, strategy: 0.45, transfer: 0.25, speed: 0.7, attempts: ['a'] },
    });
    assert.strictEqual(purpose, 'DIAGNOSTIC');
  });

  check('purposeEngine picks TRANSFER once concept+strategy are solid', () => {
    const { purpose } = purposeEngine.decidePurpose({
      skillState: { concept: 0.8, strategy: 0.7, transfer: 0.3, speed: 0.7, attempts: ['a'] },
    });
    assert.strictEqual(purpose, 'TRANSFER');
  });

  // -------------------------------------------------------------------
  // 3. Diagnostic engine disambiguation ranking (Section 12)
  // -------------------------------------------------------------------
  check('diagnosticEngine ranks a two-gap-type question above a one-gap-type question', () => {
    const conceptGapProbe = questionBank.find((q) => q.id === 'q-pct-003'); // covers concept_gap + calculation_gap
    const strategyGapProbe = questionBank.find((q) => q.id === 'q-pct-004'); // covers strategy_gap only
    const ranked = diagnosticEngine.rankForDisambiguation([strategyGapProbe, conceptGapProbe]);
    assert.strictEqual(ranked[0].id, 'q-pct-003', 'expected the broader-coverage probe to rank first');
  });

  // -------------------------------------------------------------------
  // 4. CRITICAL TEST (Section 56): two students with different states
  //    must not receive the same question sequence.
  // -------------------------------------------------------------------
  await (async () => {
    const strongStudentId = 'test-strong-student';
    const weakStudentId = 'test-weak-student';

    await orchestrator.getNextQuestion(strongStudentId, { skillId: 'percentage-basics' });
    // Manually elevate this student's skill state to "strong" before the
    // second call, simulating accumulated evidence.
    const db = require('../src/db');
    const strongStudent = db.getStudent(strongStudentId);
    strongStudent.skillStates['percentage-basics'].concept = 0.9;
    strongStudent.skillStates['percentage-basics'].strategy = 0.8;
    strongStudent.skillStates['percentage-basics'].transfer = 0.8;
    strongStudent.skillStates['percentage-basics'].speed = 0.8;
    strongStudent.skillStates['percentage-basics'].attempts = ['seed-1', 'seed-2', 'seed-3'];
    db.upsertStudent(strongStudent);

    const strongNext = await orchestrator.getNextQuestion(strongStudentId, { skillId: 'percentage-basics' });
    const weakNext = await orchestrator.getNextQuestion(weakStudentId, { skillId: 'percentage-basics' });

    check('a strong-state student and a fresh student get different purposes for the same skill', () => {
      assert.notStrictEqual(strongNext.purpose, weakNext.purpose, `both got ${strongNext.purpose}`);
    });
  })();

  // -------------------------------------------------------------------
  // 5. End-to-end arc: diagnostic failure -> intervention -> transfer ->
  //    mixed practice -> arc complete (Section 52's demonstration, run
  //    programmatically rather than by hand).
  // -------------------------------------------------------------------
  await (async () => {
    const studentId = 'test-arc-student';
    const db = require('../src/db');
    const student = db.getStudentOrCreate(studentId);
    student.journey.currentObjectiveSkill = 'successive-percentage-change';
    student.skillStates['successive-percentage-change'] = {
      skillId: 'successive-percentage-change',
      concept: 0.75,
      strategy: 0.45,
      transfer: 0.25,
      speed: 0.7,
      misconceptions: {},
      attempts: ['seed-1', 'seed-2', 'seed-3'],
      lastSeenAt: Date.now(),
      lastCorrectAt: Date.now(),
      masteredAt: null,
      lastRetentionCheckAt: null,
    };
    db.upsertStudent(student);

    // Step 1: diagnostic question should be q-pct-004 (only DIAGNOSTIC-tagged
    // question for this skill).
    const step1 = await orchestrator.getNextQuestion(studentId);
    check('arc demo step 1 is the strategy-selection diagnostic', () => {
      assert.strictEqual(step1.question.id, 'q-pct-004');
      assert.strictEqual(step1.purpose, 'DIAGNOSTIC');
    });

    // Answer incorrectly with the naive-subtraction distractor (option B).
    const result1 = await orchestrator.submitAnswer(studentId, step1.question.id, 'B', { responseTimeMs: 60000 });
    check('a wrong strategy-tagged answer starts a remediation arc', () => {
      assert.strictEqual(result1.branch, 'ARC_STARTED');
    });

    // Step 2: should now be INTERVENTION_VERIFICATION -> q-pct-005
    const step2 = await orchestrator.getNextQuestion(studentId);
    check('arc step 2 is the intervention-verification question', () => {
      assert.strictEqual(step2.purpose, 'INTERVENTION_VERIFICATION');
      assert.strictEqual(step2.question.id, 'q-pct-005');
    });
    const result2 = await orchestrator.submitAnswer(studentId, step2.question.id, 'A', { responseTimeMs: 50000 });
    check('answering the intervention-verification question correctly advances the arc', () => {
      assert.strictEqual(result2.branch, 'ARC_STEP_ADVANCED');
    });

    // Step 3: TRANSFER -> q-pct-006
    const step3 = await orchestrator.getNextQuestion(studentId);
    check('arc step 3 is the transfer question', () => {
      assert.strictEqual(step3.purpose, 'TRANSFER');
      assert.strictEqual(step3.question.id, 'q-pct-006');
    });
    const result3 = await orchestrator.submitAnswer(studentId, step3.question.id, 'A', { responseTimeMs: 70000 });
    check('answering the transfer question correctly advances the arc again', () => {
      assert.strictEqual(result3.branch, 'ARC_STEP_ADVANCED');
    });

    // Step 4: MIXED_PRACTICE -> q-pct-007 (disguised as Profit & Loss)
    const step4 = await orchestrator.getNextQuestion(studentId);
    check('arc step 4 is the mixed-practice (disguised) question', () => {
      assert.strictEqual(step4.purpose, 'MIXED_PRACTICE');
      assert.strictEqual(step4.question.id, 'q-pct-007');
    });
    const result4 = await orchestrator.submitAnswer(studentId, step4.question.id, 'A', { responseTimeMs: 80000 });
    check('answering the mixed-practice question correctly completes the arc', () => {
      assert.strictEqual(result4.branch, 'ARC_COMPLETE');
    });

    check('mastery, transfer, and journey stage all improved by the end of the arc', () => {
      const finalStudent = db.getStudent(studentId);
      const finalSkill = finalStudent.skillStates['successive-percentage-change'];
      assert.ok(finalSkill.concept > 0.75, `concept should have risen, got ${finalSkill.concept}`);
      assert.ok(finalSkill.strategy >= 0.6, `strategy should have crossed 0.6, got ${finalSkill.strategy}`);
      assert.ok(finalSkill.transfer > 0.25, `transfer should have risen, got ${finalSkill.transfer}`);
      assert.ok(finalSkill.masteredAt, 'masteredAt should now be set');
      assert.strictEqual(finalStudent.journey.stage, 'MASTERY', `expected journey stage MASTERY, got ${finalStudent.journey.stage}`);
    });
  })();

  // -------------------------------------------------------------------
  console.log(`\n${passed} check(s) passed.${process.exitCode ? ' SOME CHECKS FAILED — see above.' : ''}`);
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
}

main();
