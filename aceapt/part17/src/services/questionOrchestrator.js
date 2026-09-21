// Question Orchestrator.
//
// This is the concrete implementation of the architecture diagram in
// Section 44 and the closing loop in Section 65:
//   SELECT -> GENERATE IF NECESSARY -> VALIDATE -> PRESENT -> MEASURE ->
//   DIAGNOSE -> INTERVENE -> VERIFY -> UPDATE MASTERY -> UPDATE JOURNEY ->
//   SELECT THE NEXT RIGHT QUESTION.
//
// It owns sequencing only. It does not own mastery scoring (Feature 14),
// diagnosis (Feature 16), or journey planning (Feature 15) — those are
// delegated to the stubs in src/integrations/, exactly as Section 38/39/40
// require ("DO NOT duplicate Feature X").

const questionBank = require('../../data/question-bank.json');
const db = require('../db');
const eventBus = require('../events/eventBus');

const purposeEngine = require('../engines/purposeEngine');
const difficultyEngine = require('../engines/difficultyEngine');
const selectionEngine = require('../engines/selectionEngine');
const generationEngine = require('../engines/generationEngine');
const validationEngine = require('../engines/validationEngine');
const antiRepetition = require('../engines/antiRepetitionEngine');
const explanationEngine = require('../engines/explanationEngine');

const feature10 = require('../integrations/feature10-trajectory.stub');
const feature11 = require('../integrations/feature11-behavior.stub');
const feature13 = require('../integrations/feature13-readiness.stub');
const feature14 = require('../integrations/feature14-mastery.stub');
const feature15 = require('../integrations/feature15-journey.stub');
const feature16 = require('../integrations/feature16-intervention.stub');

const { humanizeSkill, round2 } = require('../utils/text');

// A "remediation arc" is the concrete implementation of Sections 19/20/38:
// after a diagnosed gap, don't just re-run the same diagnostic in a loop —
// walk a short, purposeful sequence (verify the intervention, then check it
// transfers, then check it survives being mixed with other topics) before
// falling back to ordinary adaptive selection.
const ARC_STEPS = ['INTERVENTION_VERIFICATION', 'TRANSFER', 'MIXED_PRACTICE'];

const RETENTION_INTERVAL_MS = (parseInt(process.env.RETENTION_INTERVAL_SECONDS || '120', 10)) * 1000;

function getOrCreateSkillState(student, skillId) {
  if (!student.skillStates[skillId]) {
    student.skillStates[skillId] = {
      skillId,
      concept: 0.3,
      strategy: 0.3,
      transfer: 0.2,
      speed: 0.3,
      misconceptions: {},
      attempts: [],
      lastSeenAt: null,
      lastCorrectAt: null,
      masteredAt: null,
      lastRetentionCheckAt: null,
    };
  }
  if (!student.journey.currentObjectiveSkill) {
    student.journey.currentObjectiveSkill = skillId;
  }
  return student.skillStates[skillId];
}

function publicQuestionView(q) {
  return {
    id: q.id,
    subject: q.subject,
    topic: q.topic,
    microSkill: q.microSkill,
    questionType: q.questionType,
    stem: q.stem,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    difficulty: q.difficulty,
    expectedTimeSeconds: q.difficulty.expectedTimeSeconds,
    validationState: q.validationState,
  };
}

function publicSkillSnapshot(skillState) {
  return {
    concept: round2(skillState.concept),
    strategy: round2(skillState.strategy),
    transfer: round2(skillState.transfer),
    speed: round2(skillState.speed),
    masteredAt: skillState.masteredAt || null,
  };
}

// ---------------------------------------------------------------------------
// GET NEXT QUESTION
// ---------------------------------------------------------------------------

