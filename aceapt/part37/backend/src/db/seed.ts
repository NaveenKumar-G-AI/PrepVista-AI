import { db } from './client';
import { capabilities, evidenceItems, roleCapabilityRequirements, roleProfiles, studentRoleTargets } from './schema';
import { newId } from '../utils/id';

/**
 * DEV/DEMO SEED ONLY — never run against a real tenant's data.
 *
 * This reproduces the exact worked example from the product brief (a
 * Backend Developer target role, section 6/70): Python and SQL backed by
 * strong multi-source evidence, REST APIs backed by one weaker practical
 * attempt, Testing backed only by a self-report, and System Design with no
 * evidence at all. Run `npm run db:seed` after `npm run db:push` (or
 * `db:migrate`) against a real Postgres instance, then hit
 * GET /api/v1/students/demo-student-1/readiness/<roleId printed below>.
 */

const TENANT_ID = 'demo-tenant';
const STUDENT_ID = 'demo-student-1';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

async function main() {
  const pythonId = newId('cap');
  const sqlId = newId('cap');
  const restId = newId('cap');
  const testingId = newId('cap');
  const systemDesignId = newId('cap');

  await db.insert(capabilities).values([
    { id: pythonId, tenantId: TENANT_ID, name: 'Python', freshnessWindowDays: 270 },
    { id: sqlId, tenantId: TENANT_ID, name: 'SQL', freshnessWindowDays: 270 },
    { id: restId, tenantId: TENANT_ID, name: 'REST APIs', freshnessWindowDays: 240 },
    { id: testingId, tenantId: TENANT_ID, name: 'Testing', freshnessWindowDays: 240 },
    { id: systemDesignId, tenantId: TENANT_ID, name: 'System Design', freshnessWindowDays: 365 },
  ]);

  const roleId = newId('role');
  await db.insert(roleProfiles).values({
    id: roleId,
    tenantId: TENANT_ID,
    name: 'Backend Developer',
    description: 'Builds and maintains server-side services, APIs, and data access layers.',
  });

  await db.insert(roleCapabilityRequirements).values([
    { id: newId('req'), roleId, capabilityId: pythonId, requiredLevel: 'STRONG', importance: 3 },
    { id: newId('req'), roleId, capabilityId: sqlId, requiredLevel: 'INTERMEDIATE', importance: 3 },
    { id: newId('req'), roleId, capabilityId: restId, requiredLevel: 'INTERMEDIATE', importance: 3 },
    { id: newId('req'), roleId, capabilityId: testingId, requiredLevel: 'INTERMEDIATE', importance: 2 },
    { id: newId('req'), roleId, capabilityId: systemDesignId, requiredLevel: 'BASIC', importance: 1 },
  ]);

  await db.insert(studentRoleTargets).values({
    id: newId('target'),
    studentId: STUDENT_ID,
    tenantId: TENANT_ID,
    roleId,
    isPrimary: true,
  });

  await db.insert(evidenceItems).values([
    // Python — three corroborating sources -> STRONG.
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: pythonId,
      sourceType: 'ASSESSMENT',
      occurredAt: daysAgo(70),
      score: 91,
      validationState: 'UNVALIDATED',
    },
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: pythonId,
      sourceType: 'PROJECT',
      occurredAt: daysAgo(30),
      outcome: 'COMPLETED',
      context: 'Built an inventory-management backend for the capstone project.',
      validationState: 'UNVALIDATED',
    },
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: pythonId,
      sourceType: 'SIMULATION',
      occurredAt: daysAgo(15),
      score: 85,
      outcome: 'PASSED',
      validationState: 'UNVALIDATED',
    },
    // SQL — mirrors the brief's own multi-source example (88% assessment, 81% simulation, project).
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: sqlId,
      sourceType: 'ASSESSMENT',
      occurredAt: daysAgo(60),
      score: 88,
      validationState: 'UNVALIDATED',
    },
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: sqlId,
      sourceType: 'SIMULATION',
      occurredAt: daysAgo(25),
      score: 81,
      outcome: 'PASSED',
      validationState: 'UNVALIDATED',
    },
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: sqlId,
      sourceType: 'PROJECT',
      occurredAt: daysAgo(10),
      outcome: 'COMPLETED',
      validationState: 'UNVALIDATED',
    },
    // REST APIs — training plus one middling coding test -> Developing, not Strong.
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: restId,
      sourceType: 'TRAINING',
      occurredAt: daysAgo(90),
      validationState: 'UNVALIDATED',
    },
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: restId,
      sourceType: 'CODING_TEST',
      occurredAt: daysAgo(20),
      score: 65,
      validationState: 'UNVALIDATED',
    },
    // Testing — only a self-report -> Limited. This is intentionally the seed's biggest, highest-priority gap.
    {
      id: newId('evi'),
      studentId: STUDENT_ID,
      tenantId: TENANT_ID,
      capabilityId: testingId,
      sourceType: 'SELF_REPORT',
      occurredAt: daysAgo(5),
      claimedLevel: 'INTERMEDIATE',
      validationState: 'SELF_ASSERTED',
    },
    // System Design — no evidence at all, intentionally, to demonstrate the UNKNOWN state.
  ]);

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log(`  tenantId:  ${TENANT_ID}`);
  // eslint-disable-next-line no-console
  console.log(`  studentId: ${STUDENT_ID}`);
  // eslint-disable-next-line no-console
  console.log(`  roleId:    ${roleId}`);
  // eslint-disable-next-line no-console
  console.log(`  Try: GET /api/v1/students/${STUDENT_ID}/readiness/${roleId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  });
