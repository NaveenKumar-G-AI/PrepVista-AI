import { randomUUID } from 'node:crypto';
import { mutateDB, readDB } from './store';
import { STAGE_ORDER } from '../types';
import { STAGE_LABELS } from '../constants';
import type {
  ApplicationStage,
  EvidenceSource,
  EvidenceType,
  FailureCategory,
  Opportunity,
  OutcomeEvidence,
  ProductEvent,
  Reassessment,
  ReassessmentResult,
  RecoveryAction,
  RecoveryActionStatus,
  RecoveryPlan,
  RecoveryStatus,
  StageKey,
  StageStatus,
  Student,
  TargetAlignment,
  TrajectoryNote,
} from '../types';

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Students (placeholder profile — see auth.ts for the real integration point)
// ---------------------------------------------------------------------------

export function getOrCreateDevStudent(id: string, name: string): Student {
  return mutateDB((db) => {
    let student = db.students.find((s) => s.id === id);
    if (!student) {
      student = { id, name, email: null, targetRole: null, createdAt: now() };
      db.students.push(student);
    }
    return student!;
  });
}

export function getStudent(id: string): Student | null {
  return readDB().students.find((s) => s.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Opportunities + stages
// ---------------------------------------------------------------------------

export interface CreateOutcomeInput {
  studentId: string;
  companyName: string;
  roleTitle: string;
  roleCategory: string;
  source: string | null;
  targetAlignment: TargetAlignment;
  furthestStageKey: StageKey;
  furthestStageStatus: StageStatus;
  customStageLabel: string | null;
  recruiterFeedbackText: string | null;
  studentReflectionText: string | null;
}

export function createOutcome(input: CreateOutcomeInput): {
  opportunity: Opportunity;
  stages: ApplicationStage[];
  evidence: OutcomeEvidence[];
} {
  return mutateDB((db) => {
    const opportunity: Opportunity = {
      id: randomUUID(),
      studentId: input.studentId,
      companyName: input.companyName.trim(),
      roleTitle: input.roleTitle.trim(),
      roleCategory: input.roleCategory.trim(),
      source: input.source,
      targetAlignment: input.targetAlignment,
      customStageLabel: input.customStageLabel,
      createdAt: now(),
    };
    db.opportunities.push(opportunity);

    const furthestIndex = STAGE_ORDER.indexOf(input.furthestStageKey);
    const stages: ApplicationStage[] = STAGE_ORDER.slice(0, furthestIndex + 1).map((key, i) => {
      const isFurthest = i === furthestIndex;
      const stage: ApplicationStage = {
        id: randomUUID(),
        opportunityId: opportunity.id,
        stageKey: key,
        label: isFurthest && input.customStageLabel ? input.customStageLabel : STAGE_LABELS[key],
        sortOrder: i,
        status: isFurthest ? input.furthestStageStatus : 'passed',
        isFurthest,
        completedAt: isFurthest ? now() : now(),
      };
      return stage;
    });
    db.stages.push(...stages);

    const furthestStage = stages[stages.length - 1];
    const evidence: OutcomeEvidence[] = [];

    if (input.recruiterFeedbackText && input.recruiterFeedbackText.trim()) {
      const e: OutcomeEvidence = {
        id: randomUUID(),
        opportunityId: opportunity.id,
        applicationStageId: furthestStage.id,
        evidenceType: 'DIRECT_EVIDENCE',
        source: 'recruiter_feedback',
        failureCategory: null, // classified lazily on first read — see ai/outcomeAnalysis.ts
        contentText: input.recruiterFeedbackText.trim(),
        createdAt: now(),
      };
      db.evidence.push(e);
      evidence.push(e);
    }

    if (input.studentReflectionText && input.studentReflectionText.trim()) {
      const e: OutcomeEvidence = {
        id: randomUUID(),
        opportunityId: opportunity.id,
        applicationStageId: furthestStage.id,
        evidenceType: 'POSSIBLE_CONTRIBUTOR',
        source: 'student_feedback',
        failureCategory: null,
        contentText: input.studentReflectionText.trim(),
        createdAt: now(),
      };
      db.evidence.push(e);
      evidence.push(e);
    }

    return { opportunity, stages, evidence };
  });
}

export function listOpportunities(studentId: string): Opportunity[] {
  return readDB()
    .opportunities.filter((o) => o.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOpportunity(id: string): Opportunity | null {
  return readDB().opportunities.find((o) => o.id === id) ?? null;
}

export function getStagesForOpportunity(opportunityId: string): ApplicationStage[] {
  return readDB()
    .stages.filter((s) => s.opportunityId === opportunityId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getFurthestStage(opportunityId: string): ApplicationStage | null {
  const stages = getStagesForOpportunity(opportunityId);
  return stages.find((s) => s.isFurthest) ?? stages[stages.length - 1] ?? null;
}

export function getStagesForStudent(studentId: string): Array<ApplicationStage & { opportunity: Opportunity }> {
  const db = readDB();
  const oppIds = new Set(db.opportunities.filter((o) => o.studentId === studentId).map((o) => o.id));
  const oppById = new Map(db.opportunities.map((o) => [o.id, o]));
  return db.stages
    .filter((s) => oppIds.has(s.opportunityId))
    .map((s) => ({ ...s, opportunity: oppById.get(s.opportunityId)! }));
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface AddEvidenceInput {
  opportunityId: string;
  applicationStageId: string | null;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  failureCategory: FailureCategory | null;
  contentText: string;
}

export function addEvidence(input: AddEvidenceInput): OutcomeEvidence {
  return mutateDB((db) => {
    const e: OutcomeEvidence = {
      id: randomUUID(),
      opportunityId: input.opportunityId,
      applicationStageId: input.applicationStageId,
      evidenceType: input.evidenceType,
      source: input.source,
      failureCategory: input.failureCategory,
      contentText: input.contentText.trim(),
      createdAt: now(),
    };
    db.evidence.push(e);
    return e;
  });
}

export function listEvidenceForOpportunity(opportunityId: string): OutcomeEvidence[] {
  return readDB()
    .evidence.filter((e) => e.opportunityId === opportunityId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function listEvidenceForStudent(studentId: string): OutcomeEvidence[] {
  const db = readDB();
  const oppIds = new Set(db.opportunities.filter((o) => o.studentId === studentId).map((o) => o.id));
  return db.evidence.filter((e) => oppIds.has(e.opportunityId));
}

// Fills in an AI-classified category the first time an evidence row is read,
// so the (fast, always-reliable) write path never depends on the AI being up.
export function setEvidenceFailureCategory(evidenceId: string, category: FailureCategory): void {
  mutateDB((db) => {
    const e = db.evidence.find((x) => x.id === evidenceId);
    if (e && !e.failureCategory) e.failureCategory = category;
  });
}

// ---------------------------------------------------------------------------
// Recovery plans + actions
// ---------------------------------------------------------------------------

export interface CreateRecoveryPlanInput {
  studentId: string;
  opportunityId: string | null;
  failureCategory: FailureCategory;
  patternStrength: RecoveryPlan['patternStrength'];
  rationaleFallback: string;
  rationaleAI: string | null;
  primary: { title: string; description: string };
  supporting: { title: string; description: string }[];
}

export function createRecoveryPlan(input: CreateRecoveryPlanInput): {
  plan: RecoveryPlan;
  actions: RecoveryAction[];
} {
  return mutateDB((db) => {
    const plan: RecoveryPlan = {
      id: randomUUID(),
      studentId: input.studentId,
      opportunityId: input.opportunityId,
      failureCategory: input.failureCategory,
      patternStrength: input.patternStrength,
      rationaleFallback: input.rationaleFallback,
      rationaleAI: input.rationaleAI,
      status: 'recommended',
      createdAt: now(),
      startedAt: null,
      completedAt: null,
    };
    db.recoveryPlans.push(plan);

    const actions: RecoveryAction[] = [
      {
        id: randomUUID(),
        recoveryPlanId: plan.id,
        actionType: 'primary',
        title: input.primary.title,
        description: input.primary.description,
        status: 'pending',
        completedAt: null,
      },
      ...input.supporting.slice(0, 2).map(
        (s): RecoveryAction => ({
          id: randomUUID(),
          recoveryPlanId: plan.id,
          actionType: 'supporting',
          title: s.title,
          description: s.description,
          status: 'pending',
          completedAt: null,
        }),
      ),
    ];
    db.recoveryActions.push(...actions);

    return { plan, actions };
  });
}

export function getRecoveryPlan(id: string): RecoveryPlan | null {
  return readDB().recoveryPlans.find((p) => p.id === id) ?? null;
}

export function findRecoveryPlanForOpportunity(opportunityId: string): RecoveryPlan | null {
  return readDB().recoveryPlans.find((p) => p.opportunityId === opportunityId) ?? null;
}

export function listRecoveryPlansForStudent(studentId: string): RecoveryPlan[] {
  return readDB()
    .recoveryPlans.filter((p) => p.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listRecoveryActions(planId: string): RecoveryAction[] {
  return readDB()
    .recoveryActions.filter((a) => a.recoveryPlanId === planId)
    .sort((a, b) => (a.actionType === 'primary' ? -1 : 1));
}

export function updateRecoveryPlanStatus(id: string, status: RecoveryStatus): RecoveryPlan | null {
  return mutateDB((db) => {
    const plan = db.recoveryPlans.find((p) => p.id === id);
    if (!plan) return null;
    plan.status = status;
    if (status === 'started') plan.startedAt = now();
    if (status === 'completed') plan.completedAt = now();
    return plan;
  });
}

export function updateRecoveryActionStatus(
  actionId: string,
  status: RecoveryActionStatus,
): RecoveryAction | null {
  return mutateDB((db) => {
    const action = db.recoveryActions.find((a) => a.id === actionId);
    if (!action) return null;
    action.status = status;
    action.completedAt = status === 'completed' ? now() : null;
    return action;
  });
}

// ---------------------------------------------------------------------------
// Reassessments + trajectory
// ---------------------------------------------------------------------------

export function addReassessment(
  recoveryPlanId: string,
  result: ReassessmentResult,
  notes: string | null,
): Reassessment {
  return mutateDB((db) => {
    const r: Reassessment = { id: randomUUID(), recoveryPlanId, result, notes, createdAt: now() };
    db.reassessments.push(r);
    return r;
  });
}

export function getReassessmentsForPlan(planId: string): Reassessment[] {
  return readDB()
    .reassessments.filter((r) => r.recoveryPlanId === planId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function listReassessmentsForStudent(studentId: string): Reassessment[] {
  const db = readDB();
  const planIds = new Set(db.recoveryPlans.filter((p) => p.studentId === studentId).map((p) => p.id));
  return db.reassessments.filter((r) => planIds.has(r.recoveryPlanId));
}

export function addTrajectoryNote(
  studentId: string,
  summary: string,
  sourceType: TrajectoryNote['sourceType'],
  sourceId: string | null,
): TrajectoryNote {
  return mutateDB((db) => {
    const note: TrajectoryNote = { id: randomUUID(), studentId, summary, sourceType, sourceId, createdAt: now() };
    db.trajectoryNotes.push(note);
    return note;
  });
}

export function listTrajectoryNotes(studentId: string): TrajectoryNote[] {
  return readDB()
    .trajectoryNotes.filter((n) => n.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Analytics events (Section 50) — logged server-side only, never client-trusted
// ---------------------------------------------------------------------------

export function logEvent(studentId: string | null, eventType: string, payload?: Record<string, unknown>): void {
  mutateDB((db) => {
    const e: ProductEvent = {
      id: randomUUID(),
      studentId,
      eventType,
      payload: payload ?? null,
      createdAt: now(),
    };
    db.events.push(e);
  });
}
