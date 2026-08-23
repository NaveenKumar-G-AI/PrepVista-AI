import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { openDatabase, runMigrations } from "./db.js";
import { MetricDefinitionRepository } from "./repositories/metricDefinitionRepository.js";
import { ReportDefinitionRepository } from "./repositories/reportDefinitionRepository.js";
import { ManagementTargetRepository } from "./repositories/managementTargetRepository.js";
import { EvidenceRepository } from "./repositories/evidenceRepository.js";

const INSTITUTION_ID = "inst_demo_college";
const DB_PATH = "data/prepvista_demo.db";

// --- deterministic PRNG: the demo data is "synthetic but reproducible", not re-randomized on every run ---
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
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const range = (a: number, b: number) => a + rand() * (b - a);

const DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "MECH", "CIVIL"] as const;
const DEPT_SIZE: Record<string, number> = { CSE: 70, IT: 55, ECE: 60, EEE: 40, MECH: 50, CIVIL: 30 };
const DEPT_ROLE: Record<string, string> = {
  CSE: "Software Engineer",
  IT: "Software Engineer",
  ECE: "Electronics Engineer",
  EEE: "Embedded Systems Engineer",
  MECH: "Design Engineer",
  CIVIL: "Site Engineer",
};
const DEPT_CTC_RANGE: Record<string, [number, number]> = {
  CSE: [6, 14],
  IT: [5.5, 12],
  ECE: [4.5, 9],
  EEE: [4, 8],
  MECH: [3.5, 7],
  CIVIL: [3.5, 6.5],
};
const COMPANIES = [
  "NovaTech Systems", "BluePeak Software", "Orbit Analytics", "Meridian Systems",
  "Cedar Robotics", "Vertex Cloud", "Lumen Data", "Ashwood Technologies",
  "Solstice Systems", "Ironclad Infra", "Northwind Software", "Harbor Digital",
  "Fernbridge Energy", "Amberline Manufacturing", "Crestpoint Consulting",
];

interface SeasonConfig {
  season: string;
  pApplied: number;   // eligible -> attempts at least one drive ("Application conversion" in the demo narrative)
  pSelected: number;  // interviewed -> selected, per attempt ("Interview progression")
  pJoined: number;    // accepted -> joined ("Joining conversion")
  eceHitMultiplier: number; // extra penalty applied to ECE this season
}

// Common, non-headline probabilities (kept high + multiple attempts per student,
// consistent with how large campus placement drives actually work: a student who
// isn't selected at one company tries another, not just once).
const P_ELIGIBLE = 0.94;       // seeking -> eligible
const P_SHORTLISTED = 0.90;    // applied -> shortlisted, per attempt
const P_INTERVIEWED = 0.93;    // shortlisted -> interviewed, per attempt
const P_OFFER = 0.96;          // selected -> offer, per attempt
const P_ACCEPTED = 0.94;       // offer -> accepted
const P_VERIFIED = 0.94;       // joined -> verified (some intentionally left unverified)
const MAX_ATTEMPTS = 5;

