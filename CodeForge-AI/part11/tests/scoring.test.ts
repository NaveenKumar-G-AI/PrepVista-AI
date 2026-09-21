import { describe, it, expect } from "vitest";
import { PF2048_TEMPLATE } from "@/content/incidents/pf-2048";
import {
  computeCategoryScores,
  computeOverall,
  computeEngineeringJudgment,
  computeIndependence,
  topStrengthAndGap,
} from "@/lib/engine/scoring";
import {
  ActionLogRow,
  HypothesisRow,
  IncidentEventRow,
  IncidentInstance,
  MessageRow,
  PostmortemRow,
} from "@/lib/engine/types";

function baseInstance(overrides: Partial<IncidentInstance> = {}): IncidentInstance {
  return {
    id: "inst-1",
    templateId: PF2048_TEMPLATE.id,
    ownerId: "user-1",
    code: "PF-1234",
    state: "EVALUATED",
    simStartedAt: new Date().toISOString(),
    simMinutesElapsed: 20,
    escalationLevel: 0,
    mitigated: true,
    permanentFixApplied: true,
    verified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function ev(eventType: string, simMinutesAt: number, payload: Record<string, unknown> = {}): IncidentEventRow {
  return {
    id: `ev-${Math.random()}`,
    incidentId: "inst-1",
    actorId: "user-1",
    eventType,
    payload,
    simMinutesAt,
    createdAt: new Date().toISOString(),
  };
}

function actionRow(actionType: string, targetServiceKey: string | null, simMinutesAt: number): ActionLogRow {
  return {
    id: `act-${Math.random()}`,
    incidentId: "inst-1",
    ownerId: "user-1",
    actionType: actionType as ActionLogRow["actionType"],
    targetServiceKey,
    idempotencyKey: `k-${Math.random()}`,
    params: {},
    result: {},
    simMinutesAt,
    createdAt: new Date().toISOString(),
  };
}

describe("scoring engine — brief CRITICAL TEST CASE 1: correct, evidence-driven investigation scores high", () => {
  it("gives high evidence/root-cause/investigation scores for a well-evidenced correct diagnosis", () => {
    const events: IncidentEventRow[] = [
      ev("INSPECT_METRICS", 1),
      ev("INSPECT_LOGS", 2, { evidenceKey: "deploy_v2140_before_symptom_onset" }),
      ev("INSPECT_LOGS", 3, { evidenceKey: "slow_query_employers_join" }),
      ev("INSPECT_TRACES", 4, { evidenceKey: "trace-incident-01" }),
      ev("INSPECT_DEPLOYMENT", 5),
      ev("ROLLBACK", 8, { isMitigation: true }),
    ];
    const hypotheses: HypothesisRow[] = [
      {
        id: "h1",
        incidentId: "inst-1",
        ownerId: "user-1",
        statement: "The v2.14.0 deploy added a query with no supporting index, causing sequential scans under load.",
        category: "ROOT_CAUSE",
        implicatedCauseKey: "missing_db_index",
        evidenceRefs: ["deploy_v2140_before_symptom_onset", "slow_query_employers_join", "trace-incident-01"],
        status: "CONFIRMED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const actionLog: ActionLogRow[] = [actionRow("ROLLBACK", "placement-api", 8), actionRow("DEPLOY_FIX", "placement-api", 15)];
    const postmortem: PostmortemRow = {
      id: "pm-1",
      incidentId: "inst-1",
      ownerId: "user-1",
      summary: "Application submissions failed at an 18% rate for roughly 30 minutes.",
      businessImpact: "18% of submissions failed; deadlines at risk for active applicants.",
      timeline: "Deploy at -21m, declared at -2m, mitigated at +8m, fixed at +15m.",
      rootCause: "Missing index on employers(verification_status) for the new v2.14.0 query.",
      contributingFactors: "Staging performance tests used a dataset far smaller than production.",
      detection: "Alert fired automatically; ownership taken promptly.",
      mitigation: "Rolled back placement-api to v2.13.2.",
      permanentFix: "Deployed v2.14.1 adding the missing composite index.",
      whatWentWell: "Evidence was gathered before acting; rollback restored service quickly.",
      whatWentWrong: "The missing index should have been caught by load testing.",
      preventiveActionKeys: ["add_db_index_migration", "expand_load_testing_dataset"],
      preventiveActionsNotes: "Add index-aware migration checks and production-scale load tests.",
      fiveWhys: ["Why did requests fail? Timeouts.", "Why timeouts? Slow DB queries.", "Why slow? Sequential scan.", "Why seq scan? No index.", "Why no index? Not caught in staging."],
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const scores = computeCategoryScores(PF2048_TEMPLATE, baseInstance(), events, hypotheses, actionLog, [], postmortem);

    expect(scores.rootCause).toBeGreaterThanOrEqual(90);
    expect(scores.evidenceQuality).toBeGreaterThanOrEqual(60);
    expect(scores.investigation).toBeGreaterThanOrEqual(60);
    expect(scores.mitigation).toBeGreaterThanOrEqual(90);
    expect(scores.permanentFix).toBeGreaterThanOrEqual(90);

    const overall = computeOverall(PF2048_TEMPLATE.scoringRubric, scores);
    expect(overall).toBeGreaterThanOrEqual(75);
  });
});

describe("scoring engine — brief CRITICAL TEST CASE 2: guessing the root cause without evidence scores low", () => {
  it("penalizes a confirmed guess with no supporting evidence and no real investigation", () => {
    const events: IncidentEventRow[] = [ev("ROLLBACK", 1, { isMitigation: true })]; // acted immediately, no investigation at all
    const hypotheses: HypothesisRow[] = [
      {
        id: "h1",
        incidentId: "inst-1",
        ownerId: "user-1",
        statement: "Probably the cache.",
        category: "ROOT_CAUSE",
        implicatedCauseKey: "redis_cache_outage", // a red herring, confirmed with zero evidence
        evidenceRefs: [],
        status: "CONFIRMED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const actionLog: ActionLogRow[] = [actionRow("ROLLBACK", "placement-api", 1)];

    const scores = computeCategoryScores(PF2048_TEMPLATE, baseInstance(), events, hypotheses, actionLog, [], null);

    expect(scores.rootCause).toBeLessThanOrEqual(20);
    expect(scores.evidenceQuality).toBeLessThanOrEqual(10);
    expect(scores.investigation).toBeLessThanOrEqual(40);

    const overall = computeOverall(PF2048_TEMPLATE.scoringRubric, scores);
    expect(overall).toBeLessThan(60);
  });

  it("does not reward opening every tool once as a substitute for real investigation ('random clicking')", () => {
    // Same 5 distinct investigative action types, but repeated 4x each with
    // no hypothesis ever formed — breadth without any resulting evidence use.
    const events: IncidentEventRow[] = [];
    const types = ["INSPECT_LOGS", "INSPECT_METRICS", "INSPECT_TRACES", "INSPECT_DEPLOYMENT", "RUN_DIAGNOSTIC"];
    let t = 0;
    for (let i = 0; i < 4; i++) {
      for (const type of types) {
        events.push(ev(type, t));
        t += 1;
      }
    }
    const scores = computeCategoryScores(PF2048_TEMPLATE, baseInstance({ mitigated: false, permanentFixApplied: false }), events, [], [], [], null);
    // Investigation breadth score caps out (all 5 types used), but with zero
    // hypotheses/evidence attached, evidence quality and root cause must stay low.
    expect(scores.evidenceQuality).toBe(0);
    expect(scores.rootCause).toBeLessThanOrEqual(15);
  });
});

describe("scoring engine — mitigation vs permanent fix distinction", () => {
  it("does not penalize choosing a valid mitigation before a permanent fix", () => {
    const instance = baseInstance({ mitigated: true, permanentFixApplied: false });
    const actionLog: ActionLogRow[] = [actionRow("ROLLBACK", "placement-api", 5)];
    const scores = computeCategoryScores(PF2048_TEMPLATE, instance, [ev("ROLLBACK", 5)], [], actionLog, [], null);
    expect(scores.mitigation).toBe(100); // ROLLBACK is OPTIMAL validity for this template
    expect(scores.permanentFix).toBeLessThan(scores.mitigation); // not yet fixed, but not zeroed out either
    expect(scores.permanentFix).toBeGreaterThan(0);
  });

  it("scores a RISKY mitigation lower than an OPTIMAL one, even though both technically mitigated", () => {
    const viaScale = computeCategoryScores(
      PF2048_TEMPLATE,
      baseInstance({ mitigated: true }),
      [],
      [],
      [actionRow("SCALE_SERVICE", "placement-api", 3)], // RISKY, not actually flagged is_mitigation in this template
      [],
      null
    );
    const viaRollback = computeCategoryScores(
      PF2048_TEMPLATE,
      baseInstance({ mitigated: true }),
      [],
      [],
      [actionRow("ROLLBACK", "placement-api", 3)], // OPTIMAL, is_mitigation=true
      [],
      null
    );
    expect(viaRollback.mitigation).toBeGreaterThan(viaScale.mitigation);
  });
});

describe("engineering judgment", () => {
  it("excludes read-only investigation from the judgment average (already scored under Investigation)", () => {
    const onlyLooking = computeEngineeringJudgment(PF2048_TEMPLATE, [], [actionRow("INSPECT_LOGS", null, 1), actionRow("INSPECT_METRICS", null, 2)]);
    expect(onlyLooking).toBe(30); // "no consequential actions yet" default, not inflated by safe reads
  });

  it("rewards choosing OPTIMAL consequential actions over RISKY ones", () => {
    const good = computeEngineeringJudgment(PF2048_TEMPLATE, [ev("INSPECT_LOGS", 1)], [actionRow("ROLLBACK", "placement-api", 5)]);
    const bad = computeEngineeringJudgment(PF2048_TEMPLATE, [ev("INSPECT_LOGS", 1)], [actionRow("SCALE_SERVICE", "placement-api", 5)]);
    expect(good).toBeGreaterThan(bad);
  });

  it("penalizes acting before any investigation", () => {
    const investigatedFirst = computeEngineeringJudgment(
      PF2048_TEMPLATE,
      [ev("INSPECT_LOGS", 1)],
      [actionRow("ROLLBACK", "placement-api", 5)]
    );
    const actedFirst = computeEngineeringJudgment(
      PF2048_TEMPLATE,
      [ev("INSPECT_LOGS", 10)],
      [actionRow("ROLLBACK", "placement-api", 1)]
    );
    expect(investigatedFirst).toBeGreaterThan(actedFirst);
  });
});

describe("independence tracking", () => {
  it("counts hints and AI usage without treating them as punitive by themselves", () => {
    const events: IncidentEventRow[] = [
      ev("INSPECT_LOGS", 1),
      ev("ASSISTANCE_USED", 2, { mode: "CONCEPT_HELP" }),
      ev("AI_COACH_REQUESTED", 3),
    ];
    const summary = computeIndependence(events);
    expect(summary.hintsUsed).toBe(1);
    expect(summary.aiCallsMade).toBe(1);
    expect(summary.assistanceModesUsed).toContain("CONCEPT_HELP");
    expect(summary.rootCauseRevealed).toBe(false);
  });

  it("flags when strong guidance revealed the root cause directly", () => {
    const events: IncidentEventRow[] = [ev("ASSISTANCE_USED", 1, { mode: "STRONG_GUIDANCE", revealedRootCause: true })];
    expect(computeIndependence(events).rootCauseRevealed).toBe(true);
  });
});

describe("topStrengthAndGap", () => {
  it("picks the highest and lowest scoring categories with human-readable labels", () => {
    const { topStrength, topGap, nextRecommendation } = topStrengthAndGap({
      detection: 90,
      investigation: 85,
      evidenceQuality: 80,
      rootCause: 88,
      mitigation: 95,
      permanentFix: 84,
      communication: 40,
      prevention: 60,
    });
    expect(topStrength.length).toBeGreaterThan(0);
    expect(topGap.length).toBeGreaterThan(0);
    expect(nextRecommendation.length).toBeGreaterThan(0);
    expect(topGap).not.toBe(topStrength);
  });
});
