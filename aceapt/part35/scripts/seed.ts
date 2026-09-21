// Dev-only fixture data (Section 58). Never point this at a production store —
// it exists so the closed-loop system (outcome -> pattern -> bottleneck ->
// recovery -> reassessment -> trajectory) is visible immediately, without
// waiting on real usage. Run with `npm run seed` (or `npm run seed:reset`).
import { readDB, writeDB } from '../src/lib/db/store';
import {
  addReassessment,
  addTrajectoryNote,
  createOutcome,
  createRecoveryPlan,
  getOrCreateDevStudent,
  updateRecoveryActionStatus,
  updateRecoveryPlanStatus,
} from '../src/lib/db/repository';
import { RECOVERY_TEMPLATES, buildFallbackRationale } from '../src/lib/engines/recovery';
import { FAILURE_CATEGORY_LABELS } from '../src/lib/constants';

const DEV_STUDENT_ID = process.env.DEV_STUDENT_ID || 'dev-student-1';

function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString();
}

// Backdates every record belonging to `ids` (opportunity/stage/evidence rows
// created in the same createOutcome call) to a believable point in the past —
// a seed-only technique so the Journey timeline reads naturally.
function backdate(opportunityId: string, iso: string) {
  const db = readDB();
  const opp = db.opportunities.find((o) => o.id === opportunityId);
  if (opp) opp.createdAt = iso;
  for (const s of db.stages.filter((s) => s.opportunityId === opportunityId)) {
    s.completedAt = iso;
  }
  for (const e of db.evidence.filter((e) => e.opportunityId === opportunityId)) {
    e.createdAt = iso;
  }
  writeDB(db);
}

function backdateTrajectory(id: string, iso: string) {
  const db = readDB();
  const note = db.trajectoryNotes.find((n) => n.id === id);
  if (note) note.createdAt = iso;
  writeDB(db);
}

function backdateRecovery(planId: string, created: string, started: string, completed: string) {
  const db = readDB();
  const plan = db.recoveryPlans.find((p) => p.id === planId);
  if (plan) {
    plan.createdAt = created;
    plan.startedAt = started;
    plan.completedAt = completed;
  }
  writeDB(db);
}

