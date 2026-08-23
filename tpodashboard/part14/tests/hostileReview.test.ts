import { describe, it, expect, beforeAll } from "vitest";
import { actionEngine } from "../src/engine/actionEngine.js";
import { registerActionCatalog } from "../src/actions/index.js";
import { communicationService } from "../src/services/communicationService.js";
import type { ActorContext } from "../src/types/action.types.js";
import { seed } from "../src/db/seed.js";

beforeAll(() => registerActionCatalog());

const tpoHead: ActorContext = {
  userId: "user-tpo-1",
  institutionId: seed.INSTITUTION,
  role: "TPO_HEAD",
  sessionId: "sess-1",
};

const officerA: ActorContext = {
  userId: "user-officer-a",
  institutionId: seed.INSTITUTION,
  role: "PLACEMENT_OFFICER",
  sessionId: "sess-officer-a",
};

const officerB: ActorContext = {
  userId: "user-officer-b",
  institutionId: seed.INSTITUTION,
  role: "PLACEMENT_OFFICER",
  sessionId: "sess-officer-b",
};

const deptCoordinatorCSE: ActorContext = {
  userId: "user-coord-cse",
  institutionId: seed.INSTITUTION,
  role: "DEPARTMENT_COORDINATOR",
  departments: ["CSE"],
  sessionId: "sess-coord-1",
};

describe("HOSTILE REVIEW: concurrent duplicate execution (race condition)", () => {
  it("does not double-send when two executeAction calls race for the same confirmed action", async () => {
    const proposed = await actionEngine.proposeAction(
      "send_application_reminder",
      { driveId: seed.DRIVE_ABC, message: "Race condition test", channel: "in_app" },
      tpoHead
    );
    const confirmed = await actionEngine.confirmAction(proposed.id, tpoHead);

    const before = communicationService.callLog.filter((k) => k === proposed.idempotencyKey).length;
    // Fire both "clicks" at once, simulating a double-tap or two racing retries.
    const [a, b] = await Promise.all([
      actionEngine.executeAction(confirmed.id, tpoHead),
      actionEngine.executeAction(confirmed.id, tpoHead),
    ]);
    const after = communicationService.callLog.filter((k) => k === proposed.idempotencyKey).length;

    expect(after - before).toBe(1); // the underlying provider was invoked exactly once
    expect(a.result?.detail?.succeeded).toBe(b.result?.detail?.succeeded);
    expect(a.status).toBe(b.status);
  });
});

describe("HOSTILE REVIEW: permission inheritance at confirm/execute time", () => {
  it("blocks a lower-scoped Department Coordinator from confirming a TPO Head's institution-wide proposal", async () => {
    const proposed = await actionEngine.proposeAction(
      "assign_training_to_cohort",
      { trainingName: "Institution-wide Bootcamp", readinessBelow: 55 }, // TPO_HEAD has no department restriction
      tpoHead
    );
    expect(proposed.status).toBe("READY_FOR_CONFIRMATION");

    await expect(actionEngine.confirmAction(proposed.id, deptCoordinatorCSE)).rejects.toThrow(/proposed this action|TPO Head/i);
  });

  it("blocks one Placement Officer from confirming a teammate's proposal without escalation", async () => {
    const proposed = await actionEngine.proposeAction(
      "send_application_reminder",
      { driveId: seed.DRIVE_ABC, message: "Officer A's draft", channel: "in_app" },
      officerA
    );
    await expect(actionEngine.confirmAction(proposed.id, officerB)).rejects.toThrow(/proposed this action|TPO Head/i);
  });

  it("allows a TPO Head to confirm on behalf of a Placement Officer's proposal (authorized escalation)", async () => {
    const proposed = await actionEngine.proposeAction(
      "assign_training_to_cohort",
      { trainingName: "Officer-proposed cohort", readinessBelow: 40 },
      officerA
    );
    const confirmed = await actionEngine.confirmAction(proposed.id, tpoHead);
    expect(confirmed.status).toBe("CONFIRMED");
  });

  it("re-checks permission at confirm time, not just at propose time", async () => {
    // Officer A proposes and then confirms their own action — this must still
    // independently satisfy checkPermission for officerA's role at confirm
    // time, not merely rely on the fact that validateAction already passed
    // once when the action was proposed.
    const proposed = await actionEngine.proposeAction(
      "send_application_reminder",
      { driveId: seed.DRIVE_ABC, message: "Self-confirm test", channel: "in_app" },
      officerA
    );
    const confirmed = await actionEngine.confirmAction(proposed.id, officerA);
    expect(confirmed.status).toBe("CONFIRMED");
  });
});