async function getNextQuestion(studentId, opts = {}) {
  const student = db.getStudentOrCreate(studentId);
  if (opts.mode) student.mode = opts.mode;

  const objective = feature15.getCurrentObjective(student);
  const targetSkillId = opts.skillId || objective.skillId;
  const skillState = getOrCreateSkillState(student, targetSkillId);

  let purposeCtx;

  if (student.mode === 'EXAM') {
    purposeCtx = { purpose: 'ASSESSMENT_SIMULATION', rationale: 'Exam-style conditions: mixed topics, realistic timing, limited assistance.' };
  } else if (student.activeArc && student.activeArc.skillId === targetSkillId) {
    const stepPurpose = student.activeArc.steps[student.activeArc.stepIndex];
    const copyFn = explanationEngine.ARC_STEP_COPY[stepPurpose];
    purposeCtx = { purpose: stepPurpose, rationale: copyFn ? copyFn() : 'Continuing the targeted follow-up sequence.' };
  } else if (student.pendingDiagnostic && student.pendingDiagnostic.skillId === targetSkillId) {
    purposeCtx = { purpose: 'DIAGNOSTIC', rationale: student.pendingDiagnostic.reason };
  } else if (student.mode === 'DIAGNOSTIC') {
    purposeCtx = { purpose: 'DIAGNOSTIC', rationale: 'Diagnostic mode: actively probing for the current gap.' };
  } else if (
    skillState.masteredAt &&
    Date.now() - skillState.masteredAt > RETENTION_INTERVAL_MS &&
    (!skillState.lastRetentionCheckAt || Date.now() - skillState.lastRetentionCheckAt > RETENTION_INTERVAL_MS)
  ) {
    skillState.lastRetentionCheckAt = Date.now();
    purposeCtx = { purpose: 'RETENTION', rationale: `It's been a while since ${humanizeSkill(targetSkillId)} was checked — confirming it's still solid.` };
  } else {
    purposeCtx = purposeEngine.decidePurpose({ skillState });
  }

  const difficultyTarget = difficultyEngine.targetFor(purposeCtx.purpose);
  const exposures = db.getExposures(studentId);

  let candidate = selectionEngine.select({
    bank: questionBank,
    skillId: targetSkillId,
    purpose: purposeCtx.purpose,
    difficultyTarget,
    exposures,
    mixedPool: purposeCtx.purpose === 'MIXED_PRACTICE' ? questionBank : null,
  });

  let source = 'bank';

  if (!candidate) {
    const spec = generationEngine.buildSpec({ skillId: targetSkillId, purpose: purposeCtx.purpose, difficultyTarget, skillState });
    const generated = await generationEngine.generate(spec);
    const validation = validationEngine.validate(generated, spec);
    eventBus.emit('QUESTION_VALIDATED', { studentId, approved: validation.approved, reasons: validation.reasons, mode: validation.mode });

    if (generated && validation.approved) {
      candidate = generated;
      source = validation.mode;
      db.saveGeneratedQuestion(candidate);
      eventBus.emit('QUESTION_GENERATED', { studentId, questionId: candidate.id, mode: source, skillId: targetSkillId, purpose: purposeCtx.purpose });
    } else {
      candidate = selectionEngine.selectRelaxed({ bank: questionBank, skillId: targetSkillId, exposures });
      source = 'bank_fallback';
      eventBus.emit('QUESTION_QUALITY_FLAGGED', { studentId, reason: 'generation_failed_or_rejected', skillId: targetSkillId, validationReasons: validation.reasons });
    }
  }

  if (!candidate) {
    // Absolute last resort per Section 57: never fabricate a question with
    // no basis. Surface a clear, honest signal instead of crashing or lying.
    return { error: 'no_suitable_question', message: `No bank question or generation path is available for "${targetSkillId}" yet.` };
  }

  db.issueQuestion(studentId, candidate, purposeCtx.purpose);
  db.upsertStudent(student);

  eventBus.emit('QUESTION_RECOMMENDED', { studentId, questionId: candidate.id, purpose: purposeCtx.purpose, source, skillId: targetSkillId });
  eventBus.emit('QUESTION_STARTED', { studentId, questionId: candidate.id });

  return {
    question: publicQuestionView(candidate),
    purpose: purposeCtx.purpose,
    why: explanationEngine.buildWhyThisQuestion({ purposeCtx }),
    targets: explanationEngine.buildTargets(candidate),
    source,
    mode: student.mode,
    skillSnapshot: publicSkillSnapshot(skillState),
  };
}