async function main() {
  const student = getOrCreateDevStudent(DEV_STUDENT_ID, 'Aditi Sharma');
  console.log(`Seeding demo data for ${student.name} (${student.id})`);

  // --- Opportunity A: first technical rejection, WITH direct recruiter feedback ---
  const a = createOutcome({
    studentId: student.id,
    companyName: 'TechNova Solutions',
    roleTitle: 'Backend Developer',
    roleCategory: 'Backend Developer',
    source: 'campus_drive',
    targetAlignment: 'aligned',
    furthestStageKey: 'technical_round',
    furthestStageStatus: 'rejected',
    customStageLabel: null,
    recruiterFeedbackText: 'Technical depth was insufficient for the role — struggled with system design questions.',
    studentReflectionText: null,
  });
  backdate(a.opportunity.id, weeksAgo(10));
  // Pre-classify the recruiter feedback so the demo shows DIRECT_EVIDENCE immediately
  // without requiring a live AI call. Mirrors what classifyFeedback() would do.
  {
    const db = readDB();
    const ev = db.evidence.find((e) => e.opportunityId === a.opportunity.id && e.source === 'recruiter_feedback');
    if (ev) ev.failureCategory = 'TECHNICAL_PERFORMANCE';
    writeDB(db);
  }

  // --- Opportunity B: second technical rejection, no feedback ---
  const b = createOutcome({
    studentId: student.id,
    companyName: 'Verdant Systems',
    roleTitle: 'Backend Developer',
    roleCategory: 'Backend Developer',
    source: 'self_applied',
    targetAlignment: 'aligned',
    furthestStageKey: 'technical_round',
    furthestStageStatus: 'rejected',
    customStageLabel: null,
    recruiterFeedbackText: null,
    studentReflectionText: 'Felt shaky on the database indexing question.',
  });
  backdate(b.opportunity.id, weeksAgo(8));

  // --- Opportunity C: third technical rejection -> repeated_pattern ---
  const c = createOutcome({
    studentId: student.id,
    companyName: 'Orbit Cloud Labs',
    roleTitle: 'Backend Developer',
    roleCategory: 'Backend Developer',
    source: 'campus_drive',
    targetAlignment: 'aligned',
    furthestStageKey: 'technical_round',
    furthestStageStatus: 'rejected',
    customStageLabel: null,
    recruiterFeedbackText: null,
    studentReflectionText: null,
  });
  backdate(c.opportunity.id, weeksAgo(6));

  // --- Recovery plan triggered off Opportunity C, completed, reassessed as improved ---
  const category = 'TECHNICAL_PERFORMANCE' as const;
  const template = RECOVERY_TEMPLATES[category];
  const { plan } = createRecoveryPlan({
    studentId: student.id,
    opportunityId: c.opportunity.id,
    failureCategory: category,
    patternStrength: 'repeated_pattern',
    rationaleFallback: buildFallbackRationale(category, 'repeated_pattern'),
    rationaleAI: null,
    primary: template.primary,
    supporting: template.supporting,
  });
  const t1 = addTrajectoryNote(
    student.id,
    `Bottleneck identified: ${FAILURE_CATEGORY_LABELS[category]}. Recovery plan started.`,
    'outcome',
    c.opportunity.id,
  );
  updateRecoveryPlanStatus(plan.id, 'started');
  const dbForActions = readDB();
  const primaryAction = dbForActions.recoveryActions.find((ac) => ac.recoveryPlanId === plan.id && ac.actionType === 'primary');
  if (primaryAction) updateRecoveryActionStatus(primaryAction.id, 'completed');
  updateRecoveryPlanStatus(plan.id, 'completed');
  const t2 = addTrajectoryNote(student.id, `Recovery completed: ${FAILURE_CATEGORY_LABELS[category]}.`, 'recovery_completed', plan.id);
  addReassessment(plan.id, 'improved', 'Simulation score improved noticeably on system design questions.');
  const t3 = addTrajectoryNote(student.id, `Reassessment on ${FAILURE_CATEGORY_LABELS[category]}: showed improvement.`, 'reassessment', plan.id);

  backdateRecovery(plan.id, weeksAgo(6), weeksAgo(5), weeksAgo(4));
  backdateTrajectory(t1.id, weeksAgo(6));
  backdateTrajectory(t2.id, weeksAgo(4));
  backdateTrajectory(t3.id, weeksAgo(4));

  // --- Opportunity D: reached further (final round) — visible progress ---
  const d = createOutcome({
    studentId: student.id,
    companyName: 'Fintrust Bank',
    roleTitle: 'Backend Developer',
    roleCategory: 'Backend Developer',
    source: 'referral',
    targetAlignment: 'aligned',
    furthestStageKey: 'final_round',
    furthestStageStatus: 'rejected',
    customStageLabel: null,
    recruiterFeedbackText: null,
    studentReflectionText: null,
  });
  backdate(d.opportunity.id, weeksAgo(3));

  // --- Opportunity E: cleared the technical round this time ---
  const e = createOutcome({
    studentId: student.id,
    companyName: 'Bluepeak Systems',
    roleTitle: 'Backend Developer',
    roleCategory: 'Backend Developer',
    source: 'self_applied',
    targetAlignment: 'aligned',
    furthestStageKey: 'technical_round',
    furthestStageStatus: 'passed',
    customStageLabel: null,
    recruiterFeedbackText: null,
    studentReflectionText: null,
  });
  backdate(e.opportunity.id, weeksAgo(1));

  console.log('Seed complete:');
  console.log(`  Opportunities: ${[a, b, c, d, e].length}`);
  console.log(`  Recovery plan: ${plan.id} (completed, reassessed as improved)`);
  console.log('Run `npm run dev` and open /career to see it.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
