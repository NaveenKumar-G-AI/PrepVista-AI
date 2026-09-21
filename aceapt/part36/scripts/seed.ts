/**
 * Seeds a demo student so ACEAPT is immediately explorable.
 *
 * Run with: npm run seed
 * Reset with: npm run db:reset
 *
 * This calls the exact same service functions the running app uses
 * (bootstrapGoal, recordEvidence, refreshRecommendations) rather than
 * inserting rows by hand, so the seeded state is guaranteed to be
 * something the real engine could have produced.
 */
import { hashPassword } from "../src/lib/auth";
import { createUser, getUserByEmail } from "../src/lib/db/repoUsers";
import { listCapabilities, setBottleneck, getActiveGoal } from "../src/lib/db/repoGoals";
import { listCandidateActions, markCompleted } from "../src/lib/db/repoActions";
import { createOpportunity, createCommitment } from "../src/lib/db/repoPlanning";
import { bootstrapGoal } from "../src/lib/services/actionCompiler";
import { recordEvidence } from "../src/lib/services/evidenceService";
import { refreshRecommendations } from "../src/lib/services/recommendation";
import { setWeeklyAvailability } from "../src/lib/services/timeBudget";

const DEMO_EMAIL = "demo@aceapt.app";
const DEMO_PASSWORD = "demo1234";

async function main() {
  console.log("Seeding ACEAPT demo data…");

  if (getUserByEmail(DEMO_EMAIL)) {
    console.log(`Demo user ${DEMO_EMAIL} already exists — nothing to do.`);
    console.log("Run `npm run db:reset` to wipe the database and reseed from scratch.");
    return;
  }

  const user = createUser(DEMO_EMAIL, hashPassword(DEMO_PASSWORD), "Demo Student");
  console.log(`Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  const goal = await bootstrapGoal(user.id, "Land a Backend Developer role", "Backend Developer");
  console.log(`Created goal: ${goal.title}`);

  // Represents pre-existing history (as if Feature 35 — Career
  // Conversion & Failure-Recovery Intelligence — already ran and
  // identified this as the bottleneck).
  const capabilities = listCapabilities(user.id, goal.id);
  const technicalInterview = capabilities.find((c) => c.name === "Technical Interview Performance");
  if (technicalInterview) {
    setBottleneck(user.id, goal.id, technicalInterview.id);
    console.log(`Set initial bottleneck: ${technicalInterview.name}`);
  }

  const candidates = () => listCandidateActions(user.id, goal.id);
  const findByTitle = (title: string) => candidates().find((a) => a.title.toLowerCase() === title.toLowerCase());

  // First measured signal — baseline assessment.
  const baseline = findByTitle("Baseline technical interview performance assessment");
  if (baseline) {
    markCompleted(user.id, baseline.id, "SELF_REPORTED_COMPLETE");
    recordEvidence({
      userId: user.id,
      actionId: baseline.id,
      evidenceQuality: "MEASURED",
      resultSummary: "Baseline simulation completed.",
      scoreValue: 52,
      scoreLabel: "out of 100",
      notes: "First read on technical interview performance — establishes the starting point.",
    });
    console.log(`Recorded baseline evidence: ${baseline.title}`);
  }

  // A completed action with only self-reported completion (no
  // measured evidence) — demonstrates the distinction the spec
  // insists on (section 23) rather than every action being measured.
  const projectExplain = findByTitle("Explain your strongest project without notes");
  if (projectExplain) {
    markCompleted(user.id, projectExplain.id, "SELF_REPORTED_COMPLETE");
    console.log(`Marked self-reported complete: ${projectExplain.title}`);
  }

  // Second measured signal on the same capability — shows real
  // improvement, so trend/momentum/weekly review have something
  // genuine to display rather than an empty first-run state.
  const practiceRound = findByTitle("Technical Interview Performance practice round");
  if (practiceRound) {
    markCompleted(user.id, practiceRound.id, "SELF_REPORTED_COMPLETE");
    const { outcome } = recordEvidence({
      userId: user.id,
      actionId: practiceRound.id,
      evidenceQuality: "MEASURED",
      resultSummary: "Practice round completed.",
      scoreValue: 71,
      scoreLabel: "out of 100",
      notes: "Noticeably sharper than the baseline attempt.",
    });
    console.log(`Recorded practice evidence: ${practiceRound.title} → ${outcome.impact}`);
  }

  // An upcoming opportunity — gives the priority engine and Plan
  // Health something concrete to reason about (spec section 32).
  const eventDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  createOpportunity({
    userId: user.id,
    title: "Backend Engineer Intern — TechCorp",
    organization: "TechCorp",
    eventDate,
    opportunityType: "INTERVIEW",
    requiredCapabilities: ["Technical Interview Performance", "SQL Reasoning"],
  });
  console.log(`Added opportunity 4 days out: Backend Engineer Intern — TechCorp`);

  // A colliding academic commitment (spec sections 33-34).
  const examDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  createCommitment({
    userId: user.id,
    title: "Data Structures Mid-Semester Exam",
    commitmentType: "ACADEMIC",
    eventDate: examDate,
    loadLevel: "HIGH",
  });
  console.log(`Added academic commitment 2 days out`);

  setWeeklyAvailability(user.id, 6 * 60);
  console.log(`Set weekly time availability: 6h`);

  const activeGoal = getActiveGoal(user.id);
  if (activeGoal) {
    const { primary } = await refreshRecommendations(user.id, activeGoal);
    console.log(`Live next move computed: ${primary?.action.title ?? "(none)"}`);
  }

  console.log("\nDone. Start the app with `npm run dev` and sign in with:");
  console.log(`  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