// ---------------------------------------------------------------------------
// SUBMIT ANSWER
// ---------------------------------------------------------------------------

async function submitAnswer(studentId, questionId, selectedOptionId, meta = {}) {
  const student = db.getStudent(studentId);
  if (!student) throw new Error('Unknown student');

  const issued = db.getIssuedQuestion(studentId, questionId);
  if (!issued) throw new Error('This question was not currently issued to this student');

  const question = issued.question;
  const selectedOption = question.options.find((o) => o.id === selectedOptionId);
  const correct = !!selectedOption?.correct;
  const misconceptionTag = selectedOption?.misconceptionTag || null;

  antiRepetition.recordExposure(db, studentId, questionId, correct);

  const evidence = {
    studentId,
    questionId,
    skillId: question.microSkill,
    topic: question.topic,
    purposeServed: issued.servedPurpose,
    correct,
    misconceptionTag,
    responseTimeMs: meta.responseTimeMs || 0,
    expectedTimeSeconds: question.difficulty.expectedTimeSeconds,
    hintsUsed: meta.hintsUsed || 0,
    difficulty: question.difficulty,
    timestamp: Date.now(),
  };
  db.recordAttempt(evidence);
  eventBus.emit(correct ? 'QUESTION_SUCCEEDED' : 'QUESTION_FAILED', evidence);
  eventBus.emit('QUESTION_COMPLETED', evidence);

  feature11.recordBehaviorSignal(student, {
    type: 'attempt',
    skillId: question.microSkill,
    correct,
    responseTimeMs: evidence.responseTimeMs,
    hintsUsed: evidence.hintsUsed,
  });

  const skillState = getOrCreateSkillState(student, question.microSkill);
  if (misconceptionTag) {
    skillState.misconceptions[misconceptionTag] = (skillState.misconceptions[misconceptionTag] || 0) + 1;
  }

  // Feature 14: mastery/transfer/speed update. Feature 17 supplies evidence
  // only — Feature 14 (stub here) owns interpreting it (Section 39).
  const masteryUpdate = feature14.updateMastery(skillState, evidence);
  Object.assign(skillState, masteryUpdate);

  // -- Branching (Section 17/18/19/20) -------------------------------------
  let branchOutcome = { action: 'ADVANCE' };
  let diagnosis = null;

  if (student.activeArc && student.activeArc.skillId === question.microSkill && issued.servedPurpose === student.activeArc.steps[student.activeArc.stepIndex]) {
    const arc = student.activeArc;
    if (correct) {
      arc.stepIndex += 1;
      arc.failCount = 0;
      if (arc.stepIndex >= arc.steps.length) {
        skillState.transfer = Math.min(1, (skillState.transfer || 0) + 0.05); // arc-completion bonus: finishing the full repair sequence is itself strong transfer evidence
        branchOutcome = { action: 'ARC_COMPLETE' };
        eventBus.emit('QUESTION_BRANCH_TRIGGERED', { studentId, branch: 'ARC_COMPLETE', skillId: question.microSkill });
        student.activeArc = null;
      } else {
        branchOutcome = { action: 'ARC_STEP_ADVANCED', nextPurpose: arc.steps[arc.stepIndex] };
        eventBus.emit('QUESTION_BRANCH_TRIGGERED', { studentId, branch: 'ARC_STEP_ADVANCED', nextPurpose: arc.steps[arc.stepIndex] });
      }
    } else {
      arc.failCount = (arc.failCount || 0) + 1;
      if (arc.failCount >= 2) {
        student.activeArc = null;
        student.pendingDiagnostic = { skillId: question.microSkill, reason: "Let's re-check with a fresh diagnostic question." };
        branchOutcome = { action: 'ARC_RESET_TO_DIAGNOSTIC' };
        eventBus.emit('QUESTION_BRANCH_TRIGGERED', { studentId, branch: 'ARC_RESET_TO_DIAGNOSTIC', skillId: question.microSkill });
      } else {
        branchOutcome = { action: 'ARC_STEP_RETRY' };
      }
    }
  } else if (!correct) {
    diagnosis = feature16.diagnose(skillState);
    eventBus.emit('QUESTION_DIAGNOSTIC_CREATED', { studentId, skillId: question.microSkill, diagnosis });

    if (diagnosis && diagnosis.confidence >= 0.5) {
      student.activeArc = {
        skillId: question.microSkill,
        diagnosis: diagnosis.gapType,
        interventionType: diagnosis.recommendedIntervention,
        steps: [...ARC_STEPS],
        stepIndex: 0,
        failCount: 0,
        startedAt: Date.now(),
      };
      student.pendingDiagnostic = null;
      branchOutcome = { action: 'ARC_STARTED', diagnosis };
      eventBus.emit('QUESTION_BRANCH_TRIGGERED', { studentId, branch: 'ARC_STARTED', diagnosis });
    } else {
      student.pendingDiagnostic = { skillId: question.microSkill, reason: 'Uncertain gap type — probing further before deciding on an intervention.' };
      branchOutcome = { action: 'DIAGNOSTIC_FOLLOWUP' };
      eventBus.emit('QUESTION_BRANCH_TRIGGERED', { studentId, branch: 'DIAGNOSTIC_FOLLOWUP' });
    }
  } else {
    student.pendingDiagnostic = null;
  }

  // Feature 13: readiness (mostly moves under EXAM / ASSESSMENT_SIMULATION)
  feature13.updateReadiness(student, evidence);

  // Feature 15: journey update
  const journeyUpdate = feature15.updateJourney(student, evidence, skillState);
  Object.assign(student.journey, journeyUpdate);

  // Feature 10: trajectory hook (Section 42)
  feature10.noteEvidence(student, evidence);

  db.upsertStudent(student);

  return {
    correct,
    correctOptionId: question.options.find((o) => o.correct).id,
    officialExplanation: question.explanation,
    whatWeLearned: explanationEngine.buildWhatWeLearned({ question, evidence, branchOutcome }),
    skillSnapshot: publicSkillSnapshot(skillState),
    branch: branchOutcome.action,
  };
}

