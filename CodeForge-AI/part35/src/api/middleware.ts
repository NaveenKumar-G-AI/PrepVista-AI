import type { FastifyRequest, FastifyReply } from "fastify";
import type { TenantContext } from "../domain/types.js";

/**
 * DEV-ONLY. Reads identity from plain headers with no verification
 * whatsoever. This is deliberately as unfinished as the blank API keys —
 * §58 says Feature 35 must reuse CodeForge's existing authorization rather
 * than invent a new permission framework, and this sandbox has no reachable
 * implementation of that system to call into (see TRUTH_TABLE.md).
 *
 * Before this ever runs against real candidates: replace the body of this
 * function with whatever validates a real session/JWT in the main CodeForge
 * backend and derives org/candidate/role from *that*, not from headers a
 * client could set to anything.
 */
export function extractTenantContext(request: FastifyRequest): TenantContext {
  const orgId = header(request, "x-org-id");
  const actorId = header(request, "x-actor-id");
  const actorRole = header(request, "x-actor-role");

  if (!orgId || !actorId || !actorRole) {
    throw new AuthContextError("missing x-org-id / x-actor-id / x-actor-role headers");
  }
  if (actorRole !== "CANDIDATE" && actorRole !== "STAFF" && actorRole !== "SYSTEM") {
    throw new AuthContextError(`invalid x-actor-role "${actorRole}"`);
  }
  return { orgId, actorId, actorRole };
}

export class AuthContextError extends Error {}

function header(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export async function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    (request as any).tenantContext = extractTenantContext(request);
  } catch (err) {
    reply.code(401).send({ error: err instanceof Error ? err.message : "unauthorized" });
  }
}

export function getTenantContext(request: FastifyRequest): TenantContext {
  const ctx = (request as any).tenantContext as TenantContext | undefined;
  if (!ctx) throw new Error("authGuard did not run before this handler");
  return ctx;
}
