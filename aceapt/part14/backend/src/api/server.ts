import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { db } from '../data/store';
import { generateExplanation } from '../engine/explainer';
import { generateBlueprint, selectQuestions } from '../engine/masteryCheckEngine';
import { computeAllAnalyses, computeAllEvidence, computeSkillAnalysis } from '../engine/masteryAnalyzer';
import { computeBottlenecks } from '../engine/rootCauseEngine';
import { FallbackInterventionEngine, MasteryGapSignal } from '../contracts/feature12';
import { FallbackReadinessEngine } from '../contracts/feature13';
import { AttemptEvent, MasteryCheck, MasteryTransition, SkillAnalysis } from '../domain/types';

// --- tiny zero-dependency .env loader -------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

const interventionEngine = new FallbackInterventionEngine();
const readinessEngine = new FallbackReadinessEngine();

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

function getQuestionsById() {
  return new Map(Array.from(db.get().questions.values()).map((q) => [q.id, q]));
}

function studentAttempts(studentId: string): AttemptEvent[] {
  return db.get().attempts.filter((a) => a.studentId === studentId);
}

function requireSkill(skillId: string) {
  const skill = db.get().skills.get(skillId);
  if (!skill) {
    const err: any = new Error(`Unknown skill: ${skillId}`);
    err.status = 404;
    throw err;
  }
  return skill;
}

function requireStudent(studentId: string) {
  const student = db.get().students.get(studentId);
  if (!student) {
    const err: any = new Error(`Unknown student: ${studentId}`);
    err.status = 404;
    throw err;
  }
  return student;
}

// --------------------------------------------------------------- health ---
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------- mastery map ---
app.get(
  '/api/students/:studentId/mastery-map',
  asyncHandler(async (req, res) => {
    const student = requireStudent(req.params.studentId);
    const skills = Array.from(db.get().skills.values());
    const questionsById = getQuestionsById();
    const analyses = computeAllAnalyses(studentAttempts(student.id), skills, questionsById);

    const domains = new Map<string, { domain: string; skills: Array<{ skill: typeof skills[0]; analysis: SkillAnalysis }> }>();
    for (const skill of skills) {
      if (!domains.has(skill.domain)) domains.set(skill.domain, { domain: skill.domain, skills: [] });
      domains.get(skill.domain)!.skills.push({ skill, analysis: analyses.get(skill.id)! });
    }

    res.json({ student, domains: Array.from(domains.values()) });
  })
);

// ------------------------------------------------------- what do I know ---
app.get(
  '/api/students/:studentId/what-do-i-know',
  asyncHandler(async (req, res) => {
    const student = requireStudent(req.params.studentId);
    const skills = Array.from(db.get().skills.values());
    const questionsById = getQuestionsById();
    const analyses = computeAllAnalyses(studentAttempts(student.id), skills, questionsById);

    const buckets: Record<string, Array<{ skill: typeof skills[0]; analysis: SkillAnalysis }>> = {
      'Strong mastery': [],
      Developing: [],
      Familiar: [],
      'Transfer gap': [],
      'Retention gap': [],
      'Difficulty gap': [],
      'Not enough data yet': [],
      'Not started': [],
    };
    for (const skill of skills) {
      const analysis = analyses.get(skill.id)!;
      const label = analysis.displayLabel;
      const bucket = ['Robust mastery', 'Transferred', 'Retained', 'Stable'].includes(label) ? 'Strong mastery' : label;
      (buckets[bucket] ?? buckets['Developing']).push({ skill, analysis });
    }

    res.json({ student, buckets });
  })
);

// -------------------------------------------------------------- bottlenecks
app.get(
  '/api/students/:studentId/bottlenecks',
  asyncHandler(async (req, res) => {
    const student = requireStudent(req.params.studentId);
    const skills = Array.from(db.get().skills.values());
    const questionsById = getQuestionsById();
    const evidenceById = computeAllEvidence(studentAttempts(student.id), skills, questionsById);
    const bottlenecks = computeBottlenecks(skills, evidenceById).map((b) => ({
      ...b,
      skillName: skills.find((s) => s.id === b.skillId)?.name ?? b.skillId,
    }));
    res.json({ bottlenecks });
  })
);

