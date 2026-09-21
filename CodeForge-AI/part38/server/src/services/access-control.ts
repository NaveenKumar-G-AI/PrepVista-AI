import { UserRole } from "../domain/enums";
import type { AuthenticatedUser, IdentityPort } from "../ports";
import type { ReportRow } from "./report-repository";

/**
 * Thrown for every denial path. The message is deliberately generic and
 * never differs based on *why* access was denied (student doesn't exist vs.
 * wrong org vs. wrong role) — brief §79, "No metadata leakage." Callers map
 * this to a flat 403/404 with no extra detail.
 */
export class ReportAccessDeniedError extends Error {
  constructor() {
    super("Not authorized to access this report.");
    this.name = "ReportAccessDeniedError";
  }
}

/** Can this user request/view a *student's* report content at all? (brief §46-50) */
export async function assertCanAccessStudent(
  identity: IdentityPort,
  user: AuthenticatedUser,
  studentId: string,
): Promise<void> {
  const allowed = await identity.canUserAccessStudent(user, studentId);
  if (!allowed) throw new ReportAccessDeniedError();
}

/** Can this user view a *specific already-generated report's* content? */
export async function assertCanAccessReportContent(
  identity: IdentityPort,
  user: AuthenticatedUser,
  report: ReportRow,
): Promise<void> {
  if (report.orgId !== user.orgId) throw new ReportAccessDeniedError(); // tenant isolation, §47
  // ADMIN gets operational visibility (status/audit) but not report content — brief §5.
  if (user.role === UserRole.ADMIN) throw new ReportAccessDeniedError();
  await assertCanAccessStudent(identity, user, report.studentId);
}

/** Looser check for status/metadata-only endpoints — ADMIN is allowed here. */
export async function assertCanAccessReportStatus(
  identity: IdentityPort,
  user: AuthenticatedUser,
  report: ReportRow,
): Promise<void> {
  if (report.orgId !== user.orgId) throw new ReportAccessDeniedError();
  if (user.role === UserRole.ADMIN) return;
  await assertCanAccessStudent(identity, user, report.studentId);
}

export function assertCanBulkGenerate(user: AuthenticatedUser): void {
  if (user.role !== UserRole.TPO && user.role !== UserRole.INSTITUTION_ADMIN) {
    throw new ReportAccessDeniedError();
  }
}
