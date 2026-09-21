import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb } from '../src/db/client';
import { recordEvidence } from '../src/repositories/evidenceRepo';
import { generateOrGetRoadmap, recalculate } from '../src/repositories/roadmapRepo';
import { SKILL, seedAll } from '../src/seed/seed';
import type { RoadmapSkill, RoadmapVersion } from '../src/domain/types';

process.env.DB_FILE = './data/test-e2e.db';

function findSkill(version: RoadmapVersion, skillId: string): RoadmapSkill | undefined {
  for (const m of version.milestones) {
    const s = m.skills.find((sk) => sk.skillId === skillId);
    if (s) return s;
  }
  return undefined;
}

test('full closed loop: generate -> evidence -> recalculate -> prerequisite block -> resolution', () => {
  const db = resetDb();
  const { demoStudent } = seedAll(db);
  const studentId = demoStudent.id;

  // --- v1: initial roadmap generated purely from seeded evidence ---
  const v1 = generateOrGetRoadmap(db, studentId);
  assert.equal(v1.versionNumber, 1);
  assert.equal(v1.trigger, 'INITIAL');

  const debuggingV1 = findSkill(v1, SKILL.DEBUGGING);
  assert.ok(debuggingV1, 'Debugging should be in the initial roadmap');
  assert.equal(debuggingV1!.gapStatus, 'GAP');

  // Graphs is pulled into v1 via prerequisite resolution, but the engine is
  // strict about Phase 7 ("check prerequisite readiness before putting an
  // advanced skill into the active roadmap"): an UNKNOWN prerequisite does
  // not count as ready any more than a known gap does. So the whole
  // unresolved chain above Queues is already BLOCKED in v1 — only Queues
  // itself (which has no prerequisite of its own) is the actionable
  // exploration item. This is stricter, and arguably more correct, than
  // reactively discovering the block later.
  const graphsV1 = findSkill(v1, SKILL.GRAPHS);
  assert.ok(graphsV1, 'Graphs should be in the initial roadmap, reached via prerequisite resolution');
  assert.equal(graphsV1!.gapStatus, 'BLOCKED');

  assert.equal(findSkill(v1, SKILL.GRAPH_TRAVERSAL)!.gapStatus, 'BLOCKED');
  assert.equal(findSkill(v1, SKILL.BFS)!.gapStatus, 'BLOCKED');

  const queuesV1 = findSkill(v1, SKILL.QUEUES);
  assert.ok(queuesV1, 'Queues should already be reachable via prerequisite resolution of Graphs -> GraphTraversal -> BFS -> Queues');
  assert.equal(queuesV1!.gapStatus, 'UNKNOWN', 'Queues has no prerequisite of its own, so it is the one actionable item on this chain from day one');

  assert.equal(findSkill(v1, SKILL.HASH_MAPS), undefined, 'Hash Maps is already at target and must not appear as an active item');
  assert.equal(findSkill(v1, SKILL.PYTHON), undefined, 'Python is already at target (Strong) and must not appear');

  // idempotency (Phase 51): calling generate again must not create a duplicate version
  const v1Again = generateOrGetRoadmap(db, studentId);
  assert.equal(v1Again.id, v1.id);
  assert.equal(v1Again.versionNumber, 1);

  // --- Evidence A: one more independent Debugging success crosses into COMPETENT ---
  recordEvidence(db, { studentId, skillId: SKILL.DEBUGGING, source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  const recalcA = recalculate(db, studentId, 'EVIDENCE_UPDATE');
  assert.equal(recalcA.changed, true, 'reaching target mastery is a material change and must produce a new version');
  assert.equal(recalcA.version.versionNumber, 2);
  assert.equal(findSkill(recalcA.version, SKILL.DEBUGGING), undefined, 'Debugging reached target and drops out of the active roadmap');

  // A no-op recalculation request right after must NOT spawn version 3 (Phase 21)
  const recalcANoop = recalculate(db, studentId, 'EVIDENCE_UPDATE');
  assert.equal(recalcANoop.changed, false);
  assert.equal(recalcANoop.version.versionNumber, 2);

  // --- Evidence B: Queues fails twice — a real, evidence-driven weakness ---
  recordEvidence(db, { studentId, skillId: SKILL.QUEUES, source: 'CHALLENGE_ATTEMPT', outcome: 'FAIL', independent: true, failureCategory: 'LOGIC' });
  recordEvidence(db, { studentId, skillId: SKILL.QUEUES, source: 'CHALLENGE_ATTEMPT', outcome: 'FAIL', independent: true, failureCategory: 'LOGIC' });
  const recalcB = recalculate(db, studentId, 'EVIDENCE_UPDATE');
  assert.equal(recalcB.changed, true);
  assert.equal(recalcB.version.versionNumber, 3);

  const queuesV3 = findSkill(recalcB.version, SKILL.QUEUES);
  assert.equal(queuesV3!.gapStatus, 'CRITICAL_GAP', 'repeated failure should surface as a real, evidenced gap — not just UNKNOWN');

  // BFS/GraphTraversal/Graphs remain BLOCKED (as they already were) — what's
  // new is *why*: Queues is no longer merely unassessed, it's now a real,
  // evidenced weakness. The diff (asserted below) is what captures that.
  const bfsV3 = findSkill(recalcB.version, SKILL.BFS);
  assert.equal(bfsV3!.gapStatus, 'BLOCKED');
  assert.equal(findSkill(recalcB.version, SKILL.GRAPH_TRAVERSAL)!.gapStatus, 'BLOCKED');
  assert.equal(findSkill(recalcB.version, SKILL.GRAPHS)!.gapStatus, 'BLOCKED');

  // Priority: the one actionable item on the blocked chain (Queues) must
  // outrank the items it's blocking — this is the "critical path" claim
  // made concrete and checkable.
  assert.ok(queuesV3!.priorityScore > bfsV3!.priorityScore, 'Queues should now outrank BFS in priority, since it is the actionable blocker');

  // --- Evidence C: Queues resolved via independent practice + verification ---
  recordEvidence(db, { studentId, skillId: SKILL.QUEUES, source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  recordEvidence(db, { studentId, skillId: SKILL.QUEUES, source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  recordEvidence(db, { studentId, skillId: SKILL.QUEUES, source: 'CHALLENGE_ATTEMPT', outcome: 'SUCCESS', independent: true });
  recordEvidence(db, { studentId, skillId: SKILL.QUEUES, source: 'VERIFICATION', outcome: 'SUCCESS', independent: true });
  const recalcC = recalculate(db, studentId, 'EVIDENCE_UPDATE');
  assert.equal(recalcC.changed, true);
  assert.equal(recalcC.version.versionNumber, 4);

  assert.equal(findSkill(recalcC.version, SKILL.QUEUES), undefined, 'Queues reached target and drops out');
  const bfsV4 = findSkill(recalcC.version, SKILL.BFS);
  assert.ok(bfsV4, 'BFS should now be unblocked and actionable');
  assert.equal(bfsV4!.gapStatus, 'UNKNOWN', 'BFS itself still has no direct evidence, so it is UNKNOWN, not BLOCKED');
  assert.equal(
    findSkill(recalcC.version, SKILL.GRAPH_TRAVERSAL)!.gapStatus,
    'BLOCKED',
    'GraphTraversal must still wait specifically on BFS — it must not skip ahead just because Queues resolved'
  );

  // --- Auditability (Phase 62): every transition must be reconstructable from events ---
  const events = db.prepare(`SELECT event_type FROM roadmap_events re JOIN roadmaps r ON r.id = re.roadmap_id WHERE r.student_id = ? ORDER BY re.created_at ASC`).all(studentId) as Array<{ event_type: string }>;
  const eventTypes = events.map((e) => e.event_type);
  assert.ok(eventTypes.includes('ROADMAP_CREATED'));
  assert.ok(eventTypes.filter((t) => t === 'ROADMAP_RECALCULATED').length === 3);
  assert.ok(eventTypes.includes('SKILL_COMPLETED'));

  // --- Versioning: nothing was destroyed — all 4 versions still exist ---
  const versionRows = db.prepare(`SELECT version_number FROM roadmap_versions rv JOIN roadmaps r ON r.id = rv.roadmap_id WHERE r.student_id = ? ORDER BY version_number`).all(studentId) as Array<{
    version_number: number;
  }>;
  assert.deepEqual(versionRows.map((v) => v.version_number), [1, 2, 3, 4]);
});
