/**
 * Run with `npm run demo`.
 *
 * Prints the section-56 closed-loop story end to end, computed from real
 * (synthetic) event data through the real signal engine - nothing printed
 * here is separately hand-written copy. Also writes demo-output.json,
 * which the static preview HTML in outputs/ reads so the numbers shown
 * there are the same numbers this script actually computed.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { eventStore } from '../infrastructure/store';
import { loadDemoData, daysAgoIso } from './seedEvents';
import { runAllSignalDetectors, detectCrossStudentQuestionFriction } from '../domain/signals';
import { buildBehaviorProfile } from '../domain/profileBuilder';
import { buildProfileSummary } from '../domain/explain/explanationEngine';
import { recommendPlanChange } from '../sample-adaptive-planner/planAdapter';

function line(): void {
  console.log('-'.repeat(72));
}

async function main(): Promise<void> {
  const count = await loadDemoData();
  console.log(`Loaded ${count} synthetic demo events.\n`);

  // Day -10 at a fixed hour, deliberately >=1 full day clear of the last
  // "before" session (day -11) and the PLAN_MODIFIED event (day -9) - see
  // seedEvents.ts for why the margin is a full day, not a fraction of one.
  const beforeCutoff = new Date(daysAgoIso(10, 12, 0));
  const afterCutoff = new Date();

  const arjunEvents = await eventStore.query({ studentId: 'demo-arjun' });

  const beforeSignals = runAllSignalDetectors(arjunEvents, 'demo-arjun', beforeCutoff);
  const beforeProfile = buildBehaviorProfile('demo-arjun', beforeSignals, arjunEvents, beforeCutoff);

  const afterSignals = runAllSignalDetectors(arjunEvents, 'demo-arjun', afterCutoff);
  const afterProfile = buildBehaviorProfile('demo-arjun', afterSignals, arjunEvents, afterCutoff);

  line();
  console.log('STUDENT: demo-arjun');
  console.log('STEP 1 - Practices infrequently, and actual session length falls well short of the plan');
  line();
  console.log(`Consistency (as of day -7.5):  ${beforeProfile.dimensions.consistency.level}`);
  console.log(`  -> ${beforeProfile.dimensions.consistency.explanation}`);
  console.log(`Plan adherence (as of day -7.5): ${beforeProfile.dimensions.planAdherence.level}`);
  console.log(`  -> ${beforeProfile.dimensions.planAdherence.explanation}`);

  const realismSignal = beforeSignals.find((s) => s.signalType === 'PLAN_REALISM_MISMATCH');
  line();
  console.log('STEP 2 - Feature 11 observes behavior and identifies a signal');
  line();
  if (realismSignal) {
    console.log(`SIGNAL: ${realismSignal.signalType} (confidence ${realismSignal.confidence})`);
    console.log(`  -> ${realismSignal.explanation}`);
  } else {
    console.log('(PLAN_REALISM_MISMATCH not triggered at this cutoff - see supportingMetrics on plan adherence above.)');
  }

  line();
  console.log('STEP 3 - Sample downstream planner (NOT Feature 11 - see sample-adaptive-planner/) reacts');
  line();
  const recommendation = recommendPlanChange(beforeSignals, 60);
  console.log(`Previous planned session: ${recommendation.previousSessionMinutes} min`);
  console.log(`Recommended session: ${recommendation.recommendedSessionMinutes ?? '(no change)'} min`);
  console.log('"Why did ACEAPT change my plan?" panel would show:');
  recommendation.reasons.forEach((r) => console.log(`  - ${r}`));

  line();
  console.log('STEP 4 - Student becomes more consistent under the shorter plan; ACEAPT observes improvement');
  line();
  console.log(`Consistency (as of today):     ${afterProfile.dimensions.consistency.level}`);
  console.log(`  -> ${afterProfile.dimensions.consistency.explanation}`);
  console.log(`Plan adherence (as of today):  ${afterProfile.dimensions.planAdherence.level}`);
  console.log(`  -> ${afterProfile.dimensions.planAdherence.explanation}`);
  console.log(`Session pattern (as of today): ${afterProfile.dimensions.sessionPattern.level}`);

  // ---- demo-priya: contrast case ----
  line();
  console.log('CONTRAST STUDENT: demo-priya (consistent, strong challenge engagement)');
  line();
  const priyaEvents = await eventStore.query({ studentId: 'demo-priya' });
  const priyaSignals = runAllSignalDetectors(priyaEvents, 'demo-priya', afterCutoff);
  const priyaProfile = buildBehaviorProfile('demo-priya', priyaSignals, priyaEvents, afterCutoff);
  console.log(buildProfileSummary(priyaProfile));
  Object.entries(priyaProfile.dimensions).forEach(([k, d]) => console.log(`  ${k}: ${d.level} (confidence ${d.confidence})`));

  // ---- demo-neha: cold start ----
  line();
  console.log('COLD START STUDENT: demo-neha (one session, two days ago)');
  line();
  const nehaEvents = await eventStore.query({ studentId: 'demo-neha' });
  const nehaSignals = runAllSignalDetectors(nehaEvents, 'demo-neha', afterCutoff);
  const nehaProfile = buildBehaviorProfile('demo-neha', nehaSignals, nehaEvents, afterCutoff);
  console.log(`isColdStart: ${nehaProfile.isColdStart}`);
  console.log(buildProfileSummary(nehaProfile));

  // ---- cross-student content friction ----
  line();
  console.log('CONTENT FRICTION: q-hard-104, checked across the whole event store (not one student)');
  line();
  const allEvents = [
    ...(await eventStore.query({ studentId: 'demo-a1' })),
    ...(await eventStore.query({ studentId: 'demo-a2' })),
    ...(await eventStore.query({ studentId: 'demo-a3' })),
    ...(await eventStore.query({ studentId: 'demo-a4' })),
    ...(await eventStore.query({ studentId: 'demo-a5' })),
  ];
  const contentFriction = detectCrossStudentQuestionFriction(allEvents, 'q-hard-104', afterCutoff);
  console.log(contentFriction ? contentFriction.explanation : '(not enough distinct students to call this a content signal)');

  // ---- export for the static preview ----
  const outPath = join(__dirname, '..', '..', 'demo-output.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        arjun: { before: beforeProfile, after: afterProfile, planChange: recommendation },
        priya: priyaProfile,
        neha: nehaProfile,
        contentFriction,
      },
      null,
      2,
    ),
  );
  line();
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
