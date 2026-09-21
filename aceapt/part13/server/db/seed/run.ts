import "dotenv/config";
import { Client } from "pg";
import { pool } from "../../src/db/pool.js";
import { newId } from "../../src/db/ids.js";
import * as repo from "../../src/db/repository.js";
import * as simulationService from "../../src/simulation/simulationService.js";
import { recomputeReadiness } from "../../src/engines/readinessService.js";
import { MockFeature12Client } from "../../src/integration/featureClients.js";
import type { PracticeMode } from "../../src/domain/types.js";
import { PROFILE_DEFS, QUESTION_DEFS, TOPIC_DEFS, TOPIC_SLUGS, type TopicSlug } from "./data.js";

// ---------------------------------------------------------------------------
// Small deterministic RNG + scenario generator, seed-script-local. Each
// simulation targets an approximate accuracy per third of the paper (not
// exact — "tells the demo story", per this build's README) plus an optional
// forced time-sink and topic-switch penalty, then expresses that as a raw
// EVENT STREAM (not pre-built attempt rows) so every seeded simulation goes
// through the exact same start -> events -> submit pipeline a real client
// would use. This doubles as an end-to-end smoke test of that pipeline.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);
const clamp01 = (n: number) => Math.max(0.03, Math.min(0.97, n));

interface ScenarioOptions {
  firstQuarterAccuracy: number;
  middleAccuracy: number;
  finalQuarterAccuracy: number;
  unansweredInFinal: number;
  postSwitchPenalty: number;
  speedProfile: "fast" | "normal" | "slow" | "mixed";
  forceSinkAtIndex?: number; // forces one specific question into a slow, wrong, time-sink pattern
}

function segmentAccuracy(index: number, total: number, opts: ScenarioOptions): number {
  const frac = index / total;
  if (frac < 0.25) return opts.firstQuarterAccuracy;
  if (frac < 0.75) return opts.middleAccuracy;
  return opts.finalQuarterAccuracy;
}

/** Combined difficulty + topic-switch pull on the segment's target
 * probability, capped so it nudges rather than compounds past it — a hard
 * question right after a switch shouldn't be able to drag probability
 * arbitrarily far from what the scenario asked for. */
function adjustProbability(base: number, difficulty: "easy" | "medium" | "hard", isSwitch: boolean, postSwitchPenalty: number): number {
  let adjustment = (difficulty === "hard" ? -0.08 : difficulty === "easy" ? 0.06 : 0) + (isSwitch ? -postSwitchPenalty : 0);
  adjustment = Math.max(-0.18, Math.min(0.1, adjustment));
  return clamp01(base + adjustment);
}

function speedMultiplier(profile: ScenarioOptions["speedProfile"], rng: () => number): number {
  switch (profile) {
    case "fast":
      return 0.5 + rng() * 0.3;
    case "slow":
      return 1.2 + rng() * 0.6;
    case "mixed":
      return 0.6 + rng() * 1.0;
    default:
      return 0.8 + rng() * 0.4;
  }
}

interface SlotForEvents {
  questionId: string;
  topicId: string;
  difficulty: "easy" | "medium" | "hard";
  correctOptionId: string;
  wrongOptionId: string;
  expectedTimeSeconds: number;
}

