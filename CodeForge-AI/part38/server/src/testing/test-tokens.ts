import { UserRole } from "../domain/enums";
import { signDemoToken } from "../http/middleware";
import { DEMO } from "../db/seed-data";
import type { AuthenticatedUser } from "../ports";

/**
 * TEST/SCRIPT-ONLY. Mints tokens for the fixture users seeded by
 * seed-data.ts, matching src/http/middleware.ts's placeholder auth. Never
 * imported by application (non-test, non-script) code.
 */
export const DEMO_USERS = {
  studentGolden: { id: "user_student_golden", orgId: DEMO.orgDemo, role: UserRole.STUDENT, studentId: DEMO.studentGolden } satisfies AuthenticatedUser,
  studentSparse: { id: "user_student_sparse", orgId: DEMO.orgDemo, role: UserRole.STUDENT, studentId: DEMO.studentSparse } satisfies AuthenticatedUser,
  studentOther: { id: "user_student_other", orgId: DEMO.orgOther, role: UserRole.STUDENT, studentId: DEMO.studentOther } satisfies AuthenticatedUser,
  trainer1: { id: DEMO.trainer1, orgId: DEMO.orgDemo, role: UserRole.TRAINER } satisfies AuthenticatedUser,
  tpo1: { id: DEMO.tpo1, orgId: DEMO.orgDemo, role: UserRole.TPO } satisfies AuthenticatedUser,
  instAdmin1: { id: DEMO.instAdmin1, orgId: DEMO.orgDemo, role: UserRole.INSTITUTION_ADMIN } satisfies AuthenticatedUser,
  admin1: { id: DEMO.admin1, orgId: DEMO.orgDemo, role: UserRole.ADMIN } satisfies AuthenticatedUser,
};

export function tokenFor(user: AuthenticatedUser): string {
  return signDemoToken(user);
}
