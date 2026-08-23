// PrepVista AI — Part 16 integration demo & self-test
// Run: node run-part16-demo.mjs
//
// Everything below actually executes against the fixture data in
// fixtures/seed.mjs. Nothing here is a canned or hardcoded result — every
// number printed is computed at run time, in the spirit of §35/§84: don't
// claim a result you haven't actually produced.

import { seed } from './fixtures/seed.mjs';
import { runTenantIsolationSuite } from './lib/tenantIsolation.mjs';
import { can, assertNotRecruiterRole } from './lib/rbac.mjs';
import { canTransition } from './lib/stateMachines.mjs';
import { buildEvent, appendEvent, makeIdempotentProcessor } from './lib/events.mjs';
import { runDataIntegrityScan } from './lib/dataIntegrity.mjs';
import {
  attentionBriefing, narrowByReadiness, prepareReminderAction,
  confirmAction, executeAction, outcomeCheck, reconciliationCheck,
} from './lib/aiOrchestration.mjs';
import { scanDirectory } from './scripts/scan-fake-features.mjs';

const results = { pass: 0, fail: 0, sectionCount: 0 };
function section(title) { console.log(`\n=== ${title} ===`); results.sectionCount += 1; }
function check(label, condition) {
  const ok = !!condition;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`);
  results[ok ? 'pass' : 'fail'] += 1;
  return ok;
}

const db = seed();

// ---------------------------------------------------------------------
section('1. Tenant isolation (§8)');
for (const r of runTenantIsolationSuite(db)) check(r.label, r.pass);

// ---------------------------------------------------------------------
section('2. RBAC (§10, §38)');
try { assertNotRecruiterRole('recruiter'); check('assertNotRecruiterRole blocks "recruiter"', false); }
catch { check('assertNotRecruiterRole blocks "recruiter"', true); }

const tpoA = { actorId: 'usr-tpohead-a', role: 'tpo_head', institutionId: 'inst-a' };
const coordA = { actorId: 'usr-deptcoord-a', role: 'department_coordinator', institutionId: 'inst-a', departmentId: 'dept-cse' };
const mgmtA = { actorId: 'usr-mgmt-a', role: 'management', institutionId: 'inst-a' };
const studentAditi = { actorId: 'stu-001', role: 'student', institutionId: 'inst-a' };

check('tpo_head can update any student', can('update', 'student', tpoA, { institutionId: 'inst-a', ownerStudentId: 'stu-010' }));
check('department_coordinator can view own-department student', can('view', 'student', coordA, { institutionId: 'inst-a', departmentId: 'dept-cse' }));
check("department_coordinator CANNOT view another department's student", !can('view', 'student', coordA, { institutionId: 'inst-a', departmentId: 'dept-mech' }));
check('management CANNOT update an application (view-only)', !can('update', 'application', mgmtA, { institutionId: 'inst-a' }));
check('student can view their own application', can('view', 'application', studentAditi, { institutionId: 'inst-a', ownerStudentId: 'stu-001' }));
check("student CANNOT view another student's application", !can('view', 'application', studentAditi, { institutionId: 'inst-a', ownerStudentId: 'stu-002' }));

// ---------------------------------------------------------------------
section('3. Status transitions (§34)');
check('drive: draft → published is legal', canTransition('drive', 'draft', 'published'));
check('drive: draft → closed is illegal (must publish first)', !canTransition('drive', 'draft', 'closed'));
check('offer: published → accepted is legal', canTransition('offer', 'published', 'accepted'));
check('ai_action: prepared → executing is illegal (must confirm first)', !canTransition('ai_action', 'prepared', 'executing'));

// ---------------------------------------------------------------------
section('4. Event idempotency & ordering (§26–27)');
const processed = makeIdempotentProcessor();
let sideEffectCount = 0;
await processed('evt-dup-1', async () => { sideEffectCount += 1; });
await processed('evt-dup-1', async () => { sideEffectCount += 1; }); // duplicate — should no-op
check('duplicate event id only processed once', sideEffectCount === 1);

const testLog = [];
let orderingRejected = false;
try {
  appendEvent(testLog, buildEvent({ name: 'JOINING_CONFIRMED', institutionId: 'inst-a', entityId: 'join-test', actor: { id: 'sys', role: 'system', type: 'system' }, payload: {}, correlationId: 'c1' }));
} catch { orderingRejected = true; }
check('JOINING_CONFIRMED before OFFER_ACCEPTED is rejected', orderingRejected);

appendEvent(testLog, buildEvent({ name: 'OFFER_ACCEPTED', institutionId: 'inst-a', entityId: 'join-test', actor: { id: 'sys', role: 'system', type: 'system' }, payload: {}, correlationId: 'c1' }));
let orderingAcceptedAfter = false;
try {
  appendEvent(testLog, buildEvent({ name: 'JOINING_CONFIRMED', institutionId: 'inst-a', entityId: 'join-test', actor: { id: 'sys', role: 'system', type: 'system' }, payload: {}, correlationId: 'c1' }));
  orderingAcceptedAfter = true;
} catch { /* leave false */ }
check('JOINING_CONFIRMED accepted once OFFER_ACCEPTED is logged first', orderingAcceptedAfter);

// ---------------------------------------------------------------------
section('5. Data integrity scan (§33)');
const dqResults = runDataIntegrityScan(db);
for (const r of dqResults) check(`${r.label}: found ${r.count}`, r.count > 0);

// ---------------------------------------------------------------------
section('6. Fake/demo code sweep (§35–36)');
const scanResults = await scanDirectory(new URL('./legacy-code-sample', import.meta.url).pathname);
check('scanner flags the seeded fake markers in legacy-code-sample/', scanResults.totalHits > 0);
console.log(`  ${scanResults.totalHits} marker(s) found across ${scanResults.filesWithHits} file(s).`);

// ---------------------------------------------------------------------
section('7. The "wow flow" (§72/§91) — Institution A, live');
const briefing = attentionBriefing(db, 'inst-a');
console.log(`TPO: "What needs my attention?"`);
console.log(`AI:  "I found ${briefing.count} thing(s) requiring attention."`);
briefing.summary.forEach((line) => console.log(`     - ${line}`));

const topSignal = briefing.signals
  .filter((s) => s.type === 'ELIGIBLE_NOT_APPLIED')
  .sort((a, b) => b.count - a.count)[0];
check('top signal is a real ELIGIBLE_NOT_APPLIED signal with students attached', !!topSignal && topSignal.studentIds.length > 0);

console.log(`\nTPO: "Show high-readiness students."`);
const highReadiness = narrowByReadiness(db, topSignal, 85);
console.log(`AI:  "${highReadiness.length} of those ${topSignal.count} have readiness 85+: ${highReadiness.map((s) => s.name).join(', ')}."`);
check('narrowing by readiness actually reduced the count', highReadiness.length < topSignal.count);

console.log(`\nTPO: "Prepare a reminder."`);
const drive = db.drives.find((d) => d.id === topSignal.driveId);
const action = prepareReminderAction(db, tpoA, drive, highReadiness);
check('action created in "prepared" state, not yet executed', action.status === 'prepared');

console.log(`AI:  "Reminder drafted for ${highReadiness.length} students about ${drive.title}. Confirm to send?"`);
console.log(`TPO: "Confirm."`);
confirmAction(db, tpoA, action);
check('action moved to "confirmed" with a human confirmer attached', action.status === 'confirmed' && action.confirmedByUserId === 'usr-tpohead-a');

const beforeNotApplied = topSignal.count;
const execResult = executeAction(db, tpoA, action);
check('action executed and communications actually sent', action.status === 'executed');
console.log(`AI:  "Sent to ${execResult.targetedCount}. ${execResult.respondedCount} applied within the window."`);

console.log(`\n[Command Centre recomputes...]`);
const briefingAfter = attentionBriefing(db, 'inst-a');
const afterSameSignal = briefingAfter.signals.find((s) => s.driveId === topSignal.driveId);
console.log(`Same signal now: ${afterSameSignal ? afterSameSignal.count : 0} eligible-not-applied (was ${topSignal.count}).`);

console.log(`\nTPO: "Did it help?"`);
const outcome = outcomeCheck(db, topSignal.driveId, beforeNotApplied);
console.log(`AI:  "Yes — ${outcome.movedCount} of the ${outcome.before} moved to applied."`);
check('outcome check shows real, non-fabricated movement', outcome.movedCount > 0 && outcome.movedCount === execResult.respondedCount);

console.log(`\n[Management view]`);
const recon = reconciliationCheck(db, 'inst-a');
console.log(`Verified joinings: ${recon.verifiedJoinings} | Reports show: ${recon.placementOutcomes} | Reconciled: ${recon.reconciled}`);
check('dashboard, report, and verified outcome reconcile (§44)', recon.reconciled);

// ---------------------------------------------------------------------
console.log(`\n\n=== TRUTH TABLE ===`);
console.log(`${results.pass} passed, ${results.fail} failed, across ${results.sectionCount} sections.`);
if (results.fail > 0) process.exitCode = 1;
