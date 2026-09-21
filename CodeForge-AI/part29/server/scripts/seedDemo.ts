/**
 * Implements the spec's "REQUIRED DEMONSTRATION": two students with
 * different starting technical profiles, run through the real event
 * pipeline (not a hand-written fake dashboard), producing genuinely
 * different growth trajectories.
 *
 * Student A: Algorithms strong, Debugging weak, Reasoning strong, Transfer weak.
 * Student B: Algorithms moderate, Debugging strong (with a real regression +
 *            recovery arc), Reasoning moderate, Transfer strong.
 *
 * Run: npm run seed:demo
 */
import "dotenv/config";
import { pool } from "../src/db/client.js";
import { ingestSkillSignalUpdate } from "../src/events/pipeline.js";

interface EvidencePoint {
  daysFromStart: number;
  scoreRaw: number;
  type: "CHALLENGE_SUBMISSION" | "ADAPTIVE_CHALLENGE" | "ASSESSMENT" | "DIAGNOSTIC" | "DEBUGGING_TASK" | "UNDERSTANDING_CHECK";
  difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
  isTransfer?: boolean;
  problemFamily?: string;
  demonstratesComplexityReasoning?: boolean;
}

interface SignalPoint {
  daysFromStart: number;
  value: number;
  sourceType: "DIAGNOSTIC" | "ASSESSMENT" | "AGGREGATED_SIGNAL";
  assessmentType?: string;
  roleRelevance?: number;
}

const START = new Date("2026-06-01T00:00:00Z");
const day = (n: number) => new Date(START.getTime() + n * 24 * 60 * 60 * 1000);

async function upsertUser(email: string, name: string, role: "STUDENT" | "TPO" | "ADMIN") {
  const existing = await pool.query("select id from users where email = $1", [email]);
  if ((existing.rowCount ?? 0) > 0) return existing.rows[0].id as string;
  const res = await pool.query(
    "insert into users (email, name, role) values ($1,$2,$3) returning id",
    [email, name, role]
  );
  return res.rows[0].id as string;
}

async function upsertSkill(key: string, name: string, category: string) {
  const existing = await pool.query("select id from skills where key = $1", [key]);
  if ((existing.rowCount ?? 0) > 0) return existing.rows[0].id as string;
  const res = await pool.query(
    "insert into skills (key, name, category) values ($1,$2,$3) returning id",
    [key, name, category]
  );
  return res.rows[0].id as string;
}