// ---------------------------------------------------------------------------
// PERSONALIZED PRACTICE SET (Section 36)
// ---------------------------------------------------------------------------

async function getPracticeSet(studentId) {
  const student = db.getStudentOrCreate(studentId);
  const knownSkills = Object.keys(student.skillStates);
  const skillIds = knownSkills.length ? knownSkills : [feature15.getCurrentObjective(student).skillId];
  const exposures = db.getExposures(studentId);

  const composition = [
    { purpose: 'DIAGNOSTIC', count: 2 },
    { purpose: 'FOUNDATION_PRACTICE', count: 3 },
    { purpose: 'TRANSFER', count: 2 },
    { purpose: 'MIXED_PRACTICE', count: 2 },
    { purpose: 'SPEED', count: 1 },
  ];

  const items = [];
  const usedInThisSet = new Set();
  let cursor = 0;
  for (const slot of composition) {
    for (let i = 0; i < slot.count; i += 1) {
      const skillId = skillIds[cursor % skillIds.length];
      cursor += 1;
      getOrCreateSkillState(student, skillId);
      const difficultyTarget = difficultyEngine.targetFor(slot.purpose);
      // Exclude questions already placed in this set so a narrow skill
      // history produces a shorter, honest set rather than padding with
      // repeats (Section 14: avoid meaningless repetition).
      const availableBank = questionBank.filter((q) => !usedInThisSet.has(q.id));
      const q = selectionEngine.select({
        bank: availableBank,
        skillId,
        purpose: slot.purpose,
        difficultyTarget,
        exposures,
        mixedPool: slot.purpose === 'MIXED_PRACTICE' ? availableBank : null,
      });
      if (q) {
        items.push({ purpose: slot.purpose, question: publicQuestionView(q) });
        usedInThisSet.add(q.id);
      }
    }
  }

  db.upsertStudent(student);
  return { title: 'Your 10-Minute Targeted Set', items };
}

module.exports = { getNextQuestion, submitAnswer, getPracticeSet };
