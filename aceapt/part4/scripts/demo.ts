import "dotenv/config";
import { PostgresStore } from "../src/repositories/postgresStore.js";
import { LearningPathService } from "../src/services/learningPathService.js";
import type { PathVersion } from "../src/domain/types.js";

function printPath(label: string, version: PathVersion) {
  console.log(`\n${"=".repeat(70)}\n${label}\n${"=".repeat(70)}`);
  console.log(`Reason: ${version.reason}`);
  if (version.tradeoffMessage) console.log(`Tradeoff: ${version.tradeoffMessage}`);
  console.log("");
  version.nodes.forEach((n, i) => {
    const marker = n.status === "VERIFIED" ? "✓" : n.status === "REVIEW_DUE" ? "◔" : i === 0 ? "◐" : "○";
    console.log(`${marker} [${i}] ${n.skillName}  (score ${n.priorityScore.toFixed(3)}, ${n.status})`);
    console.log(`     action: ${n.action.actionType} on ${n.action.targetSkillId}${n.action.interventionType ? ` [${n.action.interventionType}]` : ""}`);
    console.log(`     why: ${n.reason}`);
  });
}

async function main() {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const store = PostgresStore.fromConnectionString(appUrl);
  const service = new LearningPathService(store);

  try {
    const priya = await service.regeneratePath("priya-demo");
    const arjun = await service.regeneratePath("arjun-demo");

    printPath("PRIYA — goal: PLACEMENT_PREP, deadline: 20 days, 25 min/session", priya);
    printPath("ARJUN — goal: PLACEMENT_PREP, deadline: 3 days (URGENT), 15 min/session", arjun);

    console.log(`\n${"=".repeat(70)}\nSame skill evidence for both students. Path differs by context alone.\n${"=".repeat(70)}`);

    const priyaMission = await service.getTodaysMission("priya-demo");
    const arjunMission = await service.getTodaysMission("arjun-demo");
    console.log("\nPriya's today's plan (25 min):");
    priyaMission?.mission.segments.forEach((s) => console.log(`  - ${s.label}: ${s.minutes} min — ${s.description}`));
    console.log("\nArjun's today's plan (15 min, urgent):");
    arjunMission?.mission.segments.forEach((s) => console.log(`  - ${s.label}: ${s.minutes} min — ${s.description}`));

    const why = await service.explainNode("priya-demo", priya.nodes[0].skillId);
    console.log(`\nWhy-this for Priya's top node:`);
    console.log(JSON.stringify(why, null, 2));

    // ── Phase 23/25/46: close the loop for real ────────────────────────────
    // Simulate Feature 3 producing new evidence after Priya practices
    // Percentage Application (this is what src/api/routes/devEvidence.routes.ts
    // exists for in the real API — here we call the store directly). Then
    // regenerate and show that the path actually changes, with a reason that
    // traces to this specific evidence update — not a hand-authored message.
    console.log(`\n${"=".repeat(70)}\nCLOSING THE LOOP — Priya practices, Feature 3 reports new evidence\n${"=".repeat(70)}`);
    await store.upsertEvidence({
      studentId: "priya-demo",
      skillId: "percentage-application",
      foundation: { accuracy: 0.85, attempts: 7, avgResponseTimeMs: 24000, lastAssessedAt: new Date().toISOString() },
      application: { accuracy: 0.83, attempts: 8, avgResponseTimeMs: 27000, lastAssessedAt: new Date().toISOString() },
      transferFamiliar: { accuracy: 0.7, attempts: 3, avgResponseTimeMs: 30000, lastAssessedAt: new Date().toISOString() },
      transferVariant: { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null },
      recentDifficulty: "ADVANCED",
      recentErrorSignatures: [],
      verifiedAt: new Date().toISOString(),
    });
    const priyaReplanned = await service.regeneratePath("priya-demo");
    printPath("PRIYA — after new evidence (Percentage Application now strong)", priyaReplanned);
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
