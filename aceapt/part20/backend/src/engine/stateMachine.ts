export type SessionStatus = "IN_PROGRESS" | "SUBMITTED" | "TIME_EXPIRED" | "PROCESSING" | "ANALYZED" | "COMPLETED";

const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  IN_PROGRESS: ["SUBMITTED", "TIME_EXPIRED"],
  SUBMITTED: ["PROCESSING"],
  TIME_EXPIRED: ["PROCESSING"],
  PROCESSING: ["ANALYZED"],
  ANALYZED: ["COMPLETED"],
  COMPLETED: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid session state transition: ${from} -> ${to}`);
  }
}

export const ACTIVE_STATUSES: SessionStatus[] = ["IN_PROGRESS"];
