import { randomUUID } from "node:crypto";
import { withAdmin, adminPool, withTenant, pool } from "./pool.js";
import { compositeLevel } from "../engine/capabilityModel.js";
import * as repo from "./repository.js";
import { recalculatePath } from "../engine/orchestrator.js";
import type { CapabilityDimensions, EvidenceResult, EvidenceType } from "../domain/types.js";

const TENANT_ID = "d290f1ee-6c54-4b01-90e6-d701748f0851";
const STUDENT_ANANYA = "5a1e3b2c-1111-4a2b-9c3d-000000000001";
const STUDENT_RAHUL = "5a1e3b2c-1111-4a2b-9c3d-000000000002";
const STUDENT_PRIYA = "5a1e3b2c-1111-4a2b-9c3d-000000000003";

const TARGET_DATA_ANALYST = "6b2f4c3d-2222-4a2b-9c3d-000000000010";
const TARGET_SOFTWARE_DEV = "6b2f4c3d-2222-4a2b-9c3d-000000000011";
const TARGET_BUSINESS_ANALYST = "6b2f4c3d-2222-4a2b-9c3d-000000000012";

const CAPABILITIES = [
  { code: "quantitative.numerical_ability", name: "Numerical Ability", category: "quantitative" },
  { code: "quantitative.data_interpretation", name: "Data Interpretation", category: "quantitative" },
  { code: "logical.reasoning", name: "Logical Reasoning", category: "logical" },
  { code: "data.excel_analysis", name: "Excel Analysis", category: "data" },
  { code: "data.sql", name: "SQL", category: "data" },
  { code: "technical.python", name: "Python for Data", category: "technical" },
  { code: "programming.fundamentals", name: "Programming Fundamentals", category: "programming" },
  { code: "dsa.arrays_strings", name: "DSA -- Arrays & Strings", category: "dsa" },
  { code: "dsa.trees_graphs", name: "DSA -- Trees & Graphs", category: "dsa" },
  { code: "communication.verbal", name: "Verbal Communication", category: "communication" },
];

