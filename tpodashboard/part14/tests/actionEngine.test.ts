import { describe, it, expect, beforeAll } from "vitest";
import { actionEngine } from "../src/engine/actionEngine.js";
import { registerActionCatalog } from "../src/actions/index.js";
import type { ActorContext } from "../src/types/action.types.js";
import { seed } from "../src/db/seed.js";
import { ActionError } from "../src/types/action.types.js";

beforeAll(() => registerActionCatalog());

const tpoHead: ActorContext = {
  userId: "user-tpo-1",
  institutionId: seed.INSTITUTION,
  role: "TPO_HEAD",
  sessionId: "sess-1",
};

describe("READ action (LEVEL 0)", () => {
  it("executes immediately with no confirmation required", async () => {
    const proposed = await actionEngine.proposeAction("list_unapplied_students", { driveId: seed.DRIVE_ABC }, tpoHead);
    expect(proposed.confirmationRequired).toBe(false);
    expect(proposed.status).toBe("READY_FOR_CONFIRMATION");
    const executed = await actionEngine.executeAction(proposed.id, tpoHead);
    expect(executed.status).toBe("SUCCEEDED");
    expect(executed.result?.detail?.requested).toBe(83);
  });
});

describe("PREPARE action (LEVEL 1)", () => {
  it("produces a draft with no side effects", async () => {
    const proposed = await actionEngine.proposeAction(
      "prepare_application_reminder",
      { driveId: seed.DRIVE_ABC, deadlineText: "today at 6 PM" },
      tpoHead
    );
    expect(proposed.confirmationRequired).toBe(false);
    expect(proposed.preview?.irreversible).toBe(false);
    const executed = await actionEngine.executeAction(proposed.id, tpoHead);
    expect(executed.result?.summary).toMatch(/Draft prepared/);
  });
});

describe("SENSITIVE_WRITE action (LEVEL 3) full pipeline", () => {
  it("requires preview, confirm, then execute; reports partial failure honestly", async () => {
    const proposed = await actionEngine.proposeAction(
      "send_application_reminder",
      { driveId: seed.DRIVE_ABC, message: "Applications close today at 6 PM.", channel: "in_app" },
      tpoHead
    );
    expect(proposed.confirmationRequired).toBe(true);
    expect(proposed.status).toBe("READY_FOR_CONFIRMATION");
    expect(proposed.preview?.irreversible).toBe(true);

    // Cannot execute before confirming.
    await expect(actionEngine.executeAction(proposed.id, tpoHead)).rejects.toThrow(ActionError);

    const confirmed = await actionEngine.confirmAction(proposed.id, tpoHead);
    expect(confirmed.status).toBe("CONFIRMED");

    const executed = await actionEngine.executeAction(confirmed.id, tpoHead);
    expect(["SUCCEEDED", "PARTIALLY_SUCCEEDED"]).toContain(executed.status);
    expect(executed.result?.detail).toBeDefined();
    // The seeded communication service fails exactly 2 of >10 recipients.
    expect(executed.result?.detail?.failed).toBe(2);
    expect(executed.result?.detail?.succeeded).toBe((executed.result?.detail?.requested ?? 0) - 2);
  });
});

describe("HIGH_RISK action (LEVEL 4) preconditions", () => {
  it("refuses to publish when some results are still pending review", async () => {
    await expect(
      actionEngine.proposeAction(
        "publish_interview_results",
        { driveId: seed.DRIVE_PENDING, confirmationReason: "attempting publish with pending results" },
        tpoHead
      )
    ).rejects.toThrow(/pending review/);
  });

  it("publishes once all results are reviewed, and is irreversible in its preview", async () => {
    const proposed = await actionEngine.proposeAction(
      "publish_interview_results",
      { driveId: seed.DRIVE_XYZ, confirmationReason: "All results reviewed by committee." },
      tpoHead
    );
    expect(proposed.riskLevel).toBe("HIGH_RISK");
    expect(proposed.preview?.irreversible).toBe(true);
    const confirmed = await actionEngine.confirmAction(proposed.id, tpoHead);
    const executed = await actionEngine.executeAction(confirmed.id, tpoHead);
    expect(executed.status).toBe("SUCCEEDED");
    expect(executed.result?.detail?.succeeded).toBe(37);
  });
});

describe("LOW_RISK_WRITE action (LEVEL 2)", () => {
  it("auto-executes per PRE_APPROVED policy without a separate confirm step", async () => {
    const proposed = await actionEngine.proposeAction(
      "create_tpo_task",
      { title: "Review pending applications", priority: "high" },
      tpoHead
    );
    expect(proposed.confirmationRequired).toBe(false);
    const executed = await actionEngine.executeAction(proposed.id, tpoHead);
    expect(executed.status).toBe("SUCCEEDED");
  });
});

describe("cancel", () => {
  it("can cancel a proposed-but-unconfirmed action", async () => {
    const proposed = await actionEngine.proposeAction(
      "send_application_reminder",
      { driveId: seed.DRIVE_ABC, message: "test", channel: "in_app" },
      tpoHead
    );
    const cancelled = await actionEngine.cancelAction(proposed.id, tpoHead);
    expect(cancelled.status).toBe("CANCELLED");
    await expect(actionEngine.confirmAction(proposed.id, tpoHead)).rejects.toThrow(/state CANCELLED/);
  });
});
