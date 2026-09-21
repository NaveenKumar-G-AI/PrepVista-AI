// ============================================================================
// Session lifecycle use cases. Every transition goes through
// transitionSessionSafely() (optimistic concurrency, Phase 36/75) and is
// authorization-checked per action (Phase 60-61) before anything else runs.
// ============================================================================

import { recoverSession as domainRecoverSession } from "../domain/stateMachine.js";
import type { ActorContext, InterviewSession, OrgId, SessionId } from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { ConflictError, NotFoundError, logEvent, requireAuthorized, transitionSessionSafely } from "./helpers.js";

export async function getSession(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<InterviewSession> {
  const session = await container.repositories.sessions.getById(sessionId, orgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW", orgId, session.studentId);
  return session;
}

/**
 * CREATED -> READY -> IN_PROGRESS. Returns the started session; callers
 * (typically the API layer) follow this with requestNextQuestion() to get
 * the first question — starting a session and asking its first question are
 * kept as separate calls per Phase 64's API list.
 */
export async function startSession(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<InterviewSession> {
  const existing = await container.repositories.sessions.getById(sessionId, orgId);
  if (!existing) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_START", orgId, existing.studentId);

  await transitionSessionSafely(container.repositories.sessions, sessionId, orgId, "READY");
  const started = await transitionSessionSafely(container.repositories.sessions, sessionId, orgId, "IN_PROGRESS");

  await logEvent(
    container.repositories.events,
    container.ports.observability,
    orgId,
    sessionId,
    "session.started",
    { mode: started.mode, roleId: started.roleId },
    "interview.started",
  );

  return started;
}

export async function pauseSession(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<InterviewSession> {
  const existing = await container.repositories.sessions.getById(sessionId, orgId);
  if (!existing) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_PAUSE", orgId, existing.studentId);

  const paused = await transitionSessionSafely(container.repositories.sessions, sessionId, orgId, "PAUSED");
  await logEvent(container.repositories.events, container.ports.observability, orgId, sessionId, "session.paused", {});
  return paused;
}

/**
 * Phase 35 — session recovery. Handles both the "resume after browser
 * close" path (session sat in PAUSED) and the "network dropped mid-question,
 * client reconnects" path (session was still IN_PROGRESS the whole time —
 * recovery is then a safe no-op confirming state, not a real transition).
 */
export async function resumeSession(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<InterviewSession> {
  const existing = await container.repositories.sessions.getById(sessionId, orgId);
  if (!existing) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_RESUME", orgId, existing.studentId);

  if (existing.state === "IN_PROGRESS") {
    // Already active — nothing to do, and nothing was lost.
    await logEvent(container.repositories.events, container.ports.observability, orgId, sessionId, "session.recovery_noop", {}, "session.recovered");
    return existing;
  }

  const resumed = await transitionSessionSafely(container.repositories.sessions, sessionId, orgId, "RESUMED");
  const inProgress = await transitionSessionSafely(container.repositories.sessions, sessionId, orgId, "IN_PROGRESS");
  await logEvent(
    container.repositories.events,
    container.ports.observability,
    orgId,
    sessionId,
    "session.resumed",
    { responsesPreserved: (await container.repositories.responses.listBySession(sessionId, orgId)).length },
    "session.recovered",
  );
  void resumed; // intermediate state, not returned — IN_PROGRESS is the resulting steady state
  return inProgress;
}

/** Used by a reconnect handler to confirm the session is safe to continue from, without forcing a state change if none is needed. */
export async function recoverSession(container: AppContainer, actor: ActorContext, orgId: OrgId, sessionId: SessionId): Promise<InterviewSession> {
  const existing = await container.repositories.sessions.getById(sessionId, orgId);
  if (!existing) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_VIEW", orgId, existing.studentId);

  const result = domainRecoverSession(existing);
  if (!result.ok) throw new ConflictError(result.error);
  return result.session;
}

export async function cancelSession(
  container: AppContainer,
  actor: ActorContext,
  orgId: OrgId,
  sessionId: SessionId,
  reason: string,
): Promise<InterviewSession> {
  const existing = await container.repositories.sessions.getById(sessionId, orgId);
  if (!existing) throw new NotFoundError("InterviewSession", sessionId);
  await requireAuthorized(container.ports.authz, actor, "INTERVIEW_CANCEL", orgId, existing.studentId);

  const cancelled = await transitionSessionSafely(container.repositories.sessions, sessionId, orgId, "CANCELLED", { cancelReason: reason });
  await logEvent(container.repositories.events, container.ports.observability, orgId, sessionId, "session.cancelled", { reason }, "interview.cancelled");
  return cancelled;
}
