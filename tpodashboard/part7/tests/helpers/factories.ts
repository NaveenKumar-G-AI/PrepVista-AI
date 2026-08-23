import { db } from "../../src/db/client";
import { institution, season, student, skill, taxonomyTerm, userAccount } from "../../src/db/schema";
import { newId } from "../../src/lib/id";

export async function makeInstitution(name = "Test Institute of Technology") {
  const [row] = await db.insert(institution).values({ id: newId("inst"), name }).returning();
  return row;
}

export async function makeSeason(institutionId: string, name = "2026 Placement Season") {
  const [row] = await db.insert(season).values({ id: newId("season"), institutionId, name }).returning();
  return row;
}

export async function makeStudent(institutionId: string, seasonId: string, overrides: Partial<{ name: string; department: string; batch: string; email: string }> = {}) {
  const [row] = await db
    .insert(student)
    .values({
      id: newId("stu"),
      institutionId,
      seasonId,
      name: overrides.name ?? "Test Student",
      department: overrides.department ?? "CSE",
      batch: overrides.batch ?? "2026",
      email: overrides.email ?? `student-${Math.random().toString(36).slice(2, 8)}@example.edu`,
    })
    .returning();
  return row;
}

export async function makeSkill(institutionId: string, name: string, category: string) {
  const [row] = await db.insert(skill).values({ id: newId("skill"), institutionId, name, category }).returning();
  return row;
}

export async function makeTaxonomyTerm(institutionId: string, domain: "TRAINING_CATEGORY" | "ASSESSMENT_CATEGORY" | "INTERVENTION_TYPE", code: string) {
  const [row] = await db.insert(taxonomyTerm).values({ id: newId("tax"), institutionId, domain, code, label: code }).returning();
  return row;
}

export async function makeUserAccount(
  institutionId: string,
  role: "TPO_HEAD" | "PLACEMENT_OFFICER" | "DEPT_COORDINATOR" | "FACULTY" | "STUDENT" | "MANAGEMENT",
  overrides: Partial<{ name: string; email: string; scopeDepartment: string; linkedStudentId: string }> = {}
) {
  const [row] = await db
    .insert(userAccount)
    .values({
      id: newId("user"),
      institutionId,
      role,
      name: overrides.name ?? `${role} Test User`,
      email: overrides.email ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@example.edu`,
      scopeDepartment: overrides.scopeDepartment,
      linkedStudentId: overrides.linkedStudentId,
    })
    .returning();
  return row;
}
