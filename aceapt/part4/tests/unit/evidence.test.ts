import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyDimension, diagnoseSkill, overallSkillLevel } from "../../src/domain/evidence.js";
import { emptyEvidence, type SkillEvidenceRecord } from "../../src/domain/types.js";

function dim(accuracy: number | null, attempts: number, avgResponseTimeMs: number | null = null, daysAgo = 1) {
  return { accuracy, attempts, avgResponseTimeMs, lastAssessedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString() };
}

describe("classifyDimension", () => {
  test("zero attempts is NONE", () => {
    assert.equal(classifyDimension(dim(null, 0)), "NONE");
  });
  test("below moderate-attempt threshold is LIMITED regardless of accuracy", () => {
    assert.equal(classifyDimension(dim(1.0, 1)), "LIMITED");
  });
  test("high accuracy but too few attempts for STRONG falls to DEVELOPING", () => {
    assert.equal(classifyDimension(dim(0.9, 4)), "DEVELOPING");
  });
  test("high accuracy with enough attempts is STRONG", () => {
    assert.equal(classifyDimension(dim(0.85, 6)), "STRONG");
  });
  test("mid accuracy is DEVELOPING", () => {
    assert.equal(classifyDimension(dim(0.6, 5)), "DEVELOPING");
  });
  test("low accuracy is LIMITED, not a separate WEAK bucket", () => {
    assert.equal(classifyDimension(dim(0.2, 5)), "LIMITED");
  });
});

describe("overallSkillLevel", () => {
  test("no evidence at all is NOT_ASSESSED", () => {
    assert.equal(overallSkillLevel(emptyEvidence("s1", "sk1")), "NOT_ASSESSED");
  });
  test("strong foundation alone is only DEVELOPING, never STRONG — Phase 14 guard", () => {
    const e: SkillEvidenceRecord = { ...emptyEvidence("s1", "sk1"), foundation: dim(0.95, 8), application: dim(0.3, 5) };
    assert.equal(overallSkillLevel(e), "DEVELOPING");
  });
  test("strong foundation AND application without verifiedAt is STRONG, not VERIFIED", () => {
    const e: SkillEvidenceRecord = { ...emptyEvidence("s1", "sk1"), foundation: dim(0.9, 8), application: dim(0.9, 8) };
    assert.equal(overallSkillLevel(e), "STRONG");
  });
  test("strong foundation AND application WITH verifiedAt is VERIFIED", () => {
    const e: SkillEvidenceRecord = { ...emptyEvidence("s1", "sk1"), foundation: dim(0.9, 8), application: dim(0.9, 8), verifiedAt: new Date().toISOString() };
    assert.equal(overallSkillLevel(e), "VERIFIED");
  });
});

describe("diagnoseSkill", () => {
  test("no attempts anywhere -> FOUNDATION gap", () => {
    const d = diagnoseSkill(emptyEvidence("s1", "sk1"));
    assert.equal(d.primaryGap, "FOUNDATION");
  });

  test("Phase 60 scenario: strong foundation, developing application -> APPLICATION gap", () => {
    const e: SkillEvidenceRecord = { ...emptyEvidence("s1", "sk1"), foundation: dim(0.9, 8), application: dim(0.55, 4) };
    const d = diagnoseSkill(e);
    assert.equal(d.primaryGap, "APPLICATION");
  });

  test("Phase 14: a rough patch on advanced application must not read as FOUNDATION weakness", () => {
    // foundation itself is comfortably STRONG; only application is behind.
    const e: SkillEvidenceRecord = { ...emptyEvidence("s1", "sk1"), foundation: dim(0.95, 10), application: dim(0.3, 6) };
    const d = diagnoseSkill(e);
    assert.notEqual(d.primaryGap, "FOUNDATION");
    assert.equal(d.primaryGap, "APPLICATION");
  });

  test("stale but previously strong -> STALE, not FOUNDATION (Phase 31-32)", () => {
    const e: SkillEvidenceRecord = {
      ...emptyEvidence("s1", "sk1"),
      foundation: dim(0.9, 8),
      application: dim(0.9, 8),
      verifiedAt: new Date(Date.now() - 45 * 86_400_000).toISOString(),
    };
    const d = diagnoseSkill(e);
    assert.equal(d.primaryGap, "STALE");
  });

  test("repeated identical error signature -> MISCONCEPTION, takes priority over everything else", () => {
    const e: SkillEvidenceRecord = {
      ...emptyEvidence("s1", "sk1"),
      foundation: dim(0.9, 8),
      recentErrorSignatures: ["sign_error", "sign_error", "sign_error"],
    };
    const d = diagnoseSkill(e);
    assert.equal(d.primaryGap, "MISCONCEPTION");
  });

  test("familiar strong, variant weak -> TRANSFER gap", () => {
    const e: SkillEvidenceRecord = {
      ...emptyEvidence("s1", "sk1"),
      foundation: dim(0.9, 8),
      application: dim(0.9, 8),
      transferFamiliar: dim(0.9, 8),
      transferVariant: dim(0.3, 4),
    };
    const d = diagnoseSkill(e);
    assert.equal(d.primaryGap, "TRANSFER");
  });

  test("everything strong -> NONE (candidate for ADVANCE)", () => {
    const e: SkillEvidenceRecord = {
      ...emptyEvidence("s1", "sk1"),
      foundation: dim(0.9, 8),
      application: dim(0.9, 8),
      transferVariant: dim(0.9, 8),
    };
    const d = diagnoseSkill(e);
    assert.equal(d.primaryGap, "NONE");
  });
});
