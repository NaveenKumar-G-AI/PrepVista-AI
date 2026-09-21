import { getOrCreateDevStudent } from './db/repository';
import { ForbiddenError } from './errors';
import type { Student } from './types';

// ---------------------------------------------------------------------------
// INTEGRATION POINT: this file stands in for ACEAPT's real authentication.
// Section 30 of the brief says to reuse the existing auth/student-identity
// system rather than build a new one — but no existing codebase was provided
// here, so `getCurrentStudent()` resolves a single pinned demo student
// instead of reading a real session. Every API route already calls
// `assertOwnership()` on every resource it touches, so once this function is
// replaced with a real session lookup, the authorization behavior underneath
// it does not need to change.
// ---------------------------------------------------------------------------

const DEV_STUDENT_ID = process.env.DEV_STUDENT_ID || 'dev-student-1';
const DEV_STUDENT_NAME = 'Aditi Sharma';

export async function getCurrentStudent(): Promise<Student> {
  return getOrCreateDevStudent(DEV_STUDENT_ID, DEV_STUDENT_NAME);
}

export function assertOwnership(resourceStudentId: string, currentStudentId: string): void {
  if (resourceStudentId !== currentStudentId) {
    throw new ForbiddenError();
  }
}
