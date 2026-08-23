/**
 * Stand-in persistence layer.
 *
 * In the real PrepVista monorepo this module would be replaced by the actual
 * Part 1-11 repositories (students, drives, applications, interviews, offers).
 * Part 14 never talks to a database directly for domain data — it only reads
 * through these repository-shaped interfaces and writes only through the
 * services/ stubs (which stand in for Part 9's CommunicationService, Part 7's
 * TrainingService, etc). Swapping this file for real DB-backed repositories is
 * the entire integration surface.
 */

export interface Student {
  id: string;
  institutionId: string;
  name: string;
  department: string;
  eligible: boolean;
  readiness: number; // 0-100
  optedOutOfComms?: boolean;
}

export interface Application {
  studentId: string;
  driveId: string;
}

export type InterviewResultStatus = "pending" | "reviewed" | "published";

export interface InterviewResultRecord {
  id: string;
  institutionId: string;
  driveId: string;
  studentId: string;
  status: InterviewResultStatus;
  outcome?: "selected" | "rejected";
}

export interface Offer {
  id: string;
  institutionId: string;
  studentId: string;
  company: string;
  ctc: string;
  deadline: string;
  status: "pending" | "accepted" | "declined" | "expired";
}

const INSTITUTION = "inst-1";
const DRIVE_ABC = "drive-abc-technologies";
const DRIVE_XYZ = "drive-xyz-systems";

const DEPARTMENTS = ["CSE", "IT", "ECE", "ME"];

function makeStudents(): Student[] {
  const students: Student[] = [];
  for (let i = 0; i < 90; i++) {
    const department = DEPARTMENTS[i % DEPARTMENTS.length]!;
    students.push({
      id: `stu-${String(i + 1).padStart(3, "0")}`,
      institutionId: INSTITUTION,
      name: `Student ${i + 1}`,
      department,
      // First 85 are eligible for DRIVE_ABC; remaining 5 are not (matches the
      // "83 eligible, not-applied" walkthrough number in spec section 91: 85
      // eligible - 2 already applied = 83 remaining).
      eligible: i < 85,
      // First 42 students have low readiness (<55) — used by the training
      // cohort-assignment example in spec section 15/91.
      readiness: i < 42 ? 30 + (i % 20) : 60 + (i % 35),
      optedOutOfComms: i === 10, // one student has opted out, to prove the filter is respected
    });
  }
  return students;
}

const students: Student[] = makeStudents();

// First two eligible students have already applied to DRIVE_ABC.
const applications: Application[] = [
  { studentId: "stu-001", driveId: DRIVE_ABC },
  { studentId: "stu-002", driveId: DRIVE_ABC },
];

// 37 reviewed-and-ready interview results for DRIVE_XYZ (spec section 91: "Publish
// these 37 interview results"), plus 3 still-pending results for a *different*
// drive used to demonstrate the precondition-failure path (spec section 54/91).
const interviewResults: InterviewResultRecord[] = [];
for (let i = 0; i < 37; i++) {
  interviewResults.push({
    id: `ivr-xyz-${i + 1}`,
    institutionId: INSTITUTION,
    driveId: DRIVE_XYZ,
    studentId: students[i]!.id,
    status: "reviewed",
    outcome: i % 5 === 0 ? "selected" : "rejected",
  });
}
const DRIVE_PENDING = "drive-pending-corp";
for (let i = 0; i < 3; i++) {
  interviewResults.push({
    id: `ivr-pending-${i + 1}`,
    institutionId: INSTITUTION,
    driveId: DRIVE_PENDING,
    studentId: students[i + 40]!.id,
    status: "pending",
  });
}

const offers: Offer[] = [
  {
    id: "offer-001",
    institutionId: INSTITUTION,
    studentId: "stu-005",
    company: "ABC Technologies",
    ctc: "8 LPA",
    deadline: "2026-08-18",
    status: "pending",
  },
];

export const seed = {
  INSTITUTION,
  DRIVE_ABC,
  DRIVE_XYZ,
  DRIVE_PENDING,
};

export const studentRepo = {
  all(institutionId: string): Student[] {
    return students.filter((s) => s.institutionId === institutionId);
  },
  byId(id: string): Student | undefined {
    return students.find((s) => s.id === id);
  },
  /** Eligible students for a drive who have NOT yet applied, respecting comms opt-out on request. */
  eligibleNotApplied(institutionId: string, driveId: string): Student[] {
    const appliedIds = new Set(applications.filter((a) => a.driveId === driveId).map((a) => a.studentId));
    return students.filter((s) => s.institutionId === institutionId && s.eligible && !appliedIds.has(s.id));
  },
  belowReadiness(institutionId: string, threshold: number): Student[] {
    return students.filter((s) => s.institutionId === institutionId && s.readiness < threshold);
  },
  applyToDrive(studentId: string, driveId: string) {
    applications.push({ studentId, driveId });
  },
  unapplyFromDrive(studentId: string, driveId: string) {
    const idx = applications.findIndex((a) => a.studentId === studentId && a.driveId === driveId);
    if (idx >= 0) applications.splice(idx, 1);
  },
};

export const interviewRepo = {
  forDrive(institutionId: string, driveId: string): InterviewResultRecord[] {
    return interviewResults.filter((r) => r.institutionId === institutionId && r.driveId === driveId);
  },
  publish(institutionId: string, driveId: string): { published: number } {
    let published = 0;
    for (const r of interviewResults) {
      if (r.institutionId === institutionId && r.driveId === driveId && r.status === "reviewed") {
        r.status = "published";
        published++;
      }
    }
    return { published };
  },
};

export const offerRepo = {
  byId(institutionId: string, offerId: string): Offer | undefined {
    return offers.find((o) => o.institutionId === institutionId && o.id === offerId);
  },
  accept(institutionId: string, offerId: string): Offer {
    const offer = offers.find((o) => o.institutionId === institutionId && o.id === offerId);
    if (!offer) throw new Error("Offer not found");
    offer.status = "accepted";
    return offer;
  },
};
