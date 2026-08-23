'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolRegistry } = require('../src/tools/index');
const { createAuditLog } = require('../src/security/auditLog');
const { ROLES } = require('../src/security/permissionGuard');
const { INSTITUTION_ID } = require('../src/services/mockData');

function tpo() {
  return { id: 'u_tpo', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
}

test('get_unapplied_eligible_students intersects readiness + drive eligibility + application status correctly', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });

  const allUnapplied = await registry.executeTool('get_unapplied_eligible_students', { driveId: 'drive_abc_tech' }, tpo());
  assert.equal(allUnapplied.data.count, 83, 'spec section 110\'s own worked example: 83 unapplied-eligible for the ABC drive');

  const highReadiness = await registry.executeTool('get_unapplied_eligible_students', { driveId: 'drive_abc_tech', minReadiness: 75 }, tpo());
  assert.equal(highReadiness.data.count, 23, 'spec section 110: 23 of the 83 are high-readiness');

  // Every item in the high-readiness result must also appear in the full unapplied result (subset property).
  const allIds = new Set(allUnapplied.data.items.map((s) => s.id));
  assert.ok(highReadiness.data.items.every((s) => allIds.has(s.id)));
  assert.ok(highReadiness.data.items.every((s) => s.readinessScore >= 75));
});

test('a student who HAS applied never appears in the unapplied-eligible result, even if high-readiness', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const applications = await registry.executeTool('get_drive_applications', { driveId: 'drive_abc_tech' }, tpo());
  const appliedIds = new Set(applications.data.items.map((a) => a.studentId));

  const unapplied = await registry.executeTool('get_unapplied_eligible_students', { driveId: 'drive_abc_tech' }, tpo());
  assert.ok(unapplied.data.items.every((s) => !appliedIds.has(s.id)));
});

test('department readiness gap flows through to the round-conversion comparison used for root-cause questions (spec sections 35, 71)', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const conversion = await registry.executeTool('get_round_conversion', {}, tpo());
  assert.equal(conversion.success, true);
  const rates = conversion.data.ratesPct;
  const weakest = Object.entries(rates).sort((a, b) => a[1] - b[1])[0][0];
  assert.equal(weakest, 'ECE', 'the dataset is constructed so ECE is the genuinely weakest department, not asserted');
  assert.ok(conversion.data.institutionMedianPct - rates.ECE >= 5, 'the gap must be real and non-trivial, not a rounding artifact');
});

test('executive metrics below-target flag is only set when the computed rate is actually below the configured target', async () => {
  const registry = buildToolRegistry({ auditLog: createAuditLog() });
  const metrics = await registry.executeTool('get_executive_metrics', {}, tpo());
  assert.equal(metrics.success, true);
  assert.equal(metrics.data.belowTarget, metrics.data.placementRatePct < metrics.data.targetPct);
});
