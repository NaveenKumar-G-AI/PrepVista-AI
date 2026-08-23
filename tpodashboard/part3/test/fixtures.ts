import type { Student } from "../src/types.js";

export function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: "S-TEST",
    name: "Test Student",
    department: "CSE",
    program: "B.Tech",
    graduationYear: 2026,
    semester: 8,
    cgpa: 8.0,
    tenthPercentage: 85,
    twelfthPercentage: 82,
    activeBacklogs: 0,
    totalBacklogs: 0,
    skills: ["Python", "SQL"],
    certifications: [],
    internshipCount: 1,
    experienceMonths: 0,
    placementStatus: "UNPLACED",
    ...overrides,
  };
}