// --------------------------------------------------------------- readiness
app.get(
  '/api/students/:studentId/readiness',
  asyncHandler(async (req, res) => {
    const student = requireStudent(req.params.studentId);
    const skills = Array.from(db.get().skills.values());
    const questionsById = getQuestionsById();
    const analyses = computeAllAnalyses(studentAttempts(student.id), skills, questionsById);
    const signals = readinessEngine.getEligibleSkills(student.id, analyses).map((s) => ({
      ...s,
      skillName: skills.find((sk) => sk.id === s.skillId)?.name ?? s.skillId,
    }));
    res.json({ signals });
  })
);

// ------------------------------------------------------------ skill detail
app.get(
  '/api/students/:studentId/skills/:skillId',
  asyncHandler(async (req, res) => {
    const student = requireStudent(req.params.studentId);
    const skill = requireSkill(req.params.skillId);
    const skills = Array.from(db.get().skills.values());
    const questionsById = getQuestionsById();
    const evidenceById = computeAllEvidence(studentAttempts(student.id), skills, questionsById);
    const analysis = computeSkillAnalysis(skill.id, skills, evidenceById);
    const explanation = await generateExplanation(skill.name, analysis);
    res.json({ skill, analysis, explanation });
  })
);

app.get(
  '/api/students/:studentId/skills/:skillId/history',
  asyncHandler(async (req, res) => {
    const { studentId, skillId } = req.params;
    requireStudent(studentId);
    requireSkill(skillId);
    const store = db.get();
    const transitions = store.transitions
      .filter((t) => t.studentId === studentId && t.skillId === skillId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const snapshots = store.snapshots
      .filter((s) => s.studentId === studentId && s.skillId === skillId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    res.json({ transitions, snapshots });
  })
);

// -------------------------------------------------- Feature 12 (fallback) -
app.post(
  '/api/students/:studentId/skills/:skillId/intervene',
  asyncHandler(async (req, res) => {
    const student = requireStudent(req.params.studentId);
    const skill = requireSkill(req.params.skillId);
    const skills = Array.from(db.get().skills.values());
    const questionsById = getQuestionsById();
    const evidenceById = computeAllEvidence(studentAttempts(student.id), skills, questionsById);
    const analysis = computeSkillAnalysis(skill.id, skills, evidenceById);

    const signal: MasteryGapSignal = {
      studentId: student.id,
      skillId: skill.id,
      skillName: skill.name,
      gapTypes: analysis.flags,
      analysis,
      detectedAt: new Date().toISOString(),
    };
    const plan = interventionEngine.planIntervention(signal);
    res.json({ plan });
  })
);

// --------------------------------------------------------- mastery checks
app.post(
  '/api/mastery-checks',
  asyncHandler(async (req, res) => {
    const { studentId, skillId } = req.body as { studentId: string; skillId: string };
    requireStudent(studentId);
    const skill = requireSkill(skillId);
    const store = db.get();
    const allQuestions = Array.from(store.questions.values());
    const skills = Array.from(store.skills.values());

    const blueprint = generateBlueprint(skillId, skills, allQuestions);
    const previouslyUsed = new Set(store.attempts.filter((a) => a.studentId === studentId && a.skillId === skillId).map((a) => a.questionId));
    const questions = selectQuestions(blueprint, allQuestions, previouslyUsed);

    if (questions.length === 0) {
      res.status(400).json({ error: `No questions available for ${skill.name}.` });
      return;
    }

    const check: MasteryCheck = {
      id: `mc_${Date.now()}_${Math.round(Math.random() * 1000)}`,
      studentId,
      skillId,
      blueprint,
      questionIds: questions.map((q) => q.id),
      status: 'in_progress',
      createdAt: new Date().toISOString(),
    };
    store.masteryChecks.set(check.id, check);
    db.flush();

    res.json({
      check,
      questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, difficulty: q.difficulty, format: q.format, novelty: q.novelty, context: q.context, choices: q.choices })),
    });
  })
);