const SEASON_2025: SeasonConfig = { season: "2025", pApplied: 0.82, pSelected: 0.61, pJoined: 0.95, eceHitMultiplier: 1.0 };
const SEASON_2026: SeasonConfig = { season: "2026", pApplied: 0.76, pSelected: 0.54, pJoined: 0.91, eceHitMultiplier: 0.85 };

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function main() {
  mkdirSync("data", { recursive: true });
  const db = openDatabase(DB_PATH);
  runMigrations(db);

  console.log(`Seeding into ${DB_PATH} ...`);

  seedMetricDefinitions(db);
  seedReportDefinitions(db);

  for (const cfg of [SEASON_2025, SEASON_2026]) {
    seedSeason(db, cfg);
  }
  seedEvidenceGaps(db);
  seedTargets(db);

  const counts = {
    students: (db.prepare("SELECT COUNT(*) c FROM students").get() as { c: number }).c,
    applications: (db.prepare("SELECT COUNT(*) c FROM applications").get() as { c: number }).c,
    interviews: (db.prepare("SELECT COUNT(*) c FROM interviews").get() as { c: number }).c,
    offers: (db.prepare("SELECT COUNT(*) c FROM offers").get() as { c: number }).c,
    joining: (db.prepare("SELECT COUNT(*) c FROM joining").get() as { c: number }).c,
  };
  console.log("Seed complete:", counts);

  for (const season of ["2025", "2026"]) {
    const rate = actualPlacementRate(db, season);
    const target = db.prepare(
      "SELECT target_value FROM management_targets WHERE institution_id = ? AND season = ? AND metric_name = 'placement_rate'"
    ).get(INSTITUTION_ID, season) as { target_value: number } | undefined;
    console.log(`Season ${season}: actual placement rate = ${rate.toFixed(1)}%, target = ${target?.target_value}%`);
  }

  db.close();
}

function actualPlacementRate(db: any, season: string): number {
  const seeking = (db.prepare(
    "SELECT COUNT(*) c FROM students WHERE institution_id = ? AND season = ? AND seeking_placement = 1"
  ).get(INSTITUTION_ID, season) as { c: number }).c;
  const placed = (db.prepare(
    `SELECT COUNT(DISTINCT j.student_id) c FROM joining j
     JOIN offers o ON o.id = j.offer_id
     WHERE j.institution_id = ? AND o.season = ? AND j.status = 'joined' AND j.verified = 1`
  ).get(INSTITUTION_ID, season) as { c: number }).c;
  return seeking === 0 ? 0 : (placed / seeking) * 100;
}

function seedTargets(db: any) {
  const repo = new ManagementTargetRepository(db);
  // Targets are set going INTO a season, as institutional policy — never derived
  // from that season's own outcome (that would be reverse-engineering a "gap").
  // 2026's target reflects normal planned growth over 2025; the actual outcome
  // is whatever the simulated funnel produces, gap and all.
  repo.set({ institutionId: INSTITUTION_ID, season: "2025", metricName: "placement_rate", targetValue: 63, setBy: "management:policy" });
  repo.set({ institutionId: INSTITUTION_ID, season: "2026", metricName: "placement_rate", targetValue: 68, setBy: "management:policy" });
}

