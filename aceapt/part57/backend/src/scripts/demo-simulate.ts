/**
 * DEV-ONLY FIXTURE GENERATOR - not part of the product, not part of seeding.
 *
 * Run this after `npm run seed` if you want the frontend to have something
 * to look at without manually POSTing to /api/usage a dozen times. It
 * simulates one fake student ("demo-student-1") using the seeded global
 * shortcuts over time, so you can see:
 *   - Quarter Method cross the evidence thresholds into TRUSTED
 *   - ...then regress into NEEDS_REVIEW after a run of bad attempts
 *   - Half Method sitting at RELIABLE ("Developing" bucket)
 *   - Decimal Shift barely started ("Developing" bucket, low evidence)
 *   - A discovery candidate accumulate evidence and become test-ready
 *
 * This is exactly the kind of "fabricated reliability" the spec forbids
 * (sec. 294) if it were ever presented as real - it isn't wired into any
 * user-facing flow, and real usage always goes through recordUsage() the
 * same way this script calls it: nothing here bypasses the trust math.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/client';
import { recordUsage } from '../services/performanceService';
import { recordDiscoveryEvidence } from '../services/discoveryService';
import { startTraining, submitTraining } from '../services/trainingService';
import { env } from '../config/env';

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
db.exec(schema);

const tenantId = env.DEFAULT_TENANT_ID;
const studentId = 'demo-student-1';

function getShortcutIdByName(name: string): string {
  const row = db.prepare(`SELECT shortcut_id FROM shortcuts WHERE canonical_name = ? AND tenant_id = ?`).get(name, tenantId) as
    | { shortcut_id: string }
    | undefined;
  if (!row) throw new Error(`Seed shortcut "${name}" not found - run "npm run seed" first.`);
  return row.shortcut_id;
}

const quarterId = getShortcutIdByName('Quarter Method');
const halfId = getShortcutIdByName('Half Method');
const decimalId = getShortcutIdByName('Decimal Shift');

console.log('[demo] simulating Quarter Method -> TRUSTED...');
for (let i = 0; i < 11; i += 1) {
  recordUsage({
    tenantId,
    studentId,
    shortcutId: quarterId,
    correct: i !== 3, // one miss along the way
    applied: true,
    responseTimeMs: 8000 + Math.round(Math.random() * 1000),
    baselineTimeMs: 18000,
    difficulty: i % 3 === 0 ? 'HARD' : 'MEDIUM',
    novelty: i < 8 ? 'FAMILIAR' : 'NOVEL',
    mode: 'PRACTICE',
    timed: i >= 9,
  });
}

console.log('[demo] simulating Quarter Method regressing -> NEEDS_REVIEW...');
for (let i = 0; i < 5; i += 1) {
  recordUsage({
    tenantId,
    studentId,
    shortcutId: quarterId,
    correct: i < 2, // mostly wrong now
    applied: true,
    responseTimeMs: 9000,
    baselineTimeMs: 18000,
    mode: 'PRACTICE',
  });
}

console.log('[demo] simulating Half Method -> RELIABLE ("Developing")...');
for (let i = 0; i < 6; i += 1) {
  recordUsage({
    tenantId,
    studentId,
    shortcutId: halfId,
    correct: i !== 2,
    applied: true,
    responseTimeMs: 7000,
    baselineTimeMs: 12000,
    mode: 'PRACTICE',
  });
}

console.log('[demo] simulating Decimal Shift -> just started ("Developing")...');
for (let i = 0; i < 2; i += 1) {
  recordUsage({
    tenantId,
    studentId,
    shortcutId: decimalId,
    correct: i === 0,
    applied: true,
    responseTimeMs: 6000,
    baselineTimeMs: 10000,
    mode: 'PRACTICE',
  });
}

console.log('[demo] simulating a discovery candidate becoming test-ready...');
for (let i = 0; i < 5; i += 1) {
  recordDiscoveryEvidence({
    tenantId,
    studentId,
    candidateStrategyType: 'RATIO_METHOD',
    questionFamilyId: 'demo-ratio-family',
    methodSignature: 'Cross-multiplies then simplifies before dividing',
    success: i !== 1,
  });
}

console.log('[demo] logging a couple of training attempts...');
const started = startTraining({ tenantId, studentId, activityType: 'SELECTION', shortcutId: quarterId });
submitTraining({
  tenantId,
  studentId,
  shortcutId: quarterId,
  activityType: 'SELECTION',
  promptRef: started.promptRef,
  response: { chosen: 'Quarter Method' },
  correct: true,
});

console.log('[demo] done. Try GET /api/shortcuts/mine with header "x-dev-student-id: demo-student-1".');
