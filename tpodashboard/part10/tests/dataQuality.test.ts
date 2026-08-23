import assert from "node:assert/strict";
import type { TestCase } from "./testKit.js";
import { buildContainer } from "../src/container.js";
import {
  freshDb, INST, SEASON,
  insertStudent, insertApplication, insertOffer, insertJoining, insertInterview, placeStudent,
} from "./fixtures.js";
import { EvidenceRepository } from "../src/repositories/evidenceRepository.js";

function codesOf(list: { code: string }[]): string[] {
  return list.map((w) => w.code).sort();
}

export const tests: TestCase[] = [
  {
    name: "a fully clean, fully verified dataset raises no warnings or integrity issues",
    fn() {
      const db = freshDb();
      const evidence = new EvidenceRepository(db);
      for (let i = 0; i < 3; i++) {
        const { joiningId } = placeStudent(db);
        evidence.attach({
          institutionId: INST, entityType: "joining", entityId: joiningId,
          evidenceType: "joining_confirmation", sourceType: "document",
          sourceReference: "test", verified: true,
        });
      }
      const { services } = buildContainer(db);
      const { warnings, integrityIssues } = services.dataQualityService.getWarningsAndIssues(INST, SEASON);
      assert.deepEqual(warnings, []);
      assert.deepEqual(integrityIssues, []);

      const quality = services.dataQualityService.computeQualityScore(INST, SEASON);
      assert.equal(quality.score, 100);
      assert.equal(quality.status, "ready");
    },
  },
  {
    name: "each problem case is detected under its own warning/issue code, with the right counts",
    fn() {
      const db = freshDb();
      const evidence = new EvidenceRepository(db);

      // 1) unverified offer (otherwise clean placement)
      {
        const s = insertStudent(db);
        const a = insertApplication(db, s, { status: "offered" });
        const o = insertOffer(db, a, s, { status: "accepted", verified: false });
        const j = insertJoining(db, o, s, { status: "joined", verified: true });
        evidence.attach({ institutionId: INST, entityType: "joining", entityId: j, evidenceType: "x", sourceType: "document", sourceReference: "x", verified: true });
      }

      // 2) accepted offer, joining not verified -> incomplete joining
      {
        const s = insertStudent(db);
        const a = insertApplication(db, s, { status: "offered" });
        const o = insertOffer(db, a, s, { status: "accepted", verified: true });
        insertJoining(db, o, s, { status: "joined", verified: false });
      }

      // 3) joined without an accepted offer
      {
        const s = insertStudent(db);
        const a = insertApplication(db, s, { status: "offered" });
        const o = insertOffer(db, a, s, { status: "received", verified: true });
        const j = insertJoining(db, o, s, { status: "joined", verified: true });
        evidence.attach({ institutionId: INST, entityType: "joining", entityId: j, evidenceType: "x", sourceType: "document", sourceReference: "x", verified: true });
      }

      // 4) verified placement with no evidence attached
      {
        const s = insertStudent(db);
        const a = insertApplication(db, s, { status: "offered" });
        const o = insertOffer(db, a, s, { status: "accepted", verified: true });
        insertJoining(db, o, s, { status: "joined", verified: true });
      }

      // 5) offer exists without a matching selected/offered application status
      {
        const s = insertStudent(db);
        const a = insertApplication(db, s, { status: "applied" });
        const o = insertOffer(db, a, s, { status: "accepted", verified: true });
        const j = insertJoining(db, o, s, { status: "joined", verified: true });
        evidence.attach({ institutionId: INST, entityType: "joining", entityId: j, evidenceType: "x", sourceType: "document", sourceReference: "x", verified: true });
      }

      // 6) completed interview with no recorded result
      {
        const s = insertStudent(db);
        const a = insertApplication(db, s, { status: "interviewed" });
        insertInterview(db, a, { result: "pending", completedAt: "2099-01-04T00:00:00.000Z" });
      }

      // 7) two students that look like duplicates (same name + department)
      insertStudent(db, { name: "Dup Case", department: "CSE" });
      insertStudent(db, { name: "Dup Case", department: "CSE" });

      const { services } = buildContainer(db);
      const { warnings, integrityIssues } = services.dataQualityService.getWarningsAndIssues(INST, SEASON);

      assert.deepEqual(codesOf(warnings), ["incomplete_joining", "unverified_offers"].sort());
      assert.deepEqual(
        codesOf(integrityIssues),
        ["interview_result_missing", "joined_without_accepted_offer", "offer_without_selection", "possible_duplicate_student", "verified_without_evidence"].sort()
      );

      const byCode = Object.fromEntries([...warnings, ...integrityIssues].map((w) => [w.code, w.count]));
      assert.equal(byCode.unverified_offers, 1);
      assert.equal(byCode.incomplete_joining, 1);
      assert.equal(byCode.joined_without_accepted_offer, 1);
      assert.equal(byCode.verified_without_evidence, 1);
      assert.equal(byCode.offer_without_selection, 1);
      assert.equal(byCode.interview_result_missing, 1);
      assert.equal(byCode.possible_duplicate_student, 1);
    },
  },
  {
    name: "quality score drops and status downgrades as critical issues accumulate",
    fn() {
      const dbClean = freshDb();
      const ev1 = new EvidenceRepository(dbClean);
      const { joiningId } = placeStudent(dbClean);
      ev1.attach({ institutionId: INST, entityType: "joining", entityId: joiningId, evidenceType: "x", sourceType: "document", sourceReference: "x", verified: true });
      const cleanScore = buildContainer(dbClean).services.dataQualityService.computeQualityScore(INST, SEASON);

      const dbDirty = freshDb();
      // Several verified placements with NO evidence at all -> repeated critical issues.
      for (let i = 0; i < 4; i++) placeStudent(dbDirty);
      const dirtyScore = buildContainer(dbDirty).services.dataQualityService.computeQualityScore(INST, SEASON);

      assert.ok(dirtyScore.score < cleanScore.score, `expected dirty (${dirtyScore.score}) < clean (${cleanScore.score})`);
      assert.notEqual(dirtyScore.status, "ready");
    },
  },
];