app.post(
  '/api/mastery-checks/:checkId/answers',
  asyncHandler(async (req, res) => {
    const { checkId } = req.params;
    const { questionId, answer, hintUsed, retries, responseTimeMs } = req.body as {
      questionId: string;
      answer: string;
      hintUsed?: boolean;
      retries?: number;
      responseTimeMs?: number;
    };

    const store = db.get();
    const check = store.masteryChecks.get(checkId);
    if (!check) {
      res.status(404).json({ error: 'Mastery check not found.' });
      return;
    }
    if (check.status !== 'in_progress') {
      res.status(400).json({ error: 'This mastery check is no longer in progress.' });
      return;
    }
    if (!check.questionIds.includes(questionId)) {
      res.status(400).json({ error: 'That question is not part of this check.' });
      return;
    }

    const question = store.questions.get(questionId);
    if (!question) {
      res.status(404).json({ error: 'Question not found.' });
      return;
    }

    const correct = answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
    const attempt: AttemptEvent = {
      id: `evt_${Date.now()}_${Math.round(Math.random() * 1000)}`,
      studentId: check.studentId,
      skillId: check.skillId,
      questionId,
      correct,
      independent: true,
      hintUsed: !!hintUsed,
      solutionViewed: false,
      retries: retries ?? 0,
      responseTimeMs: responseTimeMs ?? 0,
      timestamp: new Date().toISOString(),
      source: 'mastery_check',
      masteryCheckId: checkId,
    };
    store.attempts.push(attempt);
    db.flush();

    res.json({ correct, correctAnswer: question.correctAnswer });
  })
);

app.post(
  '/api/mastery-checks/:checkId/complete',
  asyncHandler(async (req, res) => {
    const { checkId } = req.params;
    const store = db.get();
    const check = store.masteryChecks.get(checkId);
    if (!check) {
      res.status(404).json({ error: 'Mastery check not found.' });
      return;
    }

    const skill = requireSkill(check.skillId);
    const skills = Array.from(store.skills.values());
    const questionsById = getQuestionsById();

    const allStudentAttempts = studentAttempts(check.studentId);
    const beforeAttempts = allStudentAttempts.filter((a) => a.masteryCheckId !== checkId);

    const beforeEvidenceById = computeAllEvidence(beforeAttempts, skills, questionsById);
    const before = computeSkillAnalysis(check.skillId, skills, beforeEvidenceById);

    const afterEvidenceById = computeAllEvidence(allStudentAttempts, skills, questionsById);
    const after = computeSkillAnalysis(check.skillId, skills, afterEvidenceById);

    check.status = 'completed';
    check.completedAt = new Date().toISOString();

    if (before.state !== after.state) {
      const transition: MasteryTransition = {
        id: `trans_${Date.now()}`,
        studentId: check.studentId,
        skillId: check.skillId,
        fromState: before.state,
        toState: after.state,
        reason: after.confidenceReason,
        triggeredBy: 'mastery_check_completed',
        evidenceSnapshot: after.evidence,
        timestamp: new Date().toISOString(),
      };
      store.transitions.push(transition);
    }
    store.snapshots.push({
      id: `snap_${Date.now()}`,
      studentId: check.studentId,
      skillId: check.skillId,
      analysis: after,
      timestamp: new Date().toISOString(),
    });
    db.flush();

    const explanation = await generateExplanation(skill.name, after);

    let intervention = null;
    const openGaps = after.flags.filter((f) => f !== 'INSUFFICIENT_EVIDENCE');
    if (openGaps.length > 0) {
      const signal: MasteryGapSignal = {
        studentId: check.studentId,
        skillId: check.skillId,
        skillName: skill.name,
        gapTypes: openGaps,
        analysis: after,
        detectedAt: new Date().toISOString(),
      };
      intervention = interventionEngine.planIntervention(signal);
    }

    res.json({ before, after, explanation, intervention, stateChanged: before.state !== after.state });
  })
);

// ------------------------------------------------------------------ errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ACEAPT Feature 14 backend listening on http://localhost:${PORT}`);
});

export default app;
