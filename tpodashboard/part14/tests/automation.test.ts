import { describe, it, expect, beforeAll } from "vitest";
import { registerActionCatalog } from "../src/actions/index.js";
import { automationRuleEngine, type AutomationRule, type DomainEvent } from "../src/automation/automationRuleEngine.js";
import { actionRepo, auditRepo } from "../src/db/actionStore.js";
import { seed } from "../src/db/seed.js";

beforeAll(() => registerActionCatalog());

describe("Automation rule engine", () => {
  it("runs a PRE_APPROVED, single-recipient action end-to-end without a human confirm step", async () => {
    const rule: AutomationRule = {
      id: "rule-notify-on-publish",
      institutionId: seed.INSTITUTION,
      trigger: "interview_result.published",
      actionType: "notify_student_result_published",
      buildInput: (event) => ({ studentId: event.payload.studentId, driveId: event.payload.driveId }),
      approvalMode: "PRE_APPROVED",
      enabled: true,
      version: 1,
    };
    automationRuleEngine.register(rule);

    const event: DomainEvent = {
      type: "interview_result.published",
      institutionId: seed.INSTITUTION,
      payload: { studentId: "stu-030", driveId: seed.DRIVE_XYZ },
      actingUserId: "system",
    };

    const before = actionRepo.listForInstitution(seed.INSTITUTION).length;
    await automationRuleEngine.handleEvent(event);
    const after = actionRepo.listForInstitution(seed.INSTITUTION);
    expect(after.length).toBe(before + 1);

    const created = after[after.length - 1]!;
    expect(created.actionType).toBe("notify_student_result_published");
    expect(created.status).toBe("SUCCEEDED"); // ran autonomously, no human confirm needed

    const auditTrail = auditRepo.forAction(created.id);
    const firedEntry = auditRepo.forInstitution(seed.INSTITUTION).find(
      (e) => e.event === "AUTOMATION_RULE_FIRED" && e.actionId === created.id
    );
    expect(firedEntry).toBeDefined();
    expect((firedEntry?.detail as any)?.ruleId).toBe("rule-notify-on-publish");
    expect(auditTrail.some((e) => e.event === "EXECUTED")).toBe(true);
  });

  it("never auto-executes a sensitive/high-risk action even if a rule is misconfigured as PRE_APPROVED for it", async () => {
    // Sensitive/high-risk actions unconditionally require confirmation
    // (policyGuard.confirmationRequired short-circuits before consulting
    // approval mode), so even a misconfigured rule cannot make
    // send_application_reminder run without a human.
    const rule: AutomationRule = {
      id: "rule-misconfigured-bulk-send",
      institutionId: seed.INSTITUTION,
      trigger: "drive.deadline_approaching",
      actionType: "send_application_reminder",
      buildInput: () => ({ driveId: seed.DRIVE_ABC, message: "auto reminder", channel: "in_app" }),
      approvalMode: "PRE_APPROVED", // misconfigured on purpose
      enabled: true,
      version: 1,
    };
    automationRuleEngine.register(rule);

    const event: DomainEvent = {
      type: "drive.deadline_approaching",
      institutionId: seed.INSTITUTION,
      payload: {},
      actingUserId: "system",
    };

    const before = actionRepo.listForInstitution(seed.INSTITUTION).length;
    await automationRuleEngine.handleEvent(event);
    const after = actionRepo.listForInstitution(seed.INSTITUTION);
    expect(after.length).toBe(before + 1);

    const created = after[after.length - 1]!;
    // Left pending for a human — never silently sent.
    expect(created.status).toBe("READY_FOR_CONFIRMATION");
    expect(created.confirmationRequired).toBe(true);
  });
});