function craftEvents(startedAt: Date, slots: SlotForEvents[], opts: ScenarioOptions, seed: number) {
  const rng = mulberry32(seed);
  const events: repo.RawEventInput[] = [];
  let clock = startedAt.getTime();

  events.push({ questionId: null, eventType: "ASSESSMENT_STARTED", eventTimestamp: new Date(clock).toISOString(), payload: {} });

  let lastTopic: string | null = null;
  slots.forEach((slot, i) => {
    const segmentTarget = segmentAccuracy(i, slots.length, opts);
    const isSwitch = lastTopic !== null && lastTopic !== slot.topicId;
    const pCorrect = adjustProbability(segmentTarget, slot.difficulty, isSwitch, opts.postSwitchPenalty);
    lastTopic = slot.topicId;

    const isUnanswered = i >= slots.length - opts.unansweredInFinal;
    if (isUnanswered) {
      // Genuinely never reached — no events at all, which the reconciler
      // treats as 'unanswered' (as opposed to an explicit QUESTION_SKIPPED,
      // which reconciles to 'skipped'). Models running out of time, not a
      // deliberate triage decision.
      return;
    }

    events.push({ questionId: slot.questionId, eventType: "QUESTION_VIEWED", eventTimestamp: new Date(clock).toISOString(), payload: {} });

    const isForcedSink = opts.forceSinkAtIndex === i;
    const correct = isForcedSink ? false : rng() < pCorrect;
    const mult = isForcedSink ? 2.3 : speedMultiplier(opts.speedProfile, rng);
    const timeSpent = Math.max(8, Math.round(slot.expectedTimeSeconds * mult));
    const selectedOptionId = correct ? slot.correctOptionId : slot.wrongOptionId;

    clock += timeSpent * 1000;
    events.push({
      questionId: slot.questionId,
      eventType: "QUESTION_ANSWERED",
      eventTimestamp: new Date(clock).toISOString(),
      payload: { selectedOptionId, timeSpentDeltaSeconds: timeSpent },
    });
    events.push({
      questionId: slot.questionId,
      eventType: "QUESTION_SUBMITTED",
      eventTimestamp: new Date(clock).toISOString(),
      payload: { selectedOptionId },
    });
  });

  events.push({ questionId: null, eventType: "ASSESSMENT_SUBMITTED", eventTimestamp: new Date(clock).toISOString(), payload: {} });
  return { events, submittedAt: new Date(clock) };
}

// ---------------------------------------------------------------------------
// Reset + reference data
// ---------------------------------------------------------------------------

async function resetData(): Promise<void> {
  const url = process.env.MIGRATIONS_DATABASE_URL;
  if (!url) throw new Error("MIGRATIONS_DATABASE_URL is required to reset seed data (needs TRUNCATE privilege).");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `TRUNCATE TABLE interventions, readiness_evidence, readiness_gaps, readiness_dimension_scores,
         readiness_snapshots, simulation_attempts, simulation_question_events, simulation_questions,
         simulations, assessment_blueprints, assessment_profiles, questions, topics, students
       RESTART IDENTITY CASCADE`
    );
    console.log("Reset: cleared existing seed-managed tables.");
  } finally {
    await client.end();
  }
}

async function bootstrapStudent(fullName: string, email: string): Promise<string> {
  const url = process.env.MIGRATIONS_DATABASE_URL;
  if (!url) throw new Error("MIGRATIONS_DATABASE_URL is required to bootstrap the demo student.");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const id = newId();
    await client.query(
      `INSERT INTO students (id, full_name, email, target_score, target_assessment, target_date) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, fullName, email, 80, "General Aptitude — Campus Placement", daysAgo(-14)]
    );
    return id;
  } finally {
    await client.end();
  }
}

async function insertReferenceData(): Promise<{ topicIdBySlug: Record<TopicSlug, string>; profileIdBySlug: Record<string, string> }> {
  const topicIdBySlug = {} as Record<TopicSlug, string>;
  for (const slug of TOPIC_SLUGS) {
    const id = newId();
    topicIdBySlug[slug] = id;
    await pool.query(`INSERT INTO topics (id, name, category) VALUES ($1,$2,$3)`, [id, TOPIC_DEFS[slug].name, TOPIC_DEFS[slug].category]);
  }
  console.log(`Seeded ${TOPIC_SLUGS.length} topics.`);

  for (const q of QUESTION_DEFS) {
    await pool.query(
      `INSERT INTO questions (id, topic_id, skill, difficulty, question_type, prompt, options, correct_option_id, explanation, expected_time_seconds)
       VALUES ($1,$2,$3,$4,'mcq',$5,$6,$7,$8,$9)`,
      [
        newId(),
        topicIdBySlug[q.topic],
        q.skill,
        q.difficulty,
        q.prompt,
        JSON.stringify(q.options),
        q.correctOptionId,
        q.explanation,
        q.expectedTimeSeconds,
      ]
    );
  }
  console.log(`Seeded ${QUESTION_DEFS.length} questions.`);

  const profileIdBySlug: Record<string, string> = {};
  for (const p of PROFILE_DEFS) {
    const id = newId();
    profileIdBySlug[p.slug] = id;
    const questionCount = p.sections.reduce((s, sec) => s + sec.questionCount, 0);
    const sections = p.sections.map((sec) => ({
      name: sec.name,
      topicIds: sec.topics.map((t) => topicIdBySlug[t]),
      questionCount: sec.questionCount,
    }));
    await pool.query(
      `INSERT INTO assessment_profiles
         (id, name, assessment_type, duration_minutes, question_count, sections, difficulty_distribution,
          negative_marking, scoring_rules, target_score, question_time_expectation_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        p.name,
        p.assessmentType,
        p.durationMinutes,
        questionCount,
        JSON.stringify(sections),
        JSON.stringify(p.difficultyDistribution),
        JSON.stringify(p.negativeMarking),
        JSON.stringify(p.scoringRules),
        p.targetScore,
        p.questionTimeExpectationSeconds,
      ]
    );
  }
  console.log(`Seeded ${PROFILE_DEFS.length} assessment profiles.`);

  return { topicIdBySlug, profileIdBySlug };
}

