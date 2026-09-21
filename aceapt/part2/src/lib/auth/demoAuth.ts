import { cookies } from "next/headers";
import { ensureStudent } from "@/lib/db/repo";

const COOKIE_NAME = "aceapt_student_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Stand-in for real authentication (spec section 5: Feature 2 should reuse
 * existing auth infrastructure rather than invent its own — but no existing
 * app/auth system was uploaded to this codebase, per spec section 5's own
 * instruction to inspect what exists first). This provides the one thing
 * every downstream authorization check (spec section 54) actually needs: a
 * stable per-visitor identity. Swapping it for real session/JWT auth later
 * is a contained change to this file — every caller downstream just needs
 * a `studentId: string`, and gets one from `getDemoStudentId` /
 * `requireOrCreateDemoStudentId` regardless of how it's produced.
 *
 * Split into two functions because Next.js only allows *setting* cookies
 * inside a Server Action or Route Handler, never during Server Component
 * render:
 *   - `getDemoStudentId` — safe anywhere, including page.tsx. Read-only.
 *   - `requireOrCreateDemoStudentId` — Route Handlers only. Creates the
 *     identity (and the students row) on first contact.
 */

export async function getDemoStudentId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

/** Route Handlers / Server Actions only — see note above. */
export async function requireOrCreateDemoStudentId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) {
    ensureStudent(existing);
    return existing;
  }
  const id = `stu_${crypto.randomUUID()}`;
  ensureStudent(id);
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return id;
}

export class UnauthorizedError extends Error {
  constructor(message = "Not authorized to access this resource") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Every route touching a session calls this before returning anything. */
export function assertOwnsSession(sessionStudentId: string, requestingStudentId: string | null): void {
  if (!requestingStudentId || sessionStudentId !== requestingStudentId) {
    throw new UnauthorizedError();
  }
}
