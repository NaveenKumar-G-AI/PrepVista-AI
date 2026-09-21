import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { analyzeTransfer } from "../../src/lib/growth/engine/transfer.ts";
import { analyzeRetention } from "../../src/lib/growth/engine/retention.ts";
import { analyzeIndependence } from "../../src/lib/growth/engine/independence.ts";
import { ev, daysAgoIso } from "../fixtures/evidenceFactory.ts";

const NOW = new Date("2026-08-20T00:00:00Z");

describe("analyzeTransfer", () => {
  test("counts only isTransfer=true evidence, ignores routine repeats of the same pattern", () => {
    const evidence = [
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", isTransfer: false }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(8, NOW), outcome: "SUCCESS", isTransfer: false }),
      ev({ dimension: "algorithmic_thinking", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", isTransfer: true, challengeFamily: "t1" }),
    ];
    const result = analyzeTransfer(evidence);
    assert.equal(result.transferEvidenceCount, 1);
    assert.equal(result.transferSuccessCount, 1);
  });

  test("transfer success rate trending up across the transfer-tagged subset is reported as POSITIVE", () => {
    const evidence = [
      ev({ dimension: "transfer", occurredAt: daysAgoIso(30, NOW), outcome: "FAILURE", isTransfer: true, challengeFamily: "t1" }),
      ev({ dimension: "transfer", occurredAt: daysAgoIso(25, NOW), outcome: "FAILURE", isTransfer: true, challengeFamily: "t2" }),
      ev({ dimension: "transfer", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", isTransfer: true, challengeFamily: "t3" }),
      ev({ dimension: "transfer", occurredAt: daysAgoIso(2, NOW), outcome: "SUCCESS", isTransfer: true, challengeFamily: "t4" }),
    ];
    assert.equal(analyzeTransfer(evidence).trend, "POSITIVE");
  });
});

describe("analyzeRetention", () => {
  test("a retention success right after routine practice (no real gap) does NOT count as confirmed retention", () => {
    const evidence = [
      ev({ dimension: "data_structures", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS" }),
      ev({ dimension: "data_structures", occurredAt: daysAgoIso(3, NOW), outcome: "SUCCESS", isRetentionCheck: true }),
    ];
    assert.equal(analyzeRetention(evidence, NOW).confirmedRetention, false);
  });

  test("a retention success after a genuine practice gap DOES count as confirmed retention", () => {
    const evidence = [
      ev({ dimension: "data_structures", occurredAt: daysAgoIso(40, NOW), outcome: "SUCCESS" }),
      ev({ dimension: "data_structures", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", isRetentionCheck: true }),
    ];
    assert.equal(analyzeRetention(evidence, NOW).confirmedRetention, true);
  });
});

describe("analyzeIndependence", () => {
  test("dropping assistance while performance holds up reads as POSITIVE independence trend", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(80, NOW), outcome: "SUCCESS", assistanceLevel: "HIGH" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(70, NOW), outcome: "SUCCESS", assistanceLevel: "HIGH" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "SUCCESS", assistanceLevel: "NONE" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(5, NOW), outcome: "SUCCESS", assistanceLevel: "LOW" }),
    ];
    assert.equal(analyzeIndependence(evidence, NOW).trend, "POSITIVE");
  });

  test("dropping assistance while performance ALSO collapses is not rewarded as independence gain", () => {
    const evidence = [
      ev({ dimension: "debugging", occurredAt: daysAgoIso(80, NOW), outcome: "SUCCESS", assistanceLevel: "HIGH" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(70, NOW), outcome: "SUCCESS", assistanceLevel: "HIGH" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(10, NOW), outcome: "FAILURE", assistanceLevel: "NONE" }),
      ev({ dimension: "debugging", occurredAt: daysAgoIso(5, NOW), outcome: "FAILURE", assistanceLevel: "NONE" }),
    ];
    assert.notEqual(analyzeIndependence(evidence, NOW).trend, "POSITIVE");
  });
});
