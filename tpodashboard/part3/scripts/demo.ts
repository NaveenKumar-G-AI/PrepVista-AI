// SYNTHETIC DEV FIXTURE — this generates fake students with a seeded RNG
// purely to exercise the engine end-to-end. None of this is production
// data and it must never be pointed at a real environment.

import type { RuleNode, Student } from "../src/types.js";
import { summarizeCohort } from "../src/summarize.js";
import { simulateEligibility } from "../src/simulate.js";
import { validateRuleTree } from "../src/validate.js";

// Small seeded PRNG (mulberry32) so the demo is reproducible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

const DEPARTMENTS = ["CSE", "IT", "ECE", "MECH", "CIVIL", "EEE"];
const SKILLS_POOL = ["Python", "Java", "SQL", "React", "C++", "AWS"];

function randomStudent(i: number): Student {
  const dept = DEPARTMENTS[Math.floor(rand() * DEPARTMENTS.length)];
  const cgpa = Math.round((5 + rand() * 5) * 100) / 100;
  const activeBacklogs = rand() < 0.75 ? 0 : Math.floor(rand() * 4);
  const skillCount = 1 + Math.floor(rand() * 3);
  const skills = Array.from({ length: skillCount }, () => SKILLS_POOL[Math.floor(rand() * SKILLS_POOL.length)]);
  return {
    id: `DEV-${i}`,
    name: `Dev Fixture Student ${i}`,
    department: dept,
    program: "B.Tech",
    graduationYear: rand() < 0.8 ? 2026 : 2027,
    semester: 8,
    cgpa,
    activeBacklogs,
    totalBacklogs: activeBacklogs + Math.floor(rand() * 2),
    skills: [...new Set(skills)],
    certifications: [],
    internshipCount: rand() < 0.5 ? 1 : 0,
    experienceMonths: 0,
    placementStatus: "UNPLACED",
  };
}

const COHORT_SIZE = 240;
const students: Student[] = Array.from({ length: COHORT_SIZE }, (_, i) => randomStudent(i + 1));

const currentRule: RuleNode = {
  kind: "AND", id: "root",
  children: [
    { kind: "LEAF", id: "dept", field: "department", comparator: "IN", value: ["CSE", "IT"], category: "DEPARTMENT", label: "Department" },
    { kind: "LEAF", id: "cgpa", field: "cgpa", comparator: "GTE", value: 7.0, category: "CGPA", label: "CGPA" },
    { kind: "LEAF", id: "backlog", field: "activeBacklogs", comparator: "LTE", value: 0, category: "BACKLOG", label: "Active backlogs" },
    { kind: "LEAF", id: "grad", field: "graduationYear", comparator: "EQ", value: 2026, category: "OTHER", label: "Graduation year" },
  ],
};

const validation = validateRuleTree(currentRule);
if (validation.length > 0) {
  console.error("Rule tree failed validation:", validation);
  process.exit(1);
}

console.log(`\n[SYNTHETIC DEV FIXTURE - ${COHORT_SIZE} fake students, not real data]\n`);

const summary = summarizeCohort(students, currentRule, 1);
console.log(`Total students        ${summary.total}`);
console.log(`Eligible              ${summary.eligibleCount}`);
console.log(`Not eligible          ${summary.notEligibleCount}`);
console.log(`\nPrimary exclusion reason`);
for (const [cat, count] of Object.entries(summary.byPrimaryFailureCategory)) {
  console.log(`  ${cat.padEnd(12)} ${count}`);
}
const bucketSum = Object.values(summary.byPrimaryFailureCategory).reduce((a, b) => a + b, 0);
console.log(`  (buckets sum to ${bucketSum}; not-eligible total is ${summary.notEligibleCount} -> ${bucketSum === summary.notEligibleCount ? "match" : "MISMATCH"})`);

const sample = summary.results.find((r) => !r.eligible);
if (sample) {
  console.log(`\nExample explanation for ${sample.studentId} (not eligible):`);
  for (const leaf of sample.leafResults) console.log(`  ${leaf.description}`);
  console.log(`  Primary reason: ${sample.primaryFailureCategory}`);
}

const candidateRule: RuleNode = {
  kind: "AND", id: "root2",
  children: [
    { kind: "LEAF", id: "dept2", field: "department", comparator: "IN", value: ["CSE", "IT", "ECE"], category: "DEPARTMENT", label: "Department" },
    { kind: "LEAF", id: "cgpa2", field: "cgpa", comparator: "GTE", value: 6.5, category: "CGPA", label: "CGPA" },
    { kind: "LEAF", id: "backlog2", field: "activeBacklogs", comparator: "LTE", value: 1, category: "BACKLOG", label: "Active backlogs" },
    { kind: "LEAF", id: "grad2", field: "graduationYear", comparator: "EQ", value: 2026, category: "OTHER", label: "Graduation year" },
  ],
};

console.log(`\nWhat-if: CGPA 7.0 -> 6.5, backlog 0 -> 1, departments +ECE\n`);
const sim = simulateEligibility(students, currentRule, candidateRule, { baseline: 1, candidate: 2 });
console.log(`Current    ${sim.baselineEligibleCount} eligible`);
console.log(`Simulation ${sim.candidateEligibleCount} eligible`);
console.log(`Change     ${sim.delta >= 0 ? "+" : ""}${sim.delta}`);
console.log(`Newly eligible: ${sim.newlyEligibleStudentIds.length} students`);
console.log(`Removed:        ${sim.removedStudentIds.length} students`);
console.log("\n(This simulation never touched `students`, `currentRule`, or any stored state.)\n");
