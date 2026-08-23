import assert from "node:assert/strict";
import type { TestCase } from "./testKit.js";
import { buildContainer } from "../src/container.js";
import {
  freshDb, seedStandardMetricDefinitions, INST, SEASON,
  insertStudent, insertApplication, insertOffer, insertJoining,
} from "./fixtures.js";

function buildHandCountedFunnelFixture(db: ReturnType<typeof freshDb>) {
  // 1 seeking student NOT eligible
  insertStudent(db, { eligible: false });
  // 1 more seeking, not eligible (total not-eligible = 2)
  insertStudent(db, { eligible: false });

  // eligible, never applied
  insertStudent(db);

  // eligible, applied only
  const s2 = insertStudent(db);
  insertApplication(db, s2, { status: "applied" });

  // eligible, shortlisted only
  const s3 = insertStudent(db);
  insertApplication(db, s3, { status: "shortlisted" });

  // eligible, interviewed only
  const s4 = insertStudent(db);
  insertApplication(db, s4, { status: "interviewed" });

  // eligible, selected but no offer record yet
  const s5 = insertStudent(db);
  insertApplication(db, s5, { status: "selected" });

  // eligible, offer received but not accepted
  const s6 = insertStudent(db);
  const a6 = insertApplication(db, s6, { status: "offered" });
  insertOffer(db, a6, s6, { status: "received" });

  // eligible, offer accepted but not yet joined
  const s7 = insertStudent(db);
  const a7 = insertApplication(db, s7, { status: "offered" });
  insertOffer(db, a7, s7, { status: "accepted" });

  // eligible, offer accepted, joined, verified — fully placed
  const s8 = insertStudent(db);
  const a8 = insertApplication(db, s8, { status: "offered" });
  const o8 = insertOffer(db, a8, s8, { status: "accepted" });
  insertJoining(db, o8, s8, { status: "joined", verified: true });

  // one student NOT seeking placement at all — must not appear anywhere in the funnel
  insertStudent(db, { seeking: false });
}

export const tests: TestCase[] = [
  {
    name: "funnel stage counts match a hand-counted fixture exactly",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      buildHandCountedFunnelFixture(db);
      const { services } = buildContainer(db);

      const funnel = services.reportingService.getExecutiveFunnel(INST, SEASON);
      const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));

      assert.equal(byStage.seeking, 10, "seeking");
      assert.equal(byStage.eligible, 8, "eligible");
      assert.equal(byStage.applied, 7, "applied");
      assert.equal(byStage.shortlisted, 6, "shortlisted");
      assert.equal(byStage.interviewed, 5, "interviewed");
      assert.equal(byStage.selected, 4, "selected");
      assert.equal(byStage.offer, 3, "offer");
      assert.equal(byStage.accepted, 2, "accepted");
      assert.equal(byStage.joined, 1, "joined");
      assert.equal(byStage.verified_placement, 1, "verified_placement");
    },
  },
  {
    name: "funnel conversion percentages match manual division",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      buildHandCountedFunnelFixture(db);
      const { services } = buildContainer(db);

      const funnel = services.reportingService.getExecutiveFunnel(INST, SEASON);
      const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f]));

      const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

      assert.ok(close(byStage.eligible.conversionFromPrevious!, 80)); // 8/10
      assert.ok(close(byStage.applied.conversionFromPrevious!, 87.5)); // 7/8
      assert.ok(close(byStage.shortlisted.conversionFromPrevious!, (6 / 7) * 100));
      assert.ok(close(byStage.selected.conversionFromPrevious!, 80)); // 4/5
      assert.ok(close(byStage.accepted.conversionFromPrevious!, (2 / 3) * 100));
      assert.ok(close(byStage.joined.conversionFromPrevious!, 50)); // 1/2
      assert.ok(close(byStage.verified_placement.conversionFromPrevious!, 100)); // 1/1
      assert.equal(funnel[0].conversionFromPrevious, null, "first stage has no prior stage to convert from");
    },
  },
  {
    name: "a student's SECOND application (after an earlier rejection) still counts them at their furthest stage",
    fn() {
      const db = freshDb();
      seedStandardMetricDefinitions(db);
      const { services } = buildContainer(db);

      const student = insertStudent(db);
      insertApplication(db, student, { status: "rejected", driveId: "drive-a", company: "Company A" });
      insertApplication(db, student, { status: "selected", driveId: "drive-b", company: "Company B" });

      const funnel = services.reportingService.getExecutiveFunnel(INST, SEASON);
      const byStage = Object.fromEntries(funnel.map((f) => [f.stage, f.count]));
      // Must be counted once at "selected" (their best outcome), not lost to the earlier rejection,
      // and not double-counted at "applied" for having two application rows.
      assert.equal(byStage.applied, 1);
      assert.equal(byStage.selected, 1);
    },
  },
  {
    name: "compareFunnels flags the stage with the largest regression first",
    fn() {
      const dbA = freshDb();
      seedStandardMetricDefinitions(dbA);
      const { services } = buildContainer(dbA);

      // Season "2099" (current, weaker at applied->shortlisted): 10 applied, only 3 shortlisted (30%).
      for (let i = 0; i < 10; i++) {
        const s = insertStudent(dbA, { season: "2099" });
        insertApplication(dbA, s, { status: i < 3 ? "shortlisted" : "applied", season: "2099" });
      }
      // Season "2098" (comparison, stronger at that same step): 10 applied, 9 shortlisted (90%).
      for (let i = 0; i < 10; i++) {
        const s = insertStudent(dbA, { season: "2098" });
        insertApplication(dbA, s, { status: i < 9 ? "shortlisted" : "applied", season: "2098" });
      }

      const deltas = services.reportingService.compareFunnels(INST, "2099", "2098");
      const worst = deltas[0];
      assert.equal(worst.fromStage, "applied");
      assert.equal(worst.toStage, "shortlisted");
      assert.ok(worst.deltaPoints! < -50, `expected a large negative delta, got ${worst.deltaPoints}`);
    },
  },
];
