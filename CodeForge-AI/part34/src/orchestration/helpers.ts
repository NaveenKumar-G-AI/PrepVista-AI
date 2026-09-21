// ============================================================================
// Shared helpers used by every use case in this directory: an authorization
// gate, a concurrency-safe state transition wrapper, and an audit-log
// helper. Centralizing these three means every use case gets tenant
// isolation (Phase 60), concurrency protection (Phase 36, 75), and
// auditability (Phase 68) the same way, instead of each use case
// reimplementing its own version and inevitably drifting.
// ============================================================================

import { applyTransition, type TransitionOptions } from "../domain/stateMachine.js";
import type { ActorContext, InterviewSession, OrgId, SessionState, StudentId } from "../domain/types.js";
import type { AuthzPort, InterviewAction, InterviewEventName, ObservabilityPort } from "../integration/ports.js";
import type { InterviewEventRepository, SessionRepository } from "../db/repositories.js";

export class AuthorizationError extends Error {
  constructor(action: InterviewAction) {
    super(`Actor is not authorized to perform ${action}.`);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found (or not accessible to this tenant).`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Every use case calls this first. Tenant isolation is enforced inside
 * AuthzPort.can() (Phase 60) — this wrapper just turns "false" into a thrown
 * error so use cases read as a straight-line happy path.
 */
export async function requireAuthorized(
  authz: AuthzPort,
  actor: ActorContext,
  action: InterviewAction,
  resourceOrgId: OrgId,
  resourceStudentId?: StudentId,
): Promise<void> {
  const allowed = await authz.can(actor, action, resourceOrgId, resourceStudentId);
  if (!allowed) throw new AuthorizationError(action);
}

/**
 * Reads the session fresh, attempts the transition, and writes it back with
 * an optimistic-concurrency guard tied to the state actually observed. If
 * another request mutated the session between the read and the write, this
 * throws ConflictError instead of silently clobbering it (Phase 36, 75).
 */
export async function transitionSessionSafely(
  sessions: SessionRepository,
  sessionId: InterviewSession["id"],
  orgId: OrgId,
  to: SessionState,
  options: TransitionOptions = {},
): Promise<InterviewSession> {
  const current = await sessions.getById(sessionId, orgId);
  if (!current) throw new NotFoundError("InterviewSession", sessionId);

  const result = applyTransition(current, to, options);
  if (!result.ok) throw new ConflictError(result.error);

  const written = await sessions.updateWithExpectedState(result.session, current.state);
  if (!written) {
    throw new ConflictError(`Session ${sessionId} was modified concurrently; retry the request.`);
  }
  return result.session;
}

export async function logEvent(
  events: InterviewEventRepository,
  observability: ObservabilityPort,
  orgId: OrgId,
  sessionId: InterviewSession["id"],
  type: string,
  payload: Record<string, unknown>,
  observabilityEvent?: InterviewEventName,
): Promise<void> {
  const occurredAt = new Date().toISOString();
  await events.append({ orgId, sessionId, type, payload, occurredAt });
  if (observabilityEvent) observability.track(observabilityEvent, { sessionId, orgId, ...payload });
}
