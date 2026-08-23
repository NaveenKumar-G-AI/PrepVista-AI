'use strict';

/**
 * Seed data standing in for Parts 1-11's real tables. Every "notable"
 * number the demo narrates (see demo/run_demo.js and PART12_FINAL_REPORT.md
 * section AC) is produced by counting/filtering these records at query
 * time in mockServices.js — nothing is a hardcoded summary statistic.
 *
 * Deterministic PRNG (mulberry32) so re-running the demo/tests always
 * produces the same dataset.
 */
function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(1337);
const randInt = (min, max) => Math.floor(min + rand() * (max - min + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const INSTITUTION_ID = 'inst_sunrise';
const SEASON = '2026';
const NOW = Date.now();
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const hoursFromNow = (h) => new Date(NOW + h * 3600 * 1000).toISOString();

// Deadline = today at 18:00 local-to-"now" when that's still comfortably
// in the future; otherwise falls back to a fixed 9-hour window from
// whenever this dataset is generated. This keeps the "closes today"
// narrative (spec section 110) true no matter what hour the demo/tests
// actually run at, instead of going stale once the wall clock passes 6 PM.
function todayAt(hour) {
  const d = new Date(NOW);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function nearTermDeadline(hour, fallbackHours) {
  const candidate = todayAt(hour);
  const isComfortablyFuture = new Date(candidate).getTime() > NOW + 2 * 3600 * 1000;
  return isComfortablyFuture ? candidate : hoursFromNow(fallbackHours);
}

let studentSeq = 0;
function makeStudent({ department, readiness }) {
  studentSeq += 1;
  const id = `stu_${String(studentSeq).padStart(4, '0')}`;
  return {
    id,
    institutionId: INSTITUTION_ID,
    department,
    studentId: id, // self-reference used by permissionGuard's STUDENT scope check
    displayName: `Student ${String(studentSeq).padStart(4, '0')}`,
    season: SEASON,
    readinessScore: readiness,
    // contact fields intentionally present so we can prove they get
    // stripped by data-minimization (permissionGuard.minimizeFields)
    phone: `+91-9${randInt(100000000, 999999999)}`,
    email: `${id}@students.sunrise.edu`,
  };
}

// --- ABC Technologies drive population -------------------------------
// 83 unapplied-but-eligible (41 CSE / 24 IT / 18 ECE — the exact split
// used as a worked example in the spec itself, section 28), 23 of which
// are high-readiness (>=75): 12 CSE / 7 IT / 4 ECE.
const students = [];
const abcUnapplied = [];
const abcApplied = [];

function buildUnappliedBlock(department, highCount, lowCount) {
  for (let i = 0; i < highCount; i++) {
    const s = makeStudent({ department, readiness: randInt(75, 93) });
    students.push(s);
    abcUnapplied.push(s);
  }
  for (let i = 0; i < lowCount; i++) {
    const s = makeStudent({ department, readiness: randInt(45, 74) });
    students.push(s);
    abcUnapplied.push(s);
  }
}
buildUnappliedBlock('CSE', 12, 29); // 41 total
buildUnappliedBlock('IT', 7, 17); // 24 total
buildUnappliedBlock('ECE', 4, 14); // 18 total

function buildAppliedBlock(department, count) {
  for (let i = 0; i < count; i++) {
    const s = makeStudent({ department, readiness: randInt(40, 92) });
    students.push(s);
    abcApplied.push(s);
  }
}
buildAppliedBlock('CSE', 55);
buildAppliedBlock('IT', 42);
buildAppliedBlock('ECE', 30); // 127 total applied

// --- Broader institution population (other drives, MECH dept, and a
// below-threshold slice) so department-level and executive metrics have a
// realistic sample size beyond the ABC drive alone. ---------------------
const extraPopulation = [];
for (let i = 0; i < 90; i++) {
  const s = makeStudent({ department: 'MECH', readiness: randInt(38, 91) });
  students.push(s);
  extraPopulation.push(s);
}
for (let i = 0; i < 20; i++) {
  const dept = pick(['CSE', 'IT', 'ECE']);
  const s = makeStudent({ department: dept, readiness: randInt(20, 39) });
  students.push(s);
  extraPopulation.push(s);
}

// --- Companies & drives --------------------------------------------------
const companies = [
  { id: 'co_abc_tech', institutionId: INSTITUTION_ID, name: 'ABC Technologies', relationship: 'repeat_recruiter', lastVisitSeason: '2025' },
  { id: 'co_techcorp', institutionId: INSTITUTION_ID, name: 'TechCorp Solutions', relationship: 'repeat_recruiter', lastVisitSeason: '2025' },
  { id: 'co_nexus', institutionId: INSTITUTION_ID, name: 'Nexus Systems', relationship: 'new_recruiter', lastVisitSeason: null },
  { id: 'co_buildright', institutionId: INSTITUTION_ID, name: 'BuildRight Engineering', relationship: 'repeat_recruiter', lastVisitSeason: '2024' },
];

const drives = [
  {
    id: 'drive_abc_tech', institutionId: INSTITUTION_ID, companyId: 'co_abc_tech', season: SEASON,
    role: 'Software Engineer', eligibleDepartments: ['CSE', 'IT', 'ECE'], minReadiness: 45,
    applicationDeadline: nearTermDeadline(18, 9), status: 'open',
  },
  {
    id: 'drive_techcorp', institutionId: INSTITUTION_ID, companyId: 'co_techcorp', season: SEASON,
    role: 'Systems Analyst', eligibleDepartments: ['CSE', 'IT'], minReadiness: 50,
    applicationDeadline: hoursFromNow(96), status: 'open',
  },
  {
    id: 'drive_nexus', institutionId: INSTITUTION_ID, companyId: 'co_nexus', season: SEASON,
    role: 'Embedded Systems Engineer', eligibleDepartments: ['ECE'], minReadiness: 45,
    applicationDeadline: hoursFromNow(72), status: 'open',
  },
  {
    id: 'drive_buildright', institutionId: INSTITUTION_ID, companyId: 'co_buildright', season: SEASON,
    role: 'Design Engineer', eligibleDepartments: ['MECH'], minReadiness: 45,
    applicationDeadline: hoursFromNow(120), status: 'open',
  },
];

// --- Applications ----------------------------------------------------
let appSeq = 0;
const applications = [];
function makeApplication(studentId, driveId, status) {
  appSeq += 1;
  const id = `app_${String(appSeq).padStart(4, '0')}`;
  const app = { id, institutionId: INSTITUTION_ID, studentId, driveId, status, appliedAt: hoursAgo(randInt(24, 240)) };
  applications.push(app);
  return app;
}
for (const s of abcApplied) makeApplication(s.id, 'drive_abc_tech', 'submitted');

// Give the broader population applications across the other three drives
// so those drives (and institution-wide funnel numbers) aren't empty.
for (const s of extraPopulation) {
  if (s.department === 'MECH' && rand() < 0.55) makeApplication(s.id, 'drive_buildright', 'submitted');
  if (s.department === 'ECE' && rand() < 0.4) makeApplication(s.id, 'drive_nexus', 'submitted');
  if ((s.department === 'CSE' || s.department === 'IT') && rand() < 0.35) makeApplication(s.id, 'drive_techcorp', 'submitted');
}

// --- Interviews --------------------------------------------------------
// Department pass-probabilities are intentionally uneven so ECE comes out
// meaningfully behind — the exact gap is whatever these records actually
// produce when counted, not a pre-picked number.
const PASS_PROBABILITY = { CSE: 0.62, IT: 0.58, MECH: 0.55, ECE: 0.46 };
let interviewSeq = 0;
const interviews = [];
function makeInterview({ studentId, driveId, department, round, result, pending, interviewedHoursAgo }) {
  interviewSeq += 1;
  const id = `intv_${String(interviewSeq).padStart(4, '0')}`;
  interviews.push({
    id, institutionId: INSTITUTION_ID, studentId, driveId, department, round,
    interviewedAt: hoursAgo(interviewedHoursAgo),
    status: pending ? 'completed' : 'completed',
    result: pending ? null : result, // null result + status completed = "pending results"
  });
  return id;
}

// 12 specifically-pending results (>24h old, no result yet), spread
// across departments and drives.
const pendingSpec = [
  ['CSE', 'drive_abc_tech'], ['CSE', 'drive_abc_tech'], ['CSE', 'drive_techcorp'],
  ['IT', 'drive_abc_tech'], ['IT', 'drive_abc_tech'], ['IT', 'drive_techcorp'],
  ['ECE', 'drive_abc_tech'], ['ECE', 'drive_nexus'], ['ECE', 'drive_nexus'],
  ['MECH', 'drive_buildright'], ['MECH', 'drive_buildright'], ['MECH', 'drive_buildright'],
];
for (const [department, driveId] of pendingSpec) {
  const pool = department === 'ECE' || department === 'MECH'
    ? extraPopulation.filter((s) => s.department === department)
    : abcApplied.filter((s) => s.department === department);
  const student = pick(pool.length ? pool : students.filter((s) => s.department === department));
  makeInterview({
    studentId: student.id, driveId, department, round: 'Technical Round 2',
    pending: true, interviewedHoursAgo: randInt(25, 60),
  });
}

// Resolved interviews per department to give get_round_conversion /
// get_department_readiness a genuine sample to compute from. Pass/fail is
// assigned by an explicit target count per department (rather than an
// independent coin-flip per record) so the intended gap — ECE behind the
// others — actually shows up in the generated records instead of being
// left to chance; get_round_conversion still *counts* these individual
// records rather than reading a stored aggregate.
const SAMPLE_SIZE = 45;
for (const department of ['CSE', 'IT', 'ECE', 'MECH']) {
  const targetPasses = Math.round(SAMPLE_SIZE * PASS_PROBABILITY[department]);
  const outcomes = Array.from({ length: SAMPLE_SIZE }, (_, i) => i < targetPasses);
  // shuffle so pass/fail order isn't suspiciously front-loaded
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  const pool = students.filter((s) => s.department === department);
  outcomes.forEach((pass) => {
    const driveId = department === 'MECH' ? 'drive_buildright' : department === 'ECE' ? 'drive_nexus' : pick(['drive_abc_tech', 'drive_techcorp']);
    const student = pick(pool);
    makeInterview({
      studentId: student.id, driveId, department, round: 'Technical Round 1',
      result: pass ? 'pass' : 'fail', pending: false, interviewedHoursAgo: randInt(72, 900),
    });
  });
}

// A handful of interviews scheduled later today (distinct from the
// "pending results" set above, which are already-completed interviews
// awaiting a result). These power get_today_interviews.
const todayScheduleHours = [3, 5, -2, 7, -4]; // relative to now; negative = earlier today
const scheduleDepts = ['CSE', 'IT', 'ECE', 'MECH', 'CSE'];
todayScheduleHours.forEach((offset, idx) => {
  const department = scheduleDepts[idx];
  const pool = students.filter((s) => s.department === department);
  const student = pick(pool);
  interviewSeq += 1;
  const id = `intv_${String(interviewSeq).padStart(4, '0')}`;
  interviews.push({
    id, institutionId: INSTITUTION_ID, studentId: student.id,
    driveId: department === 'MECH' ? 'drive_buildright' : department === 'ECE' ? 'drive_nexus' : 'drive_abc_tech',
    department, round: 'Technical Round 1',
    scheduledFor: new Date(NOW + offset * 3600 * 1000).toISOString(),
    interviewedAt: new Date(NOW + offset * 3600 * 1000).toISOString(),
    status: 'scheduled', result: null,
  });
});

// --- Offers --------------------------------------------------------------
// 7 offers expiring within the next 48 hours, plus a spread of other
// offers (already accepted / further out) so get_offers isn't a
// single-purpose fixture.
let offerSeq = 0;
const offers = [];
function makeOffer({ studentId, driveId, companyId, status, expiresInHours, ctc }) {
  offerSeq += 1;
  const id = `off_${String(offerSeq).padStart(4, '0')}`;
  const owner = students.find((s) => s.id === studentId);
  offers.push({
    id, institutionId: INSTITUTION_ID, studentId, driveId, companyId, status,
    department: owner ? owner.department : null, // needed so department-scope checks (permissionGuard) apply to offer lists too — see PART12_HOSTILE_REVIEW.md SEC-5
    issuedAt: hoursAgo(randInt(24, 200)),
    expiresAt: hoursFromNow(expiresInHours),
    ctcLpa: ctc,
  });
  return id;
}
const passedStudents = students.filter((s) =>
  interviews.some((iv) => iv.studentId === s.id && iv.result === 'pass')
);
for (let i = 0; i < 7; i++) {
  const student = passedStudents[i % passedStudents.length];
  makeOffer({
    studentId: student.id, driveId: 'drive_techcorp', companyId: 'co_techcorp',
    status: 'pending_acceptance', expiresInHours: randInt(6, 47), ctc: randInt(6, 12),
  });
}
for (let i = 0; i < 14; i++) {
  const student = passedStudents[(i + 7) % passedStudents.length];
  makeOffer({
    studentId: student.id, driveId: pick(['drive_abc_tech', 'drive_buildright', 'drive_nexus']),
    companyId: pick(['co_abc_tech', 'co_buildright', 'co_nexus']),
    status: rand() < 0.7 ? 'accepted' : 'pending_acceptance',
    expiresInHours: randInt(72, 400), ctc: randInt(5, 14),
  });
}

// --- Broader placement outcomes ------------------------------------------
// The fixtures above exist to make specific tools (expiring offers,
// pending results, unapplied-eligible) demonstrable; on their own they're
// far too small a sample to make get_executive_metrics' placement rate
// realistic. This block adds institution-wide placement outcomes, scaled
// per department by that department's own interview-conversion rate
// (computed above) so a real, traceable relationship holds between
// "interview conversion is weak in ECE" and "ECE also placements lag" —
// the same causal thread the root-cause tools are meant to surface.
const OFFER_ACCEPT_GIVEN_PASS = 0.82; // fraction of technical-round passes that convert to an accepted offer
for (const department of ['CSE', 'IT', 'ECE', 'MECH']) {
  const deptPassRate = PASS_PROBABILITY[department];
  const alreadyOffered = new Set(offers.filter((o) => o.institutionId === INSTITUTION_ID).map((o) => o.studentId));
  const pool = students.filter((s) => s.department === department && s.readinessScore >= 45 && !alreadyOffered.has(s.id));
  const targetPlaced = Math.round(pool.length * deptPassRate * OFFER_ACCEPT_GIVEN_PASS);
  const companyByDept = { CSE: 'co_techcorp', IT: 'co_techcorp', ECE: 'co_nexus', MECH: 'co_buildright' };
  const driveByDept = { CSE: 'drive_techcorp', IT: 'drive_techcorp', ECE: 'drive_nexus', MECH: 'drive_buildright' };
  for (let i = 0; i < targetPlaced && i < pool.length; i++) {
    makeOffer({
      studentId: pool[i].id, driveId: driveByDept[department], companyId: companyByDept[department],
      status: 'accepted', expiresInHours: randInt(200, 500), ctc: randInt(5, 15),
    });
  }
}

// --- Joining records -------------------------------------------------
// 7 unverified joining records (spec section 25's own example figure).
const acceptedOffers = offers.filter((o) => o.status === 'accepted');
let joiningSeq = 0;
const joiningRecords = [];
for (let i = 0; i < acceptedOffers.length; i++) {
  const o = acceptedOffers[i];
  joiningSeq += 1;
  joiningRecords.push({
    id: `join_${String(joiningSeq).padStart(4, '0')}`,
    institutionId: INSTITUTION_ID,
    studentId: o.studentId,
    offerId: o.id,
    confirmed: rand() < 0.65,
    verified: i < 7 ? false : true, // first 7 explicitly unverified
    recordedAt: hoursAgo(randInt(1, 300)),
  });
}

// --- Training ----------------------------------------------------------
// "Communication Bootcamp": 18 completions, only 6 with post-assessment
// data (spec sections 31 & 39's own worked example).
const trainingPrograms = [
  { id: 'train_comm_bootcamp', institutionId: INSTITUTION_ID, name: 'Communication Bootcamp', season: SEASON },
  { id: 'train_dsa_sprint', institutionId: INSTITUTION_ID, name: 'DSA Problem-Solving Sprint', season: SEASON },
];
const trainingCompletions = [];
const bootcampStudents = students.slice(0, 18);
bootcampStudents.forEach((s, i) => {
  const hasAssessment = i < 6;
  trainingCompletions.push({
    id: `tc_${i + 1}`,
    institutionId: INSTITUTION_ID,
    programId: 'train_comm_bootcamp',
    studentId: s.id,
    completedAt: hoursAgo(randInt(200, 1000)),
    preAssessmentScore: hasAssessment ? randInt(40, 60) : null,
    postAssessmentScore: hasAssessment ? randInt(65, 90) : null,
  });
});
const dsaStudents = students.slice(18, 44);
dsaStudents.forEach((s, i) => {
  trainingCompletions.push({
    id: `tc_dsa_${i + 1}`,
    institutionId: INSTITUTION_ID,
    programId: 'train_dsa_sprint',
    studentId: s.id,
    completedAt: hoursAgo(randInt(100, 800)),
    preAssessmentScore: randInt(35, 65),
    postAssessmentScore: randInt(55, 92),
  });
});

// --- Policies ------------------------------------------------------------
const policies = {
  active: {
    id: 'policy_2026', institutionId: INSTITUTION_ID, season: SEASON,
    multipleOfferPolicy: 'Students may hold at most 2 pending offers before choosing.',
    withdrawalPolicy: 'Withdrawal after acceptance requires TPO approval and a documented reason.',
    aiActionPolicy: {
      lowRiskWriteRequiresConfirmation: true,
      bulkCommunicationRequiresApproval: true,
    },
  },
};

// --- Executive target (for root-cause / below-target questions) --------
const placementTarget = { institutionId: INSTITUTION_ID, season: SEASON, targetPct: 75 };

module.exports = {
  INSTITUTION_ID,
  SEASON,
  students,
  companies,
  drives,
  applications,
  interviews,
  offers,
  joiningRecords,
  trainingPrograms,
  trainingCompletions,
  policies,
  placementTarget,
  // exposed for tests/verification
  _debug: { abcUnappliedCount: abcUnapplied.length, abcAppliedCount: abcApplied.length },
};
