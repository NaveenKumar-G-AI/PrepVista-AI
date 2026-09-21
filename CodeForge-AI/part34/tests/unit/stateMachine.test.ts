import { describe, expect, it } from "vitest";
import { applyTransition, canTransition, isTerminal, recoverSession, TRANSITIONS } from "../../src/domain/stateMachine.js";
import { asOrgId, asSessionId, asInterviewDefinitionId, asRoleId, asStudentId, type InterviewSession } from "../../src/domain/types.js";

function makeSession(state: InterviewSession["state"]): InterviewSession {
  return {
    id: asSessionId("sess_1"),
    orgId: asOrgId("org_1"),
    studentId: asStudentId("student_1"),
    interviewDefinitionId: asInterviewDefinitionId("def_1"),
    roleId: asRoleId("role_1"),
    mode: "TECHNICAL_SCREENING",
    state,
    versionInfo: { interviewVersion: "v1", roleModelVersion: "v1", evaluationVersion: "v1" },
    coverage: {},
    questionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("state machine — legal transitions", () => {
  it("allows the full happy path CREATED -> READY -> IN_PROGRESS -> COMPLETED", () => {
    let session = makeSession("CREATED");
    for (const next of ["READY", "IN_PROGRESS", "COMPLETED"] as const) {
      const result = applyTransition(session, next);
      expect(result.ok).toBe(true);
      if (result.ok) session = result.session;
    }
    expect(session.state).toBe("COMPLETED");
    expect(session.startedAt).toBeDefined();
    expect(session.completedAt).toBeDefined();
  });

  it("allows PAUSED -> RESUMED -> IN_PROGRESS", () => {
    let session = makeSession("PAUSED");
    const resumed = applyTransition(session, "RESUMED");
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.session.resumedAt).toBeDefined();
    const inProgress = applyTransition(resumed.session, "IN_PROGRESS");
    expect(inProgress.ok).toBe(true);
  });

  it("allows EVALUATION_PENDING -> EVALUATION_FAILED -> EVALUATION_PENDING (retry loop)", () => {
    const session = makeSession("EVALUATION_PENDING");
    const failed = applyTransition(session, "EVALUATION_FAILED");
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    const retried = applyTransition(failed.session, "EVALUATION_PENDING");
    expect(retried.ok).toBe(true);
  });

  it("stamps cancelReason on CANCELLED", () => {
    const session = makeSession("IN_PROGRESS");
    const result = applyTransition(session, "CANCELLED", { cancelReason: "student requested" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.cancelReason).toBe("student requested");
      expect(result.session.cancelledAt).toBeDefined();
    }
  });
});

describe("state machine — illegal transitions", () => {
  it("rejects CREATED -> IN_PROGRESS (must pass through READY)", () => {
    const session = makeSession("CREATED");
    const result = applyTransition(session, "IN_PROGRESS");
    expect(result.ok).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      const session = makeSession(terminal);
      for (const target of TRANSITIONS.IN_PROGRESS) {
        const result = applyTransition(session, target);
        expect(result.ok).toBe(false);
      }
    }
  });

  it("rejects PAUSED -> IN_PROGRESS directly (must go through RESUMED)", () => {
    const session = makeSession("PAUSED");
    const result = applyTransition(session, "IN_PROGRESS");
    expect(result.ok).toBe(false);
  });

  it("isTerminal correctly identifies COMPLETED and CANCELLED only", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("IN_PROGRESS")).toBe(false);
    expect(isTerminal("CREATED")).toBe(false);
  });

  it("canTransition matches the TRANSITIONS table exactly", () => {
    expect(canTransition("CREATED", "READY")).toBe(true);
    expect(canTransition("CREATED", "COMPLETED")).toBe(false);
  });
});

describe("state machine — recovery (Phase 35)", () => {
  it("treats IN_PROGRESS as already recoverable (no-op)", () => {
    const session = makeSession("IN_PROGRESS");
    const result = recoverSession(session);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.state).toBe("IN_PROGRESS");
  });

  it("treats PAUSED as recoverable without forcing a transition", () => {
    const session = makeSession("PAUSED");
    const result = recoverSession(session);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.state).toBe("PAUSED");
  });

  it("moves RESUMED forward into IN_PROGRESS", () => {
    const session = makeSession("RESUMED");
    const result = recoverSession(session);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.state).toBe("IN_PROGRESS");
  });

  it("refuses to recover a CREATED session (never started)", () => {
    const session = makeSession("CREATED");
    const result = recoverSession(session);
    expect(result.ok).toBe(false);
  });

  it("refuses to recover a terminal session", () => {
    const session = makeSession("COMPLETED");
    const result = recoverSession(session);
    expect(result.ok).toBe(false);
  });
});
