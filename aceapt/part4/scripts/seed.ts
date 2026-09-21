import "dotenv/config";
import pg from "pg";
import { SKILL_CATALOG } from "../src/data/skillCatalog.js";
import { PostgresStore } from "../src/repositories/postgresStore.js";
import type { SkillEvidenceRecord } from "../src/domain/types.js";

const now = new Date();
function daysAgo(n: number): string {
  return new Date(now.getTime() - n * 86_400_000).toISOString();
}
function daysFromNow(n: number): string {
  return new Date(now.getTime() + n * 86_400_000).toISOString();
}

async function seedCatalog(admin: pg.Client) {
  for (const skill of SKILL_CATALOG) {
    await admin.query(
      `INSERT INTO skills (id, name, category, base_relevance, estimated_learn_minutes) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, base_relevance = EXCLUDED.base_relevance, estimated_learn_minutes = EXCLUDED.estimated_learn_minutes`,
      [skill.id, skill.name, skill.category, JSON.stringify(skill.baseRelevance), skill.estimatedLearnMinutes]
    );
  }
  for (const skill of SKILL_CATALOG) {
    for (const prereqId of skill.prerequisiteIds) {
      await admin.query(`INSERT INTO skill_prerequisites (skill_id, prerequisite_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [skill.id, prereqId]);
    }
  }
  console.log(`Seeded ${SKILL_CATALOG.length} skills.`);
}

async function seedStudent(admin: pg.Client, id: string, name: string, goal: string, deadlineDays: number | null, availableMinutes: number) {
  await admin.query(
    `INSERT INTO students (id, name, goal, deadline, available_minutes) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, goal = EXCLUDED.goal, deadline = EXCLUDED.deadline, available_minutes = EXCLUDED.available_minutes`,
    [id, name, goal, deadlineDays === null ? null : daysFromNow(deadlineDays), availableMinutes]
  );
}

/** Identical for both demo students on purpose — see scripts/demo.ts for why. */
function sharedEvidence(studentId: string): SkillEvidenceRecord[] {
  return [
    {
      studentId,
      skillId: "percentage-fundamentals",
      foundation: { accuracy: 0.92, attempts: 10, avgResponseTimeMs: 18000, lastAssessedAt: daysAgo(5) },
      application: { accuracy: 0.88, attempts: 8, avgResponseTimeMs: 22000, lastAssessedAt: daysAgo(5) },
      transferFamiliar: { accuracy: 0.85, attempts: 6, avgResponseTimeMs: 24000, lastAssessedAt: daysAgo(6) },
      transferVariant: { accuracy: 0.8, attempts: 6, avgResponseTimeMs: 26000, lastAssessedAt: daysAgo(6) },
      recentDifficulty: "INTERMEDIATE",
      recentErrorSignatures: [],
      verifiedAt: daysAgo(5),
    },
    {
      studentId,
      skillId: "percentage-application",
      foundation: { accuracy: 0.8, attempts: 5, avgResponseTimeMs: 26000, lastAssessedAt: daysAgo(3) },
      application: { accuracy: 0.5, attempts: 4, avgResponseTimeMs: 34000, lastAssessedAt: daysAgo(2) },
      transferFamiliar: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      transferVariant: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      recentDifficulty: "INTERMEDIATE",
      recentErrorSignatures: ["base_value_confusion", "base_value_confusion"],
      verifiedAt: null,
    },
    {
      studentId,
      skillId: "profit-loss",
      foundation: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      application: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      transferFamiliar: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      transferVariant: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      recentDifficulty: "FOUNDATION",
      recentErrorSignatures: [],
      verifiedAt: null,
    },
    {
      studentId,
      skillId: "discount",
      foundation: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      application: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      transferFamiliar: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      transferVariant: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      recentDifficulty: "FOUNDATION",
      recentErrorSignatures: [],
      verifiedAt: null,
    },
    {
      studentId,
      skillId: "ratio-fundamentals",
      foundation: { accuracy: 0.9, attempts: 8, avgResponseTimeMs: 20000, lastAssessedAt: daysAgo(45) },
      application: { accuracy: 0.85, attempts: 7, avgResponseTimeMs: 21000, lastAssessedAt: daysAgo(45) },
      transferFamiliar: { accuracy: 0.83, attempts: 6, avgResponseTimeMs: 23000, lastAssessedAt: daysAgo(46) },
      transferVariant: { accuracy: 0.81, attempts: 6, avgResponseTimeMs: 25000, lastAssessedAt: daysAgo(46) },
      recentDifficulty: "INTERMEDIATE",
      recentErrorSignatures: [],
      verifiedAt: daysAgo(45), // > FRESHNESS_THRESHOLD_DAYS (30) — deliberately stale, exercises the REVIEW path
    },
  ];
}

async function seedAttempts(store: PostgresStore, studentId: string) {
  // A few raw attempts for percentage-application feed the stuck-detection
  // window and the daily-mission demo without being stuck (mixed correctness).
  const attempts: Array<[boolean, boolean, string | null, number, number]> = [
    [true, false, null, 28000, 30000],
    [false, false, "base_value_confusion", 41000, 30000],
    [true, false, null, 29000, 30000],
    [false, true, "base_value_confusion", 45000, 30000],
  ];
  for (const [correct, hintUsed, errorSignature, timeMs, expectedTimeMs] of attempts) {
    await store.recordAttempt(studentId, { skillId: "percentage-application", correct, hintUsed, errorSignature, timeMs, expectedTimeMs });
  }
}

async function main() {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  if (!migrationUrl || !appUrl) {
    console.error("MIGRATION_DATABASE_URL and DATABASE_URL must both be set. See .env.example.");
    process.exit(1);
  }

  const admin = new pg.Client({ connectionString: migrationUrl });
  await admin.connect();
  const store = PostgresStore.fromConnectionString(appUrl);

  try {
    await seedCatalog(admin);

    // Same underlying skill evidence for both students — only goal/deadline/
    // time differ, so any difference in their generated paths comes from
    // context, not from different evidence (Feature 4's core claim).
    await seedStudent(admin, "priya-demo", "Priya", "PLACEMENT_PREP", 20, 25);
    await seedStudent(admin, "arjun-demo", "Arjun", "PLACEMENT_PREP", 3, 15);

    for (const studentId of ["priya-demo", "arjun-demo"]) {
      for (const evidence of sharedEvidence(studentId)) {
        await store.upsertEvidence(evidence);
      }
      await seedAttempts(store, studentId);
    }

    console.log("Seed complete: priya-demo (20-day deadline, 25 min/session), arjun-demo (3-day deadline, 15 min/session).");
  } finally {
    await admin.end();
    await store.close();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
