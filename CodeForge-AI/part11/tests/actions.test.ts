import { describe, it, expect } from "vitest";
import { PF2048_TEMPLATE } from "@/content/incidents/pf-2048";
import { applyAction, ActionNotDefinedError, ConfirmationRequiredError } from "@/lib/engine/actions";
import { IncidentInstance } from "@/lib/engine/types";

function freshInstance(overrides: Partial<IncidentInstance> = {}): IncidentInstance {
  return {
    id: "inst-1",
    templateId: PF2048_TEMPLATE.id,
    ownerId: "user-1",
    code: "PF-1234",
    state: "INVESTIGATING",
    simStartedAt: new Date().toISOString(),
    simMinutesElapsed: 4,
    escalationLevel: 0,
    mitigated: false,
    permanentFixApplied: false,
    verified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("action engine", () => {
  it("throws ActionNotDefinedError for an action/target combo that isn't in the template", () => {
    expect(() =>
      applyAction({
        template: PF2048_TEMPLATE,
        instance: freshInstance(),
        actionType: "ROLLBACK",
        targetServiceKey: "redis-cache", // ROLLBACK is only defined for placement-api
        confirmed: true,
      })
    ).toThrow(ActionNotDefinedError);
  });

  it("brief CRITICAL TEST CASE: dangerous action without confirmation is rejected, not silently applied", () => {
    const instance = freshInstance();
    expect(() =>
      applyAction({
        template: PF2048_TEMPLATE,
        instance,
        actionType: "ROLLBACK",
        targetServiceKey: "placement-api",
        confirmed: false,
      })
    ).toThrow(ConfirmationRequiredError);
  });

  it("confirmed ROLLBACK mitigates: sets mitigated=true and advances to MITIGATED", () => {
    const instance = freshInstance();
    const result = applyAction({
      template: PF2048_TEMPLATE,
      instance,
      actionType: "ROLLBACK",
      targetServiceKey: "placement-api",
      confirmed: true,
    });
    expect(result.instancePatch.mitigated).toBe(true);
    expect(result.instancePatch.state).toBe("MITIGATED");
    expect(result.effect.resolvedNewState).toBe("MITIGATED");
  });

  it("RESTART_SERVICE is SAFE-to-execute but does NOT mitigate (it's a plausible-but-wrong move)", () => {
    const instance = freshInstance();
    const result = applyAction({
      template: PF2048_TEMPLATE,
      instance,
      actionType: "RESTART_SERVICE",
      targetServiceKey: "placement-api",
      confirmed: false, // RESTART_SERVICE doesn't require confirmation
    });
    expect(result.instancePatch.mitigated).toBeUndefined();
    expect(result.instancePatch.state).toBe("INVESTIGATING"); // unchanged
  });

  it("brief CRITICAL TEST CASE: verification requires actual recovery — VERIFY_SERVICE before mitigation does not resolve", () => {
    const instance = freshInstance({ mitigated: false, permanentFixApplied: false, state: "INVESTIGATING" });
    const result = applyAction({
      template: PF2048_TEMPLATE,
      instance,
      actionType: "VERIFY_SERVICE",
      targetServiceKey: "placement-api",
      confirmed: false,
    });
    expect(result.instancePatch.state).toBeUndefined(); // stays put — resolvedNewState reflects "no change"
    expect(result.effect.resolvedNewState).toBe("INVESTIGATING");
    expect(result.narrative).toMatch(/still degraded/i);
  });

  it("VERIFY_SERVICE after mitigation resolves the incident", () => {
    const instance = freshInstance({ mitigated: true, state: "VERIFYING" });
    const result = applyAction({
      template: PF2048_TEMPLATE,
      instance,
      actionType: "VERIFY_SERVICE",
      targetServiceKey: "placement-api",
      confirmed: false,
    });
    expect(result.instancePatch.verified).toBe(true);
    expect(result.instancePatch.state).toBe("RESOLVED");
  });

  it("DEPLOY_FIX sets both mitigated and permanentFixApplied (valid to use without a prior rollback)", () => {
    const instance = freshInstance({ mitigated: false, state: "INVESTIGATING" });
    const result = applyAction({
      template: PF2048_TEMPLATE,
      instance,
      actionType: "DEPLOY_FIX",
      targetServiceKey: "placement-api",
      confirmed: true,
    });
    expect(result.instancePatch.mitigated).toBe(true);
    expect(result.instancePatch.permanentFixApplied).toBe(true);
    expect(result.instancePatch.state).toBe("FIXING");
  });

  it("every action advances the simulation clock by its defined cost", () => {
    const instance = freshInstance({ simMinutesElapsed: 10 });
    const result = applyAction({
      template: PF2048_TEMPLATE,
      instance,
      actionType: "INSPECT_METRICS",
      confirmed: false,
    });
    expect(result.instancePatch.simMinutesElapsed).toBe(11); // INSPECT_METRICS costs 1
  });
});