async function seedSkillTimeline(
  studentId: string,
  skillId: string,
  evidencePoints: EvidencePoint[],
  signalPoints: SignalPoint[]
) {
  for (const e of evidencePoints) {
    await pool.query(
      `insert into evidence_submissions
         (student_id, skill_id, type, difficulty, is_transfer, problem_family, demonstrates_complexity_reasoning, score_raw, observed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        studentId,
        skillId,
        e.type,
        e.difficulty ?? null,
        e.isTransfer ?? false,
        e.problemFamily ?? null,
        e.demonstratesComplexityReasoning ?? false,
        e.scoreRaw,
        day(e.daysFromStart),
      ]
    );
  }

  for (const s of signalPoints) {
    const res = await pool.query(
      `insert into skill_signals (student_id, skill_id, value, calculation_version, source_type, assessment_type, role_relevance, observed_at)
       values ($1,$2,$3,'v1',$4,$5,$6,$7) returning id`,
      [studentId, skillId, s.value, s.sourceType, s.assessmentType ?? null, s.roleRelevance ?? null, day(s.daysFromStart)]
    );
    const result = await ingestSkillSignalUpdate(res.rows[0].id);
    console.log(
      `  [${res.rows[0].id.slice(0, 8)}] day ${s.daysFromStart} -> value ${s.value}: ${result.status}` +
        (result.newMilestones?.length ? ` (milestones: ${result.newMilestones.join(", ")})` : "")
    );
  }
}

async function printGrowthSummary(studentId: string, label: string) {
  const skills = await pool.query(
    `select distinct on (tgs.skill_id) s.name, tgs.value, tgs.confidence
     from technical_growth_snapshots tgs join skills s on s.id = tgs.skill_id
     where tgs.student_id = $1 order by tgs.skill_id, tgs.observed_at desc`,
    [studentId]
  );
  const measurements = await pool.query(
    `select distinct on (sgm.skill_id) s.name, sgm.absolute_change, sgm.confidence
     from skill_growth_measurements sgm join skills s on s.id = sgm.skill_id
     where sgm.student_id = $1 order by sgm.skill_id, sgm.calculated_at desc`,
    [studentId]
  );
  const milestones = await pool.query(
    `select gm.type, s.name as skill_name from growth_milestones gm join skills s on s.id = gm.skill_id
     where gm.student_id = $1 order by gm.achieved_at asc`,
    [studentId]
  );
  const events = await pool.query(
    `select event_type, skill_id from technical_growth_events
     where student_id = $1 and event_type in ('REGRESSION_DETECTED','RECOVERY_DETECTED')`,
    [studentId]
  );

  console.log(`\n=== ${label} — current state ===`);
  for (const row of skills.rows) console.log(`  ${row.name.padEnd(24)} value=${row.value}  confidence=${row.confidence}`);
  console.log(`--- growth vs baseline ---`);
  for (const row of measurements.rows) {
    console.log(`  ${row.name.padEnd(24)} ${row.absolute_change >= 0 ? "+" : ""}${row.absolute_change}  confidence=${row.confidence}`);
  }
  console.log(`--- milestones ---`);
  for (const row of milestones.rows) console.log(`  ${row.skill_name}: ${row.type}`);
  console.log(`--- regression / recovery events ---`);
  for (const row of events.rows) console.log(`  ${row.event_type}`);
}

async function main() {
  console.log("Seeding two-student demonstration...\n");

  const studentA = await upsertUser("student.a@demo.codeforge.dev", "Student A", "STUDENT");
  const studentB = await upsertUser("student.b@demo.codeforge.dev", "Student B", "STUDENT");
  const tpo = await upsertUser("tpo@demo.codeforge.dev", "Program Officer", "TPO");

  const cohortRes = await pool.query(
    `insert into cohorts (name, program) values ('Demo Cohort - Fall 2026', 'Full Stack Bootcamp') returning id`
  );
  const cohortId = cohortRes.rows[0].id;
  await pool.query(`insert into cohort_students (cohort_id, student_id) values ($1,$2), ($1,$3)`, [
    cohortId,
    studentA,
    studentB,
  ]);
  await pool.query(`insert into cohort_staff (cohort_id, user_id, role) values ($1,$2,'TPO')`, [cohortId, tpo]);

  const skillAlgorithms = await upsertSkill("algorithms", "Algorithmic Problem Solving", "core");
  const skillDebugging = await upsertSkill("debugging", "Debugging", "core");
  const skillReasoning = await upsertSkill("reasoning", "Technical Reasoning", "core");
  const skillTransfer = await upsertSkill("transfer", "Transfer", "core");

  // ---------------------------------------------------------------------
  // STUDENT A — Algorithms strong, Debugging weak, Reasoning strong, Transfer weak
  // ---------------------------------------------------------------------
  console.log("--- Student A: algorithms ---");
  await seedSkillTimeline(
    studentA,
    skillAlgorithms,
    [
      { daysFromStart: 0, scoreRaw: 68, type: "DIAGNOSTIC" },
      { daysFromStart: 10, scoreRaw: 76, type: "CHALLENGE_SUBMISSION", problemFamily: "sorting" },
      { daysFromStart: 20, scoreRaw: 80, type: "CHALLENGE_SUBMISSION", problemFamily: "graphs" },
      { daysFromStart: 35, scoreRaw: 84, type: "ADAPTIVE_CHALLENGE", difficulty: "ADVANCED", problemFamily: "dp" },
      { daysFromStart: 50, scoreRaw: 88, type: "CHALLENGE_SUBMISSION", difficulty: "ADVANCED", demonstratesComplexityReasoning: true, problemFamily: "graphs" },
      { daysFromStart: 65, scoreRaw: 92, type: "ASSESSMENT", problemFamily: "mixed" },
    ],
    [
      { daysFromStart: 0, value: 68, sourceType: "DIAGNOSTIC" },
      { daysFromStart: 10, value: 74, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 20, value: 79, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 35, value: 83, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 50, value: 88, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 65, value: 90, sourceType: "ASSESSMENT", assessmentType: "formal" },
    ]
  );

  console.log("--- Student A: debugging (stays weak) ---");
  await seedSkillTimeline(
    studentA,
    skillDebugging,
    [
      { daysFromStart: 0, scoreRaw: 45, type: "DIAGNOSTIC" },
      { daysFromStart: 15, scoreRaw: 40, type: "DEBUGGING_TASK", problemFamily: "null-pointer" },
      { daysFromStart: 30, scoreRaw: 38, type: "DEBUGGING_TASK", problemFamily: "null-pointer" },
      { daysFromStart: 45, scoreRaw: 35, type: "DEBUGGING_TASK", problemFamily: "off-by-one" },
      { daysFromStart: 60, scoreRaw: 41, type: "DEBUGGING_TASK", problemFamily: "race-condition" },
    ],
    [
      { daysFromStart: 0, value: 45, sourceType: "DIAGNOSTIC" },
      { daysFromStart: 15, value: 44, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 30, value: 43, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 45, value: 40, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 60, value: 42, sourceType: "AGGREGATED_SIGNAL" },
    ]
  );

  console.log("--- Student A: reasoning ---");
  await seedSkillTimeline(
    studentA,
    skillReasoning,
    [
      { daysFromStart: 0, scoreRaw: 65, type: "DIAGNOSTIC" },
      { daysFromStart: 20, scoreRaw: 74, type: "UNDERSTANDING_CHECK" },
      { daysFromStart: 45, scoreRaw: 82, type: "UNDERSTANDING_CHECK" },
      { daysFromStart: 65, scoreRaw: 87, type: "ASSESSMENT" },
    ],
    [
      { daysFromStart: 0, value: 65, sourceType: "DIAGNOSTIC" },
      { daysFromStart: 20, value: 73, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 45, value: 81, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 65, value: 85, sourceType: "ASSESSMENT", assessmentType: "formal" },
    ]
  );

  console.log("--- Student A: transfer (stays weak, attempts fail) ---");
  await seedSkillTimeline(
    studentA,
    skillTransfer,
    [
      { daysFromStart: 10, scoreRaw: 32, type: "CHALLENGE_SUBMISSION", isTransfer: true, problemFamily: "unfamiliar-domain" },
      { daysFromStart: 40, scoreRaw: 38, type: "CHALLENGE_SUBMISSION", isTransfer: true, problemFamily: "unfamiliar-domain" },
      { daysFromStart: 65, scoreRaw: 41, type: "CHALLENGE_SUBMISSION", isTransfer: true, problemFamily: "unfamiliar-domain" },
    ],
    [
      { daysFromStart: 10, value: 35, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 40, value: 38, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 65, value: 42, sourceType: "AGGREGATED_SIGNAL" },
    ]
  );

  // ---------------------------------------------------------------------
  // STUDENT B — Algorithms moderate, Debugging strong (regression+recovery),
  // Reasoning moderate, Transfer strong
  // ---------------------------------------------------------------------
  console.log("\n--- Student B: algorithms (moderate) ---");
  await seedSkillTimeline(
    studentB,
    skillAlgorithms,
    [
      { daysFromStart: 0, scoreRaw: 55, type: "DIAGNOSTIC" },
      { daysFromStart: 20, scoreRaw: 60, type: "CHALLENGE_SUBMISSION", problemFamily: "sorting" },
      { daysFromStart: 45, scoreRaw: 64, type: "CHALLENGE_SUBMISSION", problemFamily: "graphs" },
      { daysFromStart: 65, scoreRaw: 68, type: "ASSESSMENT" },
    ],
    [
      { daysFromStart: 0, value: 55, sourceType: "DIAGNOSTIC" },
      { daysFromStart: 20, value: 59, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 45, value: 63, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 65, value: 67, sourceType: "ASSESSMENT", assessmentType: "formal" },
    ]
  );

  console.log("--- Student B: debugging (strong, with a real regression + recovery) ---");
  await seedSkillTimeline(
    studentB,
    skillDebugging,
    [
      { daysFromStart: 0, scoreRaw: 50, type: "DIAGNOSTIC" },
      { daysFromStart: 8, scoreRaw: 62, type: "DEBUGGING_TASK", problemFamily: "null-pointer" },
      { daysFromStart: 16, scoreRaw: 70, type: "DEBUGGING_TASK", problemFamily: "off-by-one" },
      { daysFromStart: 24, scoreRaw: 76, type: "DEBUGGING_TASK", problemFamily: "race-condition" },
      // a genuinely harder batch of challenges causes a real dip
      { daysFromStart: 32, scoreRaw: 58, type: "DEBUGGING_TASK", difficulty: "ADVANCED", problemFamily: "memory-leak" },
      { daysFromStart: 38, scoreRaw: 50, type: "DEBUGGING_TASK", difficulty: "ADVANCED", problemFamily: "memory-leak" },
      { daysFromStart: 44, scoreRaw: 44, type: "DEBUGGING_TASK", difficulty: "ADVANCED", problemFamily: "concurrency" },
      // recovery
      { daysFromStart: 52, scoreRaw: 62, type: "DEBUGGING_TASK", problemFamily: "concurrency" },
      { daysFromStart: 60, scoreRaw: 74, type: "DEBUGGING_TASK", problemFamily: "memory-leak" },
      { daysFromStart: 68, scoreRaw: 83, type: "DEBUGGING_TASK", difficulty: "ADVANCED", problemFamily: "deadlock" },
    ],
    [
      { daysFromStart: 0, value: 50, sourceType: "DIAGNOSTIC" },
      { daysFromStart: 8, value: 58, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 16, value: 66, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 24, value: 74, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 32, value: 70, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 38, value: 64, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 44, value: 58, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 52, value: 64, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 60, value: 72, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 68, value: 82, sourceType: "ASSESSMENT", assessmentType: "formal" },
    ]
  );

  console.log("--- Student B: reasoning (moderate) ---");
  await seedSkillTimeline(
    studentB,
    skillReasoning,
    [
      { daysFromStart: 0, scoreRaw: 55, type: "DIAGNOSTIC" },
      { daysFromStart: 30, scoreRaw: 62, type: "UNDERSTANDING_CHECK" },
      { daysFromStart: 65, scoreRaw: 68, type: "ASSESSMENT" },
    ],
    [
      { daysFromStart: 0, value: 55, sourceType: "DIAGNOSTIC" },
      { daysFromStart: 30, value: 61, sourceType: "AGGREGATED_SIGNAL" },
      { daysFromStart: 65, value: 67, sourceType: "ASSESSMENT", assessmentType: "formal" },
    ]
  );

  console.log("--- Student B: transfer (strong, real successes) ---");
  await seedSkillTimeline(
    studentB,
    skillTransfer,
    [
      { daysFromStart: 12, scoreRaw: 58, type: "CHALLENGE_SUBMISSION", isTransfer: true, problemFamily: "unfamiliar-domain" },
      { daysFromStart: 35, scoreRaw: 68, type: "CHALLENGE_SUBMISSION", isTransfer: true, problemFamily: "novel-api" },
      { daysFromStart: 60, scoreRaw: 79, type: "CHALLENGE_SUBMISSION", isTransfer: true, problemFamily: "novel-api" },
    ],
    [
      { daysFromStart: 12, value: 45, sourceType: "AGGREGATED_SIGNAL", roleRelevance: 0.8 },
      { daysFromStart: 35, value: 60, sourceType: "AGGREGATED_SIGNAL", roleRelevance: 0.8 },
      { daysFromStart: 60, value: 78, sourceType: "AGGREGATED_SIGNAL", roleRelevance: 0.8 },
    ]
  );

  await printGrowthSummary(studentA, "STUDENT A");
  await printGrowthSummary(studentB, "STUDENT B");

  console.log(`\nDemo student A id: ${studentA}`);
  console.log(`Demo student B id: ${studentB}`);
  console.log(`Demo TPO id:       ${tpo}`);
  console.log(`Demo cohort id:    ${cohortId}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
