export type Role = "TPO_HEAD" | "PLACEMENT_OFFICER" | "DEPT_COORDINATOR" | "FACULTY" | "STUDENT" | "MANAGEMENT";

export interface Actor {
  id: string;
  institutionId: string;
  role: Role;
  scopeDepartment?: string | null;
  /** Only meaningful when role === "STUDENT". */
  linkedStudentId?: string | null;
}

/** Capability matrix (spec §65). Keep this as the single source of truth —
 *  routes and services both check against it instead of re-deriving rules. */
const CAPABILITIES = {
  MANAGE_TRAINING: ["TPO_HEAD", "PLACEMENT_OFFICER"],
  MANAGE_ASSESSMENTS: ["TPO_HEAD", "PLACEMENT_OFFICER"],
  MANAGE_INTERVENTIONS: ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPT_COORDINATOR"],
  RECORD_ATTENDANCE: ["TPO_HEAD", "PLACEMENT_OFFICER", "FACULTY"],
  VIEW_TPO_WORKBENCH: ["TPO_HEAD", "PLACEMENT_OFFICER", "DEPT_COORDINATOR"],
  VIEW_AGGREGATE_ANALYTICS: ["TPO_HEAD", "PLACEMENT_OFFICER", "MANAGEMENT", "DEPT_COORDINATOR"],
  // Deliberately excludes FACULTY — spec §48: faculty shouldn't automatically
  // see all student placement/offer information just because they can see
  // training/attendance/intervention progress for their assigned students.
  VIEW_PLACEMENT_OUTCOMES: ["TPO_HEAD", "PLACEMENT_OFFICER"],
} as const satisfies Record<string, readonly Role[]>;

export function can(actor: Actor, capability: keyof typeof CAPABILITIES): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(actor.role);
}

/**
 * Row-level visibility for a single student's detail. Management is
 * intentionally NOT given a "yes" here — management routes should never
 * accept a bare studentId in the first place (spec §66/§81: aggregate only),
 * so there's nothing to gate at this layer for that role.
 */
export function canViewStudentDetail(actor: Actor, studentId: string, studentDepartment?: string | null): boolean {
  switch (actor.role) {
    case "TPO_HEAD":
    case "PLACEMENT_OFFICER":
      return true;
    case "DEPT_COORDINATOR":
      return studentDepartment != null && studentDepartment === actor.scopeDepartment;
    case "FACULTY":
      // Narrowed further to *assigned* cohorts/interventions at the query
      // layer (see interventionService.getAssignedStudents) — this only
      // rules out completely unrelated students.
      return true;
    case "STUDENT":
      return actor.linkedStudentId === studentId;
    default:
      return false;
  }
}
