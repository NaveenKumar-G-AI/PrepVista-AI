// ============================================================================
// Voice (Phase 31-33), authorization (Phase 60-61), and observability
// (Phase 67) adapters. Voice is left unconfigured the same way the AI
// gateway is — real speech infra credentials go in your own secrets manager.
// ============================================================================

import type { ActorContext, OrgId, StudentId } from "../../domain/types.js";
import type { AuthzPort, InterviewAction, InterviewEventName, ObservabilityPort, VoicePort } from "../ports.js";

// ---- Voice -------------------------------------------------------------------

export class UnconfiguredVoiceAdapter implements VoicePort {
  async transcribe(): Promise<{ text: string }> {
    // Phase 33: speech failure must degrade to a safe text fallback, never
    // lose the session. Orchestration catches this and falls back to text
    // mode rather than letting it propagate as a fatal error.
    throw new Error("Voice transcription is not configured. Wire a real speech-to-text provider here (e.g. via its own adapter implementing VoicePort).");
  }
  async synthesize(): Promise<{ audioUrl: string }> {
    throw new Error("Voice synthesis is not configured. Wire a real text-to-speech provider here.");
  }
}

// ---- Authorization -------------------------------------------------------------

/**
 * Example policy matrix. Reuse existing authorization (Phase 61) means: in
 * the real codebase, this adapter should delegate to whatever
 * roles/permissions service already exists, not reimplement RBAC from
 * scratch. This version encodes a reasonable default matrix so the reference
 * implementation is safe to run and test standalone.
 */
const ACTION_ALLOWED_ROLES: Record<InterviewAction, ActorContext["roles"][number][]> = {
  INTERVIEW_CREATE: ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
  INTERVIEW_START: ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
  INTERVIEW_VIEW: ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
  INTERVIEW_RESPOND: ["STUDENT"],
  INTERVIEW_PAUSE: ["STUDENT"],
  INTERVIEW_RESUME: ["STUDENT"],
  INTERVIEW_COMPLETE: ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
  INTERVIEW_CANCEL: ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
  INTERVIEW_VIEW_HISTORY: ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
  INTERVIEW_VIEW_INSTITUTIONAL_REPORTS: ["TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"],
};

export class DefaultAuthzAdapter implements AuthzPort {
  async can(actor: ActorContext, action: InterviewAction, resourceOrgId: OrgId, resourceStudentId?: StudentId): Promise<boolean> {
    // Phase 60: tenant isolation is the first and non-negotiable gate.
    if (actor.orgId !== resourceOrgId) return false;

    const allowedRoles = ACTION_ALLOWED_ROLES[action];
    const hasAllowedRole = actor.roles.some((role) => allowedRoles.includes(role));
    if (!hasAllowedRole) return false;

    // A STUDENT actor may only touch their own resources — this is what
    // stops a student from viewing/responding to another student's session
    // even within the same org (Phase 69: cross-user access).
    const isStudentOnlyAction = action === "INTERVIEW_RESPOND" || action === "INTERVIEW_PAUSE" || action === "INTERVIEW_RESUME";
    if (actor.roles.includes("STUDENT") && actor.roles.length === 1 && (isStudentOnlyAction || resourceStudentId)) {
      if (!actor.studentId || !resourceStudentId || actor.studentId !== resourceStudentId) return false;
    }

    return true;
  }
}

// ---- Observability -------------------------------------------------------------

export interface TrackedEvent {
  event: InterviewEventName;
  payload: Record<string, unknown>;
  at: string;
}

/**
 * Collects events in memory so tests can assert on them (Phase 67). A real
 * adapter forwards `track()` to the platform's existing logging/metrics
 * pipeline (e.g. structured logs + a metrics client) — same interface, no
 * changes needed anywhere else.
 */
export class InMemoryObservabilityAdapter implements ObservabilityPort {
  public readonly events: TrackedEvent[] = [];
  track(event: InterviewEventName, payload: Record<string, unknown>): void {
    this.events.push({ event, payload, at: new Date().toISOString() });
  }
}

export class ConsoleObservabilityAdapter implements ObservabilityPort {
  track(event: InterviewEventName, payload: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event, ...payload, at: new Date().toISOString() }));
  }
}