// ---------------------------------------------------------------------------
// Run one seeded simulation through the real start -> events -> submit path
// ---------------------------------------------------------------------------

async function runSeededSimulation(input: {
  studentId: string;
  profileId: string;
  practiceMode: PracticeMode;
  startedAt: Date;
  scenario: ScenarioOptions;
  seed: number;
}): Promise<string> {
  const started = await simulationService.startSimulation(input.studentId, input.profileId, input.practiceMode);
  const questionIds = started.questions.map((q) => q.questionId);
  const answerKey = await repo.getAnswerKey(questionIds);
  const meta = await repo.getQuestionMeta(questionIds);

  const slots: SlotForEvents[] = started.questions.map((q) => {
    const m = meta.get(q.questionId);
    const correctOptionId = answerKey.get(q.questionId) ?? q.options[0]!.id;
    const wrongOption = q.options.find((o) => o.id !== correctOptionId) ?? q.options[0]!;
    return {
      questionId: q.questionId,
      topicId: m?.topicId ?? "",
      difficulty: m?.difficulty ?? "medium",
      correctOptionId,
      wrongOptionId: wrongOption.id,
      expectedTimeSeconds: q.expectedTimeSeconds,
    };
  });

  const { events, submittedAt } = craftEvents(input.startedAt, slots, input.scenario, input.seed);
  await simulationService.recordEvents(input.studentId, started.simulationId, events, input.startedAt);
  const postmortem = await simulationService.submitSimulation(input.studentId, started.simulationId, submittedAt);

  console.log(
    `  [${input.practiceMode}] ${submittedAt.toISOString().slice(0, 10)} — score ${postmortem.score}/${postmortem.maxScore} ` +
      `(${postmortem.accuracyPct}% accuracy), ${postmortem.unansweredCount} unanswered`
  );
  return started.simulationId;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding ACEAPT Feature 13 demo data...\n");
  await resetData();
  const { profileIdBySlug } = await insertReferenceData();
  const profileId = profileIdBySlug["general-aptitude"]!;

  const studentId = await bootstrapStudent("Ananya Rao", "ananya.rao@example.edu");
  console.log(`\nDemo student: Ananya Rao (${studentId})\n`);

  console.log("Playing simulation history through the live start -> events -> submit pipeline:");

  // 1. Untimed topic practice — strong, unhurried, minimal switch cost. (~87%)
  await runSeededSimulation({
    studentId, profileId, practiceMode: "topic_practice", startedAt: daysAgo(24),
    scenario: { firstQuarterAccuracy: 0.94, middleAccuracy: 0.90, finalQuarterAccuracy: 0.88, unansweredInFinal: 0, postSwitchPenalty: 0.04, speedProfile: "slow" },
    seed: 4,
  });
  await recomputeReadiness(studentId, null, daysAgo(24));

  // 2. Timed practice — a clock appears, accuracy softens a little. (~79%)
  await runSeededSimulation({
    studentId, profileId, practiceMode: "timed_practice", startedAt: daysAgo(18),
    scenario: { firstQuarterAccuracy: 0.90, middleAccuracy: 0.84, finalQuarterAccuracy: 0.78, unansweredInFinal: 1, postSwitchPenalty: 0.08, speedProfile: "normal" },
    seed: 6,
  });
  await recomputeReadiness(studentId, null, daysAgo(18));

  // 3. First realistic simulation — the wake-up call: strong start, sharp
  // mid/late decline, a forced time sink, real topic-switch cost. (~61%)
  await runSeededSimulation({
    studentId, profileId, practiceMode: "realistic_simulation", startedAt: daysAgo(14),
    scenario: {
      firstQuarterAccuracy: 0.90, middleAccuracy: 0.68, finalQuarterAccuracy: 0.45,
      unansweredInFinal: 2, postSwitchPenalty: 0.16, speedProfile: "mixed", forceSinkAtIndex: 19,
    },
    seed: 2,
  });
  const snapshotAfterFirstSim = await recomputeReadiness(studentId, null, daysAgo(14));

  // Feature 12 handoff: ask for an intervention against the worst gap.
  const worstGap = snapshotAfterFirstSim.gaps[0];
  let interventionId: string | null = null;
  if (worstGap) {
    const feature12 = new MockFeature12Client();
    const recommendation = await feature12.recommendIntervention({
      studentId,
      gapDimensionKey: worstGap.dimensionKey,
      evidenceSummary: snapshotAfterFirstSim.dimensions.find((d) => d.dimensionKey === worstGap.dimensionKey)?.evidenceSummary ?? "",
    });
    if (recommendation) {
      interventionId = await repo.createIntervention({
        studentId,
        readinessSnapshotId: snapshotAfterFirstSim.id,
        gapDimensionKey: worstGap.dimensionKey,
        interventionType: recommendation.interventionType,
      });
      console.log(`\nFeature 12 handoff: worst gap is "${worstGap.dimensionKey}" -> recommended ${recommendation.interventionType}\n`);
    }
  }

  // 4. Mixed practice — deliberately working the recommended intervention. (~74%)
  await runSeededSimulation({
    studentId, profileId, practiceMode: "mixed_practice", startedAt: daysAgo(7),
    scenario: { firstQuarterAccuracy: 0.90, middleAccuracy: 0.82, finalQuarterAccuracy: 0.72, unansweredInFinal: 0, postSwitchPenalty: 0.10, speedProfile: "normal" },
    seed: 16,
  });
  await recomputeReadiness(studentId, null, daysAgo(7));

  // 5. Resimulation — does the improvement transfer to a fresh realistic run? (~76%)
  const resimId = await runSeededSimulation({
    studentId, profileId, practiceMode: "realistic_simulation", startedAt: daysAgo(0),
    scenario: { firstQuarterAccuracy: 0.92, middleAccuracy: 0.86, finalQuarterAccuracy: 0.76, unansweredInFinal: 0, postSwitchPenalty: 0.08, speedProfile: "normal" },
    seed: 15,
  });
  const finalSnapshot = await recomputeReadiness(studentId, null);

  if (interventionId) {
    await repo.completeIntervention(studentId, interventionId, resimId);
  }

  console.log("\nFinal readiness snapshot:");
  console.log(`  Overall: ${finalSnapshot.overallScore}% — ${finalSnapshot.overallState} (confidence: ${finalSnapshot.confidence.level})`);
  console.log(`  Evidence: ${finalSnapshot.evidenceCount} realistic simulation(s)`);
  console.log("  Top gaps:", finalSnapshot.gaps.slice(0, 3).map((g) => g.dimensionKey).join(", ") || "none");
  console.log(`\nDone. Set X-Student-Id: ${studentId} on requests to the API (dev auth fallback) to explore this student.`);
  console.log(`Try: curl -H "X-Student-Id: ${studentId}" http://localhost:4013/api/readiness | jq`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
