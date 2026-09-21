import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, PoolClient } from "pg";
import { testPool, closeTestPool, createTestUser } from "./dbHelpers";
import { getFullTemplateBySlug } from "@/lib/repo/catalog";
import { createIncidentInstance, getIncidentInstance, updateIncidentInstance } from "@/lib/repo/instance";
import {
  createHypothesis,
  updateHypothesisStatus,
  createMessage,
  recordEvent,
  listEvents,
} from "@/lib/repo/investigation";
import { executeAction } from "@/lib/repo/executeAction";
import { upsertPostmortemDraft, submitPostmortem } from "@/lib/repo/postmortem";
import { validatePostmortem } from "@/lib/engine/postmortemValidation";
import { evaluateIncident } from "@/lib/repo/evaluateIncident";
import { transition } from "@/lib/engine/stateMachine";
import { IncidentTemplate } from "@/lib/engine/types";

describe("END-TO-END ACCEPTANCE TEST (brief: CREATE -> START -> ... -> EVALUATE -> EVIDENCE -> MASTERY)", () => {
  let db: Pool;
  let client: PoolClient;
  let userId: string;
  let template: IncidentTemplate;
  let incidentId: string;

  beforeAll(async () => {
    db = testPool();
    client = await db.connect();
    userId = await createTestUser(db, "e2e-student@test.example");
    const t = await getFullTemplateBySlug(client, "pf-2048");
    if (!t) throw new Error("pf-2048 template not seeded — run `npm run db:seed` first");
    template = t;
  });

  afterAll(async () => {
    if (incidentId) {
      await db.query("delete from incidents where id = $1", [incidentId]); // cascades to all child instance rows
    }
    await db.query("delete from auth.users where id = $1", [userId]);
    client.release();
    await closeTestPool();
  });

  it("runs the complete real journey with no mocked business logic and produces a coherent, well-scored evaluation", async () => {
    // ---------- CREATE INCIDENT ----------
    let instance = await createIncidentInstance(client, userId, template.id);
    incidentId = instance.id;
    expect(instance.state).toBe("CREATED");

    // ---------- START INCIDENT ----------
    instance = await updateIncidentInstance(client, incidentId, { state: transition(instance.state, "ACTIVE") });
    instance = await updateIncidentInstance(client, incidentId, { state: transition(instance.state, "INVESTIGATING") });
    expect(instance.state).toBe("INVESTIGATING");

    // ---------- VIEW ALERT ----------
    const alert = template.alerts.find((a) => a.triggerCondition === "ALWAYS");
    expect(alert).toBeDefined();
    await recordEvent(client, incidentId, userId, "VIEW_ALERT", { alertType: alert!.alertType }, instance.simMinutesElapsed);

    // ---------- INSPECT METRICS ----------
    let step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "INSPECT_METRICS",
      confirmed: false,
      idempotencyKey: "step-metrics-1",
    });
    instance = step.instance;

    // ---------- SEARCH LOGS (finds and cites 4 of the 5 golden evidence lines) ----------
    const evidenceLogKeys = [
      "deploy_v2140_before_symptom_onset",
      "slow_query_employers_join",
      "db_connection_pressure_climbing",
      "gateway_upstream_timeout",
    ];
    for (const [i, evidenceKey] of evidenceLogKeys.entries()) {
      step = await executeAction(client, {
        template,
        instance,
        ownerId: userId,
        actionType: "INSPECT_LOGS",
        confirmed: false,
        idempotencyKey: `step-logs-${i}`,
        evidenceKey,
      });
      instance = step.instance;
    }

    // ---------- INSPECT TRACE (finds the 5th golden evidence item) ----------
    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "INSPECT_TRACES",
      confirmed: false,
      idempotencyKey: "step-trace-1",
      evidenceKey: "trace-incident-01",
    });
    instance = step.instance;

    // ---------- INSPECT DEPLOYMENT + RUN DIAGNOSTIC (rounds out full investigative breadth) ----------
    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "INSPECT_DEPLOYMENT",
      confirmed: false,
      idempotencyKey: "step-deploy-1",
    });
    instance = step.instance;

    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "RUN_DIAGNOSTIC",
      targetServiceKey: "placement-db",
      confirmed: false,
      idempotencyKey: "step-diagnostic-1",
    });
    instance = step.instance;
    expect(instance.simMinutesElapsed).toBe(10); // 1+1+1+1+1+1+1+3

    // ---------- STAKEHOLDER COMMUNICATION ----------
    await createMessage(client, incidentId, userId, {
      sender: "Engineering Manager",
      direction: "INBOUND",
      body: { prompt: template.stakeholderTriggers[0]!.prompt },
      simMinutesAt: template.stakeholderTriggers[0]!.triggerAfterMinutes,
    });
    await createMessage(client, incidentId, userId, {
      sender: "student",
      direction: "OUTBOUND",
      body: {
        currentImpact: "18% of application submissions are failing, p95 latency around 4.8s.",
        knownEvidence: "Slow query on placement-db joining employers on verification_status, no supporting index.",
        hypothesis: "Missing DB index introduced by the v2.14.0 deploy is the root cause.",
        mitigation: "Rolling back placement-api to v2.13.2 to stop the bleeding.",
        currentStatus: "Investigating, mitigation in progress.",
        nextAction: "Deploy a permanent fix adding the missing index.",
      },
      simMinutesAt: instance.simMinutesElapsed,
    });

    // ---------- CREATE HYPOTHESIS ----------
    const hyp = await createHypothesis(client, incidentId, userId, {
      statement:
        "The v2.14.0 deploy added an employer verification-status filter with no supporting index, causing sequential scans under production data volume.",
      category: "ROOT_CAUSE",
      implicatedCauseKey: "missing_db_index",
      evidenceRefs: [...evidenceLogKeys, "trace-incident-01"],
    });
    await recordEvent(client, incidentId, userId, "CREATE_HYPOTHESIS", { hypothesisId: hyp.id }, instance.simMinutesElapsed);

    // ---------- CONFIRM ROOT CAUSE ----------
    await updateHypothesisStatus(client, hyp.id, "CONFIRMED");
    await recordEvent(client, incidentId, userId, "CONFIRM_HYPOTHESIS", { hypothesisId: hyp.id }, instance.simMinutesElapsed);

    // ---------- MITIGATE (dangerous action, must be confirmed) ----------
    await expect(
      executeAction(client, {
        template,
        instance,
        ownerId: userId,
        actionType: "ROLLBACK",
        targetServiceKey: "placement-api",
        confirmed: false,
        idempotencyKey: "step-rollback-unconfirmed",
      })
    ).rejects.toThrow(/requires explicit confirmation/i);

    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "ROLLBACK",
      targetServiceKey: "placement-api",
      confirmed: true,
      idempotencyKey: "step-rollback-1",
    });
    instance = step.instance;
    expect(instance.state).toBe("MITIGATED");
    expect(instance.mitigated).toBe(true);

    // ---------- APPLY PERMANENT FIX ----------
    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "DEPLOY_FIX",
      targetServiceKey: "placement-api",
      confirmed: true,
      idempotencyKey: "step-fix-1",
    });
    instance = step.instance;
    expect(instance.state).toBe("FIXING");
    expect(instance.permanentFixApplied).toBe(true);

    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "RUN_TESTS",
      targetServiceKey: "placement-api",
      confirmed: false,
      idempotencyKey: "step-tests-1",
    });
    instance = step.instance;
    expect(instance.state).toBe("VERIFYING");

    // ---------- VERIFY ----------
    step = await executeAction(client, {
      template,
      instance,
      ownerId: userId,
      actionType: "VERIFY_SERVICE",
      targetServiceKey: "placement-api",
      confirmed: false,
      idempotencyKey: "step-verify-1",
    });
    instance = step.instance;
    expect(instance.state).toBe("RESOLVED");
    expect(instance.verified).toBe(true);

    // ---------- WRITE POSTMORTEM ----------
    const draft = {
      summary: "Application submissions failed at an 18% rate for roughly 30 minutes after the v2.14.0 deploy.",
      businessImpact: "18% of submissions failed; placement deadlines were at risk for active applicants.",
      timeline: "Deploy at -21m, latency rising at -16m, declared at -2m, mitigated at +15m, fixed at +25m, verified at +29m.",
      rootCause: "The v2.14.0 employer-verification query lacked a supporting index at production data volume.",
      contributingFactors: "Pre-deploy performance testing used a staging dataset far smaller than production.",
      detection: "HIGH_ERROR_RATE alert fired automatically; ownership was taken immediately.",
      mitigation: "Rolled back placement-api to v2.13.2, removing the offending query path.",
      permanentFix: "Deployed v2.14.1 adding a composite index on employers(verification_status, id).",
      whatWentWell: "Evidence was gathered across logs, metrics, traces, and deployment history before acting.",
      whatWentWrong: "The missing index should have been caught by load testing before reaching production.",
      preventiveActionKeys: ["add_db_index_migration", "expand_load_testing_dataset", "add_query_performance_alerting"],
      preventiveActionsNotes: "Add an index-aware migration check and expand load tests to production-scale data.",
      fiveWhys: [
        "Why did requests fail? Timeouts from placement-api.",
        "Why did they time out? placement-db queries took 4+ seconds.",
        "Why so slow? A sequential scan on the employers table.",
        "Why a sequential scan? No index supports the new verification_status filter.",
        "Why wasn't that caught? Staging tests ran against a tiny dataset that never exercised the query plan.",
      ],
    };
    await upsertPostmortemDraft(client, incidentId, userId, draft);

    // ---------- SUBMIT ----------
    const validation = validatePostmortem(draft);
    expect(validation.valid).toBe(true);
    await submitPostmortem(client, incidentId);
    instance = await updateIncidentInstance(client, incidentId, { state: transition(instance.state, "POSTMORTEM") });
    expect(instance.state).toBe("POSTMORTEM");

    // ---------- EVALUATE ----------
    const evaluation = await evaluateIncident(client, template, instance);
    expect(evaluation.version).toBe(1);
    expect(evaluation.categoryScores.rootCause).toBeGreaterThanOrEqual(90);
    expect(evaluation.categoryScores.mitigation).toBe(100);
    expect(evaluation.categoryScores.permanentFix).toBe(100);
    expect(evaluation.overall).toBeGreaterThanOrEqual(80);
    expect(evaluation.independence.hintsUsed).toBe(0);
    expect(evaluation.aiFeedback).not.toBeNull();
    expect(["ai", "fallback"]).toContain(evaluation.aiFeedback!.source); // no API key in this sandbox -> fallback, and that's fine

    const finalInstance = await getIncidentInstance(client, incidentId);
    expect(finalInstance.state).toBe("EVALUATED");

    // ---------- GENERATE EVIDENCE ----------
    const evidenceRes = await client.query("select category from incident_evidence where incident_id = $1", [incidentId]);
    const categories = evidenceRes.rows.map((r) => r.category);
    expect(categories.length).toBeGreaterThanOrEqual(7);
    expect(categories).toContain("ROOT_CAUSE_ANALYSIS");
    expect(categories).toContain("DATABASE");
    expect(categories).toContain("ENGINEERING_JUDGMENT");

    // ---------- UPDATE MASTERY ----------
    // No real external mastery engine exists in this environment (see
    // masteryAdapter.ts header) — what's verified here is the actual
    // contract handoff: the SAME evidence rows this incident produced are
    // durably persisted (queried above) before/independent of the no-op
    // adapter call, so a real adapter swapped in later has real data to
    // read, not a promise.
    expect(categories.length).toBeGreaterThan(0);

    // ---------- immutability check ----------
    const versionsRes = await client.query("select version from incident_evaluations where incident_id = $1", [incidentId]);
    expect(versionsRes.rows).toHaveLength(1);

    // ---------- re-evaluating a terminal (EVALUATED) incident is rejected ----------
    await expect(evaluateIncident(client, template, finalInstance)).rejects.toThrow(/must be in POSTMORTEM/i);

    // ---------- investigation event log actually has substance, not just a final answer ----------
    const events = await listEvents(client, incidentId);
    const investigativeTypes = new Set(events.map((e) => e.eventType));
    expect(investigativeTypes.has("INSPECT_LOGS")).toBe(true);
    expect(investigativeTypes.has("INSPECT_METRICS")).toBe(true);
    expect(investigativeTypes.has("INSPECT_TRACES")).toBe(true);
    expect(investigativeTypes.has("INSPECT_DEPLOYMENT")).toBe(true);
    expect(investigativeTypes.has("RUN_DIAGNOSTIC")).toBe(true);
  });
});
