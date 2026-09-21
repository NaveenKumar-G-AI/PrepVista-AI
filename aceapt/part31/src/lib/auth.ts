import { cookies } from 'next/headers';
import { DEMO_STUDENT_ID, ensureDemoStudent, getStudent } from '@/lib/db/repository';
import type { Student } from '@/lib/db/schema';

// MVP has exactly one demo student and no login flow. Every call still goes
// through this function (rather than the DEMO_STUDENT_ID constant directly)
// so that swapping in real session-based auth later is a one-file change:
// every route already asks "who is the current student" instead of assuming.
//
// The cookie read is future-proofing only — no auth session sets it yet.
export function getCurrentStudent(): Student {
  ensureDemoStudent();
  const cookieStudentId = cookies().get('aceapt_student_id')?.value;
  const student = (cookieStudentId && getStudent(cookieStudentId)) || getStudent(DEMO_STUDENT_ID);
  if (!student) throw new Error('No student available');
  return student;
}

// Ownership check every attempt/result-scoped route should call before
// returning data (spec §55 — no cross-student leakage).
export function assertOwnsRecord(recordStudentId: string, currentStudentId: string): void {
  if (recordStudentId !== currentStudentId) {
    const err = new Error('Not authorized to access this record');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
