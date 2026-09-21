import { describe, expect, it } from "vitest";
import { ReportLifecycleStatus, ReportType, UserRole } from "../../src/domain/enums";
import {
  assertCanAccessReportContent,
  assertCanAccessReportStatus,
  assertCanBulkGenerate,
  ReportAccessDeniedError,
} from "../../src/services/access-control";
import type { AuthenticatedUser, IdentityPort, OrganizationRecord, StudentRecord } from "../../src/ports";
import type { ReportRow } from "../../src/services/report-repository";

class FakeIdentity implements IdentityPort {
  constructor(private readonly linked: Set<string>) {}
  async getStudent(): Promise<StudentRecord | null> {
    return null; // unused by these tests
  }
  async getOrganization(): Promise<OrganizationRecord | null> {
    return null;
  }
  async canUserAccessStudent(user: AuthenticatedUser, studentId: string): Promise<boolean> {
    return this.linked.has(`${user.id}:${studentId}`);
  }
}

function makeReport(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "report_1",
    studentId: "student_1",
    orgId: "org_1",
    reportType: ReportType.STUDENT_TECHNICAL_MASTERY,
    schemaVersion: "1.0.0",
    sourceDataVersion: 1,
    status: ReportLifecycleStatus.COMPLETED,
    batchId: null,
    requestedById: "student_1",
    requestedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    failureReason: null,
    dto: null,
    narrativeSource: "fallback",
    narrativeValidated: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("access-control (brief §46-50, §79)", () => {
  const identity = new FakeIdentity(new Set(["student_1:student_1", "trainer_1:student_1"]));

  it("denies a different student even in the same org", async () => {
    const otherStudent: AuthenticatedUser = { id: "student_2", orgId: "org_1", role: UserRole.STUDENT, studentId: "student_2" };
    await expect(assertCanAccessReportContent(identity, otherStudent, makeReport())).rejects.toBeInstanceOf(
      ReportAccessDeniedError,
    );
  });

  it("denies a user from a different organization outright, before any relationship check (§47)", async () => {
    const outsider: AuthenticatedUser = { id: "student_1", orgId: "org_2", role: UserRole.STUDENT, studentId: "student_1" };
    await expect(assertCanAccessReportContent(identity, outsider, makeReport())).rejects.toBeInstanceOf(
      ReportAccessDeniedError,
    );
  });

  it("allows the owning student", async () => {
    const owner: AuthenticatedUser = { id: "student_1", orgId: "org_1", role: UserRole.STUDENT, studentId: "student_1" };
    await expect(assertCanAccessReportContent(identity, owner, makeReport())).resolves.toBeUndefined();
  });

  it("allows a trainer linked to the student, denies an unlinked trainer", async () => {
    const linkedTrainer: AuthenticatedUser = { id: "trainer_1", orgId: "org_1", role: UserRole.TRAINER };
    const unlinkedTrainer: AuthenticatedUser = { id: "trainer_2", orgId: "org_1", role: UserRole.TRAINER };
    await expect(assertCanAccessReportContent(identity, linkedTrainer, makeReport())).resolves.toBeUndefined();
    await expect(assertCanAccessReportContent(identity, unlinkedTrainer, makeReport())).rejects.toBeInstanceOf(
      ReportAccessDeniedError,
    );
  });

  it("denies platform ADMIN content access but allows ADMIN status access (brief §5 operational split)", async () => {
    const admin: AuthenticatedUser = { id: "admin_1", orgId: "org_1", role: UserRole.ADMIN };
    await expect(assertCanAccessReportContent(identity, admin, makeReport())).rejects.toBeInstanceOf(
      ReportAccessDeniedError,
    );
    await expect(assertCanAccessReportStatus(identity, admin, makeReport())).resolves.toBeUndefined();
  });

  it("restricts bulk generation to TPO and INSTITUTION_ADMIN roles", () => {
    expect(() => assertCanBulkGenerate({ id: "x", orgId: "org_1", role: UserRole.TPO })).not.toThrow();
    expect(() => assertCanBulkGenerate({ id: "x", orgId: "org_1", role: UserRole.INSTITUTION_ADMIN })).not.toThrow();
    expect(() => assertCanBulkGenerate({ id: "x", orgId: "org_1", role: UserRole.TRAINER })).toThrow(
      ReportAccessDeniedError,
    );
    expect(() => assertCanBulkGenerate({ id: "x", orgId: "org_1", role: UserRole.STUDENT })).toThrow(
      ReportAccessDeniedError,
    );
  });
});
