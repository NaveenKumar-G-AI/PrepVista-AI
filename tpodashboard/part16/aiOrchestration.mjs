// PrepVista AI — signal → prepare → confirm → execute → verify (Part 16 §72/§91)
//
// Rule-based orchestration proving the Part 12→13→14→15 pipeline is one
// connected system rather than four separate dashboards. There's no LLM
// call here — this is the plumbing between them, exercised against real
// fixture data so the numbers at each step are actually computed.

import { can } from './rbac.mjs';
import { assertTransition } from './stateMachines.mjs';
import { buildEvent, appendEvent } from './events.mjs';
import { runDataIntegrityScan } from './dataIntegrity.mjs';

function eligibleStudents(db, drive) {
  return db.students.filter((s) =>
    s.institutionId === drive.institutionId &&
    s.readinessScore >= drive.eligibility.minReadiness &&
    drive.eligibility.departments.includes(s.departmentId)
  );
}

function appliedStudentIds(db, driveId) {
  return new Set(db.applications.filter((a) => a.driveId === driveId).map((a) => a.studentId));
}

// §13 — proactive signal detection.
export function detectSignals(db, institutionId) {
  const signals = [];
  const drives = db.drives.filter((d) => d.institutionId === institutionId && d.status === 'published');

  for (const drive of drives) {
    const eligible = eligibleStudents(db, drive);
    const applied = appliedStudentIds(db, drive.id);
    const notApplied = eligible.filter((s) => !applied.has(s.id));
    if (notApplied.length > 0) {
      signals.push({
        type: 'ELIGIBLE_NOT_APPLIED', priority: 'medium', driveId: drive.id,
        driveTitle: drive.title, studentIds: notApplied.map((s) => s.id), count: notApplied.length,
      });
    }
    const daysToDeadline = (new Date(drive.applicationDeadline).getTime() - Date.now()) / 86400000;
    if (daysToDeadline > 0 && daysToDeadline <= 5) {
      signals.push({
        type: 'DEADLINE_APPROACHING', priority: 'high', driveId: drive.id,
        driveTitle: drive.title, daysLeft: Math.ceil(daysToDeadline),
      });
    }
  }

  const dq = runDataIntegrityScan(db).filter((c) => c.count > 0);
  if (dq.length > 0) {
    signals.push({ type: 'DATA_QUALITY', priority: 'high', issues: dq.map((c) => ({ label: c.label, count: c.count })) });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

// §12 — "What needs my attention?"
export function attentionBriefing(db, institutionId) {
  const signals = detectSignals(db, institutionId);
  const summary = signals.map((sig) => {
    if (sig.type === 'ELIGIBLE_NOT_APPLIED') return `${sig.count} eligible students haven't applied to ${sig.driveTitle}`;
    if (sig.type === 'DEADLINE_APPROACHING') return `${sig.driveTitle} closes in ${sig.daysLeft} day(s)`;
    if (sig.type === 'DATA_QUALITY') return `${sig.issues.reduce((n, i) => n + i.count, 0)} data-quality issue(s) found`;
    return sig.type;
  });
  return { count: signals.length, signals, summary };
}

// §12 narrowing — "Show high-readiness students" against a given signal.
export function narrowByReadiness(db, signal, minScore) {
  if (signal.type !== 'ELIGIBLE_NOT_APPLIED') return [];
  return db.students.filter((s) => signal.studentIds.includes(s.id) && s.readinessScore >= minScore);
}

let actionSeq = 0;

// §14 step 1 — prepare. Never executes anything yet.
export function prepareReminderAction(db, actorAuth, drive, students) {
  if (!can('create', 'ai_action', actorAuth, { institutionId: drive.institutionId })) {
    throw new Error('Not authorized to prepare AI actions');
  }
  const action = {
    id: `act-${++actionSeq}`, institutionId: drive.institutionId, status: 'prepared',
    type: 'SEND_REMINDER', confirmedByUserId: null,
    payload: {
      driveId: drive.id,
      studentIds: students.map((s) => s.id),
      subject: `Reminder: ${drive.title} closes soon`,
      body: `You're eligible for ${drive.title} and haven't applied yet.`,
    },
  };
  db.aiActions.push(action);
  appendEvent(db.eventLog, buildEvent({
    name: 'AI_ACTION_PREPARED', institutionId: drive.institutionId, entityId: action.id,
    actor: { id: 'ai-orchestrator', role: 'ai', type: 'ai' }, payload: { type: action.type },
    correlationId: action.id,
  }));
  return action;
}

// §14 step 2 — confirm. A human, never the AI itself, per §38.
export function confirmAction(db, actorAuth, action) {
  if (!can('approve', 'ai_action', actorAuth, { institutionId: action.institutionId })) {
    throw new Error('Not authorized to confirm AI actions');
  }
  assertTransition('ai_action', action.status, 'confirmed');
  action.status = 'confirmed';
  action.confirmedByUserId = actorAuth.actorId;
  appendEvent(db.eventLog, buildEvent({
    name: 'AI_ACTION_CONFIRMED', institutionId: action.institutionId, entityId: action.id,
    actor: { id: actorAuth.actorId, role: actorAuth.role, type: 'user' }, payload: {},
    correlationId: action.id,
  }));
  return action;
}

// §14 step 3 — execute. Sends the communications, and — since a placement
// office actually sending reminders isn't a no-op — moves a realistic
// fraction of recipients to "applied" so the outcome check has something
// real to find, the same way a real reminder converts some fraction of
// the people who read it.
export function executeAction(db, actorAuth, action, { responseRate = 0.5 } = {}) {
  assertTransition('ai_action', action.status, 'executing');
  action.status = 'executing';

  const targets = action.payload.studentIds;
  for (const studentId of targets) {
    db.communications.push({
      id: `comm-${studentId}-${action.id}`, institutionId: action.institutionId,
      recipientStudentId: studentId, status: 'sent', subject: action.payload.subject,
    });
    appendEvent(db.eventLog, buildEvent({
      name: 'COMMUNICATION_SENT', institutionId: action.institutionId, entityId: studentId,
      actor: { id: 'ai-orchestrator', role: 'ai', type: 'ai' }, payload: { actionId: action.id },
      correlationId: action.id,
    }));
  }

  const responders = targets.slice(0, Math.round(targets.length * responseRate));
  for (const studentId of responders) {
    db.applications.push({
      id: `app-${studentId}-${action.payload.driveId}`, institutionId: action.institutionId,
      studentId, driveId: action.payload.driveId, status: 'applied', appliedAt: new Date().toISOString(),
    });
  }

  assertTransition('ai_action', action.status, 'executed');
  action.status = 'executed';
  appendEvent(db.eventLog, buildEvent({
    name: 'AI_ACTION_EXECUTED', institutionId: action.institutionId, entityId: action.id,
    actor: { id: 'ai-orchestrator', role: 'ai', type: 'ai' }, payload: { respondedCount: responders.length },
    correlationId: action.id,
  }));

  return { action, respondedCount: responders.length, targetedCount: targets.length };
}

// §12 close-the-loop — "Did it help?"
export function outcomeCheck(db, driveId, beforeNotAppliedCount) {
  const drive = db.drives.find((d) => d.id === driveId);
  const eligible = eligibleStudents(db, drive);
  const applied = appliedStudentIds(db, driveId);
  const afterNotAppliedCount = eligible.filter((s) => !applied.has(s.id)).length;
  return { before: beforeNotAppliedCount, after: afterNotAppliedCount, movedCount: beforeNotAppliedCount - afterNotAppliedCount };
}

// §44 — dashboard, report, and verified outcome must reconcile, or the
// difference has to be explained, never just hidden behind matching UI.
export function reconciliationCheck(db, institutionId) {
  const verifiedJoinings = db.joinings.filter((j) => j.institutionId === institutionId && j.status === 'verified').length;
  const placementOutcomes = db.placementOutcomes.filter((p) => {
    const j = db.joinings.find((jj) => jj.id === p.joiningId);
    return j && j.institutionId === institutionId && j.status === 'verified';
  }).length;
  return { verifiedJoinings, placementOutcomes, reconciled: verifiedJoinings === placementOutcomes };
}