function seedMetricDefinitions(db: any) {
  const repo = new MetricDefinitionRepository(db);
  const now = "2026-06-01T00:00:00.000Z";
  repo.create({
    institutionId: INSTITUTION_ID, name: "placement_rate",
    description: "Share of placement-seeking students with a verified placement outcome.",
    formulaDefinition: "Verified placed students ÷ students seeking placement, for the selected season.",
    denominatorDefinition: "Students with seeking_placement = true in the selected season.",
    dataSources: ["students", "offers", "joining"], calculatorKey: "placement_rate",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
  repo.create({
    institutionId: INSTITUTION_ID, name: "median_ctc",
    description: "Median total CTC (fixed + variable) among verified placements.",
    formulaDefinition: "Median of (fixed + variable CTC) across offers with a verified 'joined' status.",
    denominatorDefinition: "Verified placements in the selected season (and department, if filtered).",
    dataSources: ["offers", "joining"], calculatorKey: "median_ctc",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
  repo.create({
    institutionId: INSTITUTION_ID, name: "average_ctc",
    description: "Mean total CTC among verified placements.",
    formulaDefinition: "Arithmetic mean of (fixed + variable CTC) across offers with a verified 'joined' status.",
    denominatorDefinition: "Verified placements in the selected season (and department, if filtered).",
    dataSources: ["offers", "joining"], calculatorKey: "average_ctc",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
  repo.create({
    institutionId: INSTITUTION_ID, name: "highest_ctc",
    description: "Highest total CTC among verified placements.",
    formulaDefinition: "Maximum of (fixed + variable CTC) across offers with a verified 'joined' status.",
    denominatorDefinition: "Verified placements in the selected season (and department, if filtered).",
    dataSources: ["offers", "joining"], calculatorKey: "highest_ctc",
    version: 1, effectiveFrom: now, effectiveTo: null, status: "active",
  });
}

function seedReportDefinitions(db: any) {
  const repo = new ReportDefinitionRepository(db);
  repo.create({
    institutionId: INSTITUTION_ID, name: "executive_report", type: "executive", version: 1,
    sections: ["executive_summary", "kpis", "funnel", "department_performance", "company_report", "insights", "warnings"],
    metricConfig: ["placement_rate", "median_ctc", "average_ctc", "highest_ctc"],
    visibility: "management", createdBy: "system:seed",
  });
}

function seedSeason(db: any, cfg: SeasonConfig) {
  const insertStudent = db.prepare(
    `INSERT INTO students (id, institution_id, season, name, department, program, seeking_placement, eligible, readiness_score, risk_level, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertApp = db.prepare(
    `INSERT INTO applications (id, institution_id, season, student_id, drive_id, company, role, status, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertInterview = db.prepare(
    `INSERT INTO interviews (id, institution_id, application_id, scheduled_at, attended, result, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertOffer = db.prepare(
    `INSERT INTO offers (id, institution_id, season, application_id, student_id, company, role, ctc_fixed, ctc_variable, status, verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertJoining = db.prepare(
    `INSERT INTO joining (id, institution_id, offer_id, student_id, status, verified, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const FIRST = ["Aarav","Vihaan","Aditya","Ishaan","Reyansh","Kabir","Ananya","Diya","Myra","Saanvi","Aadhya","Kiara","Rohan","Aryan","Devika","Meera","Nikhil","Priya","Sanjay","Tara","Varun","Isha","Karthik","Lavanya","Manoj","Neha","Om","Pooja","Ravi","Sneha","Arjun","Divya","Harish","Kavya","Nitin","Radhika","Suresh","Anjali","Deepak","Kritika","Manish","Pallavi","Rajesh","Shreya","Vikram","Yamini","Abhishek","Chitra","Gaurav","Jyoti","Naveen","Preeti","Rakesh","Swati","Tarun","Uma","Vinay","Anusha","Bharat","Charu","Girish","Hemant","Indira","Jagdish","Kalyani","Lokesh","Madhuri","Naresh","Parvati","Rohit","Sunita","Vikas","Yash","Akhil","Bhavana","Chandan","Deepika","Farhan","Geeta","Harsha","Ila","Jayant"];
  const LAST = ["Sharma","Verma","Iyer","Reddy","Nair","Menon","Gupta","Rao","Pillai","Krishnan","Bose","Chatterjee","Kulkarni","Desai","Joshi","Agarwal","Bhat","Chauhan","Dutta","Ghosh","Hegde","Iyengar","Jain","Kapoor","Malhotra","Nambiar","Pandey","Rajan","Sinha","Trivedi","Varma"];
  const nextName = () => `${pick(FIRST)} ${pick(LAST)}`;

  for (const dept of DEPARTMENTS) {
    const size = DEPT_SIZE[dept];
    const ecePenalty = dept === "ECE" ? cfg.eceHitMultiplier : 1.0;

    for (let i = 0; i < size; i++) {
      const studentId = randomUUID();
      const seeking = chance(0.9);
      const eligible = seeking && chance(P_ELIGIBLE);
      const readiness = eligible
        ? Math.round(range(45, 95))
        : seeking
        ? Math.round(range(20, 55))
        : null;
      const risk =
        readiness === null ? "insufficient_data" :
        readiness >= 80 ? "ready" :
        readiness >= 65 ? "almost_ready" :
        readiness >= 45 ? "developing" : "high_risk";

      insertStudent.run(studentId, INSTITUTION_ID, cfg.season, nextName(), dept, "B.Tech", seeking ? 1 : 0, eligible ? 1 : 0, readiness, risk, isoDaysAgo(200));

      if (!eligible) continue;
      if (!chance(cfg.pApplied * ecePenalty)) continue; // never applied anywhere this season

      let offerAppId: string | null = null;
      let offerCompany = "";
      let offerRole = "";

      for (let attempt = 0; attempt < MAX_ATTEMPTS && !offerAppId; attempt++) {
        const company = pick(COMPANIES);
        const role = DEPT_ROLE[dept];
        const driveId = `${company}::${role}::${cfg.season}`;
        const appId = randomUUID();
        const appliedAt = isoDaysAgo(Math.round(range(20, 90)));

        const shortlisted = chance(P_SHORTLISTED);
        const interviewed = shortlisted && chance(P_INTERVIEWED);
        const selected = interviewed && chance(cfg.pSelected * ecePenalty);
        const offered = selected && chance(P_OFFER);

        let status = "applied";
        if (shortlisted) status = "shortlisted";
        if (interviewed) status = "interviewed";
        if (selected) status = "selected";
        if (offered) status = "offered";
        if (!shortlisted && chance(0.04)) status = "withdrawn";

        insertApp.run(appId, INSTITUTION_ID, cfg.season, studentId, driveId, company, role, status, appliedAt);

        if (interviewed) {
          const completed = chance(0.97);
          insertInterview.run(
            randomUUID(), INSTITUTION_ID, appId,
            isoDaysAgo(Math.round(range(15, 80))), 1,
            completed ? (selected ? "selected" : "rejected") : "pending",
            completed ? isoDaysAgo(Math.round(range(10, 75))) : null
          );
        }

        if (offered) {
          offerAppId = appId;
          offerCompany = company;
          offerRole = role;
        }
      }

      if (!offerAppId) continue;

      const [lo, hi] = DEPT_CTC_RANGE[dept];
      const ctcFixed = Math.round(range(lo, hi) * 10) / 10;
      const ctcVariable = Math.round(range(0, ctcFixed * 0.15) * 10) / 10;
      const accepted = chance(P_ACCEPTED);
      const offerStatus = accepted ? "accepted" : chance(0.5) ? "declined" : "expired";
      const offerVerified = chance(0.85); // some intentionally unverified -> feeds data-quality warnings
      const offerId = randomUUID();
      insertOffer.run(offerId, INSTITUTION_ID, cfg.season, offerAppId, studentId, offerCompany, offerRole, ctcFixed, ctcVariable, offerStatus, offerVerified ? 1 : 0, isoDaysAgo(Math.round(range(10, 70))));

      if (!accepted) continue;

      const joined = chance(cfg.pJoined);
      if (!joined) {
        insertJoining.run(randomUUID(), INSTITUTION_ID, offerId, studentId, "delayed", 0, null);
        continue;
      }
      const verified = chance(P_VERIFIED);
      insertJoining.run(randomUUID(), INSTITUTION_ID, offerId, studentId, "joined", verified ? 1 : 0, isoDaysAgo(Math.round(range(1, 40))));
    }
  }
}

function seedEvidenceGaps(db: any) {
  const evidence = new EvidenceRepository(db);
  const verifiedJoinings = db
    .prepare("SELECT id, offer_id FROM joining WHERE status = 'joined' AND verified = 1")
    .all() as { id: string; offer_id: string }[];

  for (const j of verifiedJoinings) {
    if (chance(0.93)) {
      evidence.attach({
        institutionId: INSTITUTION_ID, entityType: "joining", entityId: j.id,
        evidenceType: "joining_confirmation", sourceType: "document",
        sourceReference: `joining.id=${j.id}; offer.id=${j.offer_id}`,
        verified: true, verifiedBy: "tpo:seed_import",
      });
    }
  }
}

main();
