import type { FastifyReply, FastifyRequest } from "fastify";
import type { StudentContext } from "../../types/contracts.js";

/**
 * Module 41: "Implement according to existing ACEAPT security architecture
 * ... verify authenticated user." This build has no ACEAPT auth system to
 * inspect (see TRUTH_TABLE.md), so this file is the explicit seam, not an
 * implementation of auth itself.
 *
 * The dev-mode stand-in below trusts two request headers directly — that
 * is NOT safe for anything beyond local development, and this function
 * throws in production unless it's been replaced. Wire this to the real
 * session/JWT verifier before deploying: the only contract the rest of
 * this codebase depends on is "give me a StudentContext with a
 * tenant-scoped, verified studentId."
 */
export async function requireStudentContext(request: FastifyRequest, reply: FastifyReply): Promise<StudentContext | null> {
  if (process.env.NODE_ENV === "production") {
    reply.code(501).send({
      error: "AUTH_NOT_INTEGRATED",
      message: "src/api/middleware/auth.ts must be wired to ACEAPT's real auth before this runs in production.",
    });
    return null;
  }

  const studentId = request.headers["x-dev-student-id"];
  const tenantId = request.headers["x-dev-tenant-id"];

  if (typeof studentId !== "string" || typeof tenantId !== "string") {
    reply.code(401).send({ error: "UNAUTHENTICATED", message: "x-dev-student-id and x-dev-tenant-id headers required in dev mode." });
    return null;
  }

  return { studentId, tenantId };
}
