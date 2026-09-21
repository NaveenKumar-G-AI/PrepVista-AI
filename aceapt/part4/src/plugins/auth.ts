import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    studentId: string;
  }
}

export interface AuthOptions {
  demoMode: boolean;
}

/**
 * Sets `request.studentId` from the AUTHENTICATED identity, never from
 * `request.body`/`request.query` (Phase 53 — never trust a client-supplied
 * student id for authorization).
 *
 * DEMO_MODE trusts an `x-student-id` header, which is fine for local
 * development and for this prototype's demo script, but is not real
 * authentication. Wiring real auth means replacing the body of
 * `requireAuth` below with verification of your actual session cookie or
 * JWT and setting `request.studentId` from the verified claim — every route
 * handler already reads `request.studentId` and nothing else, so no route
 * needs to change.
 */
export default fp(async function authPlugin(fastify: FastifyInstance, opts: AuthOptions) {
  fastify.decorateRequest("studentId", "");

  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url === "/health") return; // unauthenticated by design — liveness probes don't carry student identity

    if (opts.demoMode) {
      const header = request.headers["x-student-id"];
      const studentId = Array.isArray(header) ? header[0] : header;
      if (!studentId) {
        reply.code(401).send({ error: "Missing x-student-id header (DEMO_MODE=true)." });
        return reply;
      }
      request.studentId = studentId;
      return;
    }

    // Production seam — replace with real session/JWT verification.
    reply.code(501).send({
      error: "Production auth is not wired up. Set DEMO_MODE=true for local/demo use, or implement real session verification in src/plugins/auth.ts.",
    });
    return reply;
  });
});
