'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAIConfig } = require('../src/config');
const { createProvider } = require('../src/providers/modelRouter');
const { createAuditLog } = require('../src/security/auditLog');
const { buildToolRegistry } = require('../src/tools/index');
const { AIPlacementOfficer } = require('../src/orchestrator');
const { ROLES } = require('../src/security/permissionGuard');
const { INSTITUTION_ID } = require('../src/services/mockData');

function makeOfficer() {
  const config = loadAIConfig({ AI_PROVIDER: 'mock', NODE_ENV: 'test' });
  const provider = createProvider(config);
  const auditLog = createAuditLog();
  const registry = buildToolRegistry({ auditLog });
  return { officer: new AIPlacementOfficer({ provider, registry, config, auditLog }), registry, auditLog };
}

test('confirming an action twice replays the same result instead of sending twice (spec section 90)', async () => {
  const { officer } = makeOfficer();
  const user = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  const proposal = await officer.proposeAction({
    user,
    toolName: 'send_message',
    params: { driveId: 'drive_abc_tech', recipientStudentIds: ['stu_0001', 'stu_0002'], body: 'test reminder' },
  });

  const first = await officer.confirmAction({ user, proposalId: proposal.id });
  const second = await officer.confirmAction({ user, proposalId: proposal.id });

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(first.id, second.id, 'Replay must return the exact same send record, not a new one');
});

test('a different user cannot confirm someone else\'s proposal', async () => {
  const { officer } = makeOfficer();
  const proposer = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  const attacker = { id: 'u2', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  const proposal = await officer.proposeAction({
    user: proposer,
    toolName: 'send_message',
    params: { driveId: 'drive_abc_tech', recipientStudentIds: ['stu_0001'], body: 'test' },
  });
  await assert.rejects(() => officer.confirmAction({ user: attacker, proposalId: proposal.id }));
});

test('confirming an unknown proposal id fails clearly', async () => {
  const { officer } = makeOfficer();
  const user = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  await assert.rejects(() => officer.confirmAction({ user, proposalId: 'not-a-real-id' }));
});

test('a READ tool never needs proposeAction/confirmAction at all', async () => {
  const { registry } = makeOfficer();
  const user = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  const result = await registry.executeTool('get_offers', {}, user);
  assert.equal(result.success, true);
});

test('prepare_message (PREPARE level) executes directly with no confirmation, and has no side effect', async () => {
  const { registry } = makeOfficer();
  const user = { id: 'u1', role: ROLES.TPO_ADMIN, institutionId: INSTITUTION_ID };
  const result = await registry.executeTool('prepare_message', { driveId: 'drive_abc_tech' }, user);
  assert.equal(result.success, true);
  assert.ok(result.data.draft.body.length > 0);
});