async function main() {
  await withAdmin(async (c) => {
    console.log("seeding tenant + capabilities + targets...");
    await c.query(`INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [TENANT_ID, "Horizon Institute of Technology"]);

    for (const cap of CAPABILITIES) {
      await c.query(
        `INSERT INTO capabilities (code, tenant_id, name, category) VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category`,
        [cap.code, TENANT_ID, cap.name, cap.category]
      );
    }

    await c.query(
      `INSERT INTO targets (id, tenant_id, code, name, description) VALUES
         ($1,$2,'data-analyst','Data Analyst','Entry-level data analyst readiness: quantitative reasoning, data tooling, and applied technical analysis.'),
         ($3,$2,'software-developer','Software Developer','Entry-level software developer readiness: programming fundamentals and data structures & algorithms under timed conditions.'),
         ($4,$2,'business-analyst','Business Analyst','Entry-level business analyst readiness: quantitative/communication-heavy, lighter on hands-on technical tooling.')
       ON CONFLICT (id) DO NOTHING`,
      [TARGET_DATA_ANALYST, TENANT_ID, TARGET_SOFTWARE_DEV, TARGET_BUSINESS_ANALYST]
    );

    const req = async (targetId: string, code: string, requiredLevel: number, weight: number, minEvidence = 3) =>
      c.query(
        `INSERT INTO target_requirements (target_id, capability_code, required_level, weight, min_evidence)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (target_id, capability_code) DO UPDATE SET required_level=EXCLUDED.required_level, weight=EXCLUDED.weight, min_evidence=EXCLUDED.min_evidence`,
        [targetId, code, requiredLevel, weight, minEvidence]
      );

    await req(TARGET_DATA_ANALYST, "quantitative.numerical_ability", 80, 0.15);
    await req(TARGET_DATA_ANALYST, "quantitative.data_interpretation", 85, 0.2);
    await req(TARGET_DATA_ANALYST, "logical.reasoning", 75, 0.1);
    await req(TARGET_DATA_ANALYST, "data.excel_analysis", 85, 0.2);
    await req(TARGET_DATA_ANALYST, "data.sql", 80, 0.15);
    await req(TARGET_DATA_ANALYST, "technical.python", 75, 0.15);
    await req(TARGET_DATA_ANALYST, "communication.verbal", 70, 0.05, 3);

    await req(TARGET_SOFTWARE_DEV, "quantitative.numerical_ability", 70, 0.05);
    await req(TARGET_SOFTWARE_DEV, "logical.reasoning", 85, 0.15);
    await req(TARGET_SOFTWARE_DEV, "programming.fundamentals", 85, 0.25);
    await req(TARGET_SOFTWARE_DEV, "dsa.arrays_strings", 85, 0.25);
    await req(TARGET_SOFTWARE_DEV, "dsa.trees_graphs", 80, 0.2);
    await req(TARGET_SOFTWARE_DEV, "communication.verbal", 65, 0.1);

    await req(TARGET_BUSINESS_ANALYST, "quantitative.numerical_ability", 75, 0.2);
    await req(TARGET_BUSINESS_ANALYST, "quantitative.data_interpretation", 80, 0.25);
    await req(TARGET_BUSINESS_ANALYST, "logical.reasoning", 70, 0.15);
    await req(TARGET_BUSINESS_ANALYST, "data.excel_analysis", 75, 0.2);
    await req(TARGET_BUSINESS_ANALYST, "communication.verbal", 80, 0.2);

    console.log("seeding students...");
    await c.query(
      `INSERT INTO students (id, tenant_id, full_name, email) VALUES
         ($1,$2,'Ananya Rao','ananya.rao@example.edu'),
         ($3,$2,'Rahul Verma','rahul.verma@example.edu'),
         ($4,$2,'Priya Nair','priya.nair@example.edu')
       ON CONFLICT (id) DO NOTHING`,
      [STUDENT_ANANYA, TENANT_ID, STUDENT_RAHUL, STUDENT_PRIYA]
    );
    // Priya deliberately gets no capability evidence and no target selected
    // -- Section 52's empty state ("Your path starts with a target") needs
    // a real student to demonstrate against, not just a design mock.

    // ---- Ananya: primary-target Data Analyst, close to ready, one clear
    // bottleneck (technical.python speed) -- this is Section 50's worked example.
    await seedCapability(c, STUDENT_ANANYA, "quantitative.numerical_ability", { accuracy: 90, speed: 82, transfer: 78, consistency: 85 }, 6, [
      { type: "PERFORMANCE", correct: 18, total: 20, timeTakenSeconds: 900, timeAllowedSeconds: 1000, passed: true, novelty: "SEEN", daysAgo: 20 },
    ]);
    await seedCapability(c, STUDENT_ANANYA, "quantitative.data_interpretation", { accuracy: 87, speed: 80, transfer: 82, consistency: 80 }, 5, [
      { type: "PERFORMANCE", correct: 17, total: 20, timeTakenSeconds: 950, timeAllowedSeconds: 1000, passed: true, novelty: "SEEN", daysAgo: 18 },
    ]);
    await seedCapability(c, STUDENT_ANANYA, "logical.reasoning", { accuracy: 85, speed: 80, transfer: 78, consistency: 82 }, 5, [
      { type: "PERFORMANCE", correct: 17, total: 20, timeTakenSeconds: 980, timeAllowedSeconds: 1000, passed: true, novelty: "SEEN", daysAgo: 17 },
    ]);
    await seedCapability(c, STUDENT_ANANYA, "data.excel_analysis", { accuracy: 84, speed: 76, transfer: 72, consistency: 78 }, 5, [
      { type: "PERFORMANCE", correct: 16, total: 20, timeTakenSeconds: 1050, timeAllowedSeconds: 1100, passed: true, novelty: "SEEN", daysAgo: 15 },
    ]);
    await seedCapability(c, STUDENT_ANANYA, "data.sql", { accuracy: 82, speed: 70, transfer: 68, consistency: 74 }, 4, [
      { type: "PERFORMANCE", correct: 16, total: 20, timeTakenSeconds: 1150, timeAllowedSeconds: 1100, passed: true, novelty: "SEEN", daysAgo: 12 },
    ]);
    // The bottleneck: strong accuracy, weak timed application.
    await seedCapability(
      c,
      STUDENT_ANANYA,
      "technical.python",
      { accuracy: 85, speed: 45, transfer: 60, consistency: 66 },
      4,
      [
        { type: "LEARNING", correct: 8, total: 10, passed: true, novelty: "SEEN", daysAgo: 12 },
        { type: "PERFORMANCE", correct: 17, total: 20, timeTakenSeconds: 1750, timeAllowedSeconds: 1200, passed: false, novelty: "SEEN", daysAgo: 8 },
        { type: "PERFORMANCE", correct: 16, total: 20, timeTakenSeconds: 1900, timeAllowedSeconds: 1200, passed: false, novelty: "SEEN", daysAgo: 4 },
        { type: "PERFORMANCE", correct: 17, total: 20, timeTakenSeconds: 1650, timeAllowedSeconds: 1200, passed: true, novelty: "SEEN", daysAgo: 1 },
      ]
    );
    // Deliberately thin evidence -- triggers LOW_EVIDENCE (min_evidence is 3).
    await seedCapability(c, STUDENT_ANANYA, "communication.verbal", { accuracy: 74, speed: 70, transfer: 68, consistency: 72 }, 2, [
      { type: "PERFORMANCE", correct: 7, total: 10, timeTakenSeconds: 500, timeAllowedSeconds: 600, passed: true, novelty: "SEEN", daysAgo: 10 },
    ]);

    await c.query(
      `INSERT INTO student_targets (student_id, target_id, slot, deadline_days) VALUES ($1,$2,'PRIMARY',45)
       ON CONFLICT (student_id, target_id) DO NOTHING`,
      [STUDENT_ANANYA, TARGET_DATA_ANALYST]
    );

    // ---- Rahul: primary-target Software Developer, earlier-stage, DSA is a
    // critical, well-evidenced gap with a recent run of failures -- a
    // different, rougher story so Recovery/risk behaviour has a real case too.
    await seedCapability(c, STUDENT_RAHUL, "quantitative.numerical_ability", { accuracy: 72, speed: 68, transfer: 64, consistency: 70 }, 4, [
      { type: "PERFORMANCE", correct: 14, total: 20, timeTakenSeconds: 1000, timeAllowedSeconds: 1000, passed: true, novelty: "SEEN", daysAgo: 20 },
    ]);
    await seedCapability(c, STUDENT_RAHUL, "logical.reasoning", { accuracy: 76, speed: 70, transfer: 62, consistency: 68 }, 4, [
      { type: "PERFORMANCE", correct: 15, total: 20, timeTakenSeconds: 1050, timeAllowedSeconds: 1000, passed: true, novelty: "SEEN", daysAgo: 19 },
    ]);
    await seedCapability(c, STUDENT_RAHUL, "programming.fundamentals", { accuracy: 74, speed: 60, transfer: 55, consistency: 60 }, 5, [
      { type: "PRACTICE", correct: 15, total: 20, passed: true, novelty: "SEEN", daysAgo: 14 },
    ]);
    await seedCapability(
      c,
      STUDENT_RAHUL,
      "dsa.arrays_strings",
      { accuracy: 48, speed: 40, transfer: 35, consistency: 45 },
      4,
      [
        { type: "PERFORMANCE", correct: 8, total: 20, timeTakenSeconds: 1400, timeAllowedSeconds: 1200, passed: false, novelty: "SEEN", daysAgo: 9 },
        { type: "PERFORMANCE", correct: 7, total: 20, timeTakenSeconds: 1450, timeAllowedSeconds: 1200, passed: false, novelty: "SEEN", daysAgo: 5 },
        { type: "PERFORMANCE", correct: 9, total: 20, timeTakenSeconds: 1500, timeAllowedSeconds: 1200, passed: false, novelty: "SEEN", daysAgo: 2 },
      ]
    );
    await seedCapability(c, STUDENT_RAHUL, "communication.verbal", { accuracy: 70, speed: 68, transfer: 60, consistency: 65 }, 3, [
      { type: "PERFORMANCE", correct: 7, total: 10, timeTakenSeconds: 500, timeAllowedSeconds: 550, passed: true, novelty: "SEEN", daysAgo: 11 },
    ]);
    // dsa.trees_graphs left with zero evidence on purpose -- an untouched requirement.

    await c.query(
      `INSERT INTO student_targets (student_id, target_id, slot, deadline_days) VALUES ($1,$2,'PRIMARY',20)
       ON CONFLICT (student_id, target_id) DO NOTHING`,
      [STUDENT_RAHUL, TARGET_SOFTWARE_DEV]
    );

    console.log("done seeding evidence.");

    console.log("generating both students' actual paths (same engine the API uses)...");
    // Seeding capability evidence alone leaves student_targets as just a
    // preference marker -- no `paths` row exists until something calls the
    // same creation flow POST /api/path/target uses. Doing that here too
    // means `npm run seed` alone produces a fully ready demo, not one that
    // additionally requires an API call per student before there's
    // anything to look at.
    const ananyaPathId = await withTenant(TENANT_ID, (tc) =>
      repo.createPath(tc, { tenantId: TENANT_ID, studentId: STUDENT_ANANYA, targetId: TARGET_DATA_ANALYST, slot: "PRIMARY", deadlineDays: 45, mode: "STANDARD", targetReadiness: 90 })
    );
    await withTenant(TENANT_ID, (tc) => recalculatePath(tc, TENANT_ID, ananyaPathId, "INITIAL_GENERATION"));

    const rahulPathId = await withTenant(TENANT_ID, (tc) =>
      repo.createPath(tc, { tenantId: TENANT_ID, studentId: STUDENT_RAHUL, targetId: TARGET_SOFTWARE_DEV, slot: "PRIMARY", deadlineDays: 20, mode: "STANDARD", targetReadiness: 90 })
    );
    await withTenant(TENANT_ID, (tc) => recalculatePath(tc, TENANT_ID, rahulPathId, "INITIAL_GENERATION"));

    console.log("done.");
    console.log("");
    console.log("Demo identity headers for the API / frontend:");
    console.log(`  Ananya (Data Analyst):     x-tenant-id: ${TENANT_ID}  x-student-id: ${STUDENT_ANANYA}  targetId: ${TARGET_DATA_ANALYST}`);
    console.log(`  Rahul  (Software Dev):     x-tenant-id: ${TENANT_ID}  x-student-id: ${STUDENT_RAHUL}  targetId: ${TARGET_SOFTWARE_DEV}`);
    console.log(`  Priya  (no target yet):    x-tenant-id: ${TENANT_ID}  x-student-id: ${STUDENT_PRIYA}  (Section 52 empty state)`);
    console.log(`  (Business Analyst target for target-switch/multi-target demo: ${TARGET_BUSINESS_ANALYST})`);
  });
  await pool.end();
  await adminPool.end();
}

interface SeedEvidenceSpec {
  type: EvidenceType;
  correct: number;
  total: number;
  timeTakenSeconds?: number;
  timeAllowedSeconds?: number;
  passed: boolean;
  novelty: "SEEN" | "NOVEL";
  daysAgo: number;
}

async function seedCapability(
  c: Parameters<Parameters<typeof withAdmin>[0]>[0],
  studentId: string,
  capabilityCode: string,
  dims: CapabilityDimensions,
  evidenceCount: number,
  events: SeedEvidenceSpec[]
) {
  const level = compositeLevel(dims);
  const lastEvidenceAt = new Date(Date.now() - Math.min(...events.map((e) => e.daysAgo)) * 86400000).toISOString();

  await c.query(
    `INSERT INTO student_capability_state (student_id, capability_code, level, accuracy, speed, transfer, consistency, evidence_count, last_evidence_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (student_id, capability_code) DO UPDATE SET
       level=EXCLUDED.level, accuracy=EXCLUDED.accuracy, speed=EXCLUDED.speed, transfer=EXCLUDED.transfer,
       consistency=EXCLUDED.consistency, evidence_count=EXCLUDED.evidence_count, last_evidence_at=EXCLUDED.last_evidence_at`,
    [studentId, capabilityCode, level, dims.accuracy, dims.speed, dims.transfer, dims.consistency, evidenceCount, lastEvidenceAt]
  );

  for (const e of events) {
    const result: EvidenceResult = {
      correct: e.correct,
      total: e.total,
      timeTakenSeconds: e.timeTakenSeconds,
      timeAllowedSeconds: e.timeAllowedSeconds,
      passed: e.passed,
      contextNovelty: e.novelty,
    };
    await c.query(
      `INSERT INTO evidence_events (id, student_id, capability_code, type, source, result, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), studentId, capabilityCode, e.type, "seed", JSON.stringify(result), new Date(Date.now() - e.daysAgo * 86400000).toISOString()]
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
