// PrepVista AI — cross-tenant access check (Part 16 §8)
//
// getResource simulates an API handler: look a record up by id (the way a
// naive query would), then require rbac.can() to agree the actor's
// institution matches before returning it. This tests the actual
// mechanism — it doesn't just assume the fixture happens to be
// well-scoped.

import { can } from './rbac.mjs';

const RESOURCE_TABLES = {
  student: 'students',
  drive: 'drives',
  application: 'applications',
  offer: 'offers',
  joining: 'joinings',
};

export function getResource(db, resource, id, auth) {
  const table = db[RESOURCE_TABLES[resource]];
  const record = table?.find((r) => r.id === id);
  if (!record) return { status: 404 };

  const allowed = can('view', resource, auth, {
    institutionId: record.institutionId,
    departmentId: record.departmentId,
    ownerStudentId: record.studentId ?? record.id,
  });
  return allowed ? { status: 200, data: record } : { status: 403 };
}

export function runTenantIsolationSuite(db) {
  const results = [];
  const record = (label, pass) => results.push({ label, pass });

  const tpoA = { actorId: 'usr-tpohead-a', role: 'tpo_head', institutionId: 'inst-a' };
  const tpoB = { actorId: 'usr-tpohead-b', role: 'tpo_head', institutionId: 'inst-b' };

  // A must never read B's records...
  const bTargets = [
    ['student', 'stu-b-001'],
    ['drive', 'drv-crestline-b'],
    ['application', 'app-b-001'],
  ];
  for (const [resource, id] of bTargets) {
    const res = getResource(db, resource, id, tpoA);
    record(`Institution A cannot read B's ${resource} (${id})`, res.status === 403);
  }

  // ...and B must never read A's, across a wider set since A has more data.
  const aTargets = [
    ['student', 'stu-001'],
    ['drive', 'drv-zenith-sde'],
    ['application', 'app-001'],
    ['offer', 'off-001'],
    ['joining', 'join-001'],
  ];
  for (const [resource, id] of aTargets) {
    const res = getResource(db, resource, id, tpoB);
    record(`Institution B cannot read A's ${resource} (${id})`, res.status === 403);
  }

  // Sanity check: each institution can still read its own.
  record('Institution A can read its own student', getResource(db, 'student', 'stu-001', tpoA).status === 200);
  record('Institution B can read its own student', getResource(db, 'student', 'stu-b-001', tpoB).status === 200);

  return results;
}
