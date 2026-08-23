export type DriveStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "APPLICATIONS_OPEN"
  | "APPLICATIONS_CLOSED"
  | "IN_PROGRESS"
  | "SELECTION_PENDING"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

// Every non-terminal state can also move to CANCELLED; UNDER_REVIEW can
// bounce back to DRAFT for rework. ARCHIVED is terminal. This is a
// deliberate default, not something the spec pins down exactly - easy to
// adjust once real institution policy is known.
const TRANSITIONS: Record<DriveStatus, DriveStatus[]> = {
  DRAFT: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["APPLICATIONS_OPEN", "CANCELLED"],
  APPLICATIONS_OPEN: ["APPLICATIONS_CLOSED", "CANCELLED"],
  APPLICATIONS_CLOSED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SELECTION_PENDING", "COMPLETED", "CANCELLED"],
  SELECTION_PENDING: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from: DriveStatus, to: DriveStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function legalNextStates(from: DriveStatus): DriveStatus[] {
  return TRANSITIONS[from] ?? [];
}
