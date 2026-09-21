import { dataSource } from "./inMemoryRepository";

/**
 * Seeds obviously-fictional demo data into the in-memory store, for local
 * preview only (spec section 50, "No Fake Intelligence" — never in
 * production). The in-memory store is a singleton scoped to a single Node
 * process, so this only has a visible effect on whichever process calls it —
 * see SEED_DEMO_DATA in server.ts for seeding a running dev server directly.
 */
export async function seedDemoData(): Promise<void> {
  await dataSource.__seedDemoData({
    studentId: "demo-student",
    role: {
      id: "role-backend",
      name: "Backend Developer",
      requirements: [
        { id: "r1", name: "Python", importance: "core" },
        { id: "r2", name: "REST API", importance: "core" },
        { id: "r3", name: "PostgreSQL", importance: "supporting" },
        { id: "r4", name: "Testing", importance: "supporting" },
      ],
    },
    capabilities: [
      { id: "c1", name: "Python", evidenceStrength: "validated", evidenceSourceIds: ["assessment-1"] },
      { id: "c2", name: "REST API", evidenceStrength: "demonstrated", evidenceSourceIds: ["project-1"] },
      { id: "c3", name: "PostgreSQL", evidenceStrength: "demonstrated", evidenceSourceIds: ["project-1"] },
      { id: "c4", name: "Machine Learning", evidenceStrength: "developing", evidenceSourceIds: ["course-1"] },
    ],
    projects: [
      {
        id: "project-1",
        title: "(Demo) Order Management API",
        description: "A demo backend project used only for local preview.",
        technologies: ["Python", "REST API", "PostgreSQL"],
        validated: true,
        recencyMonthsAgo: 2,
        evidenceSourceIds: ["project-1"],
      },
    ],
    stories: [
      {
        id: "story-1",
        projectId: "project-1",
        category: "technical",
        situation: "(Demo) situation text",
        task: "(Demo) task text",
        action: "(Demo) action text",
        result: undefined,
        hasMeasurableResult: false,
      },
    ],
    snapshot: {
      resumeStatedFocus: "Machine Learning",
      portfolioStatedFocus: "Backend Development",
      introductionStatedFocus: "Backend Development",
    },
  });
}
