/**
 * DEMO / DEV FIXTURES ONLY.
 *
 * Everything in this file is fabricated to exercise the engine — none of
 * it is real student, company, or offer data, and it must never run
 * against a production database. It exists purely so the demo scripts
 * can prove the services in src/ actually compute what they claim to
 * (section 80 permits dedicated dev/demo fixtures).
 *
 * To integrate against your real PrepVista repo: implement the same
 * shapes against your actual Part 1-7 tables/ORM and pass THAT into the
 * services instead of this file.
 */

function daysAgo(n) {
  // Negative n = n days in the future (used for upcoming deadlines).
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeRepos(data) {
  return {
    assessments: { getRecentAssessments: async () => data.assessments || [] },
    training: { getTrainingHistory: async () => data.training || [] },
    interventions: { getInterventions: async () => data.interventions || [] },
    mockInterviews: { getMockInterviews: async () => data.mockInterviews || [] },
    applications: { getApplications: async () => data.applications || [] },
    interviews: { getInterviews: async () => data.interviews || [] },
    offers: { getOffers: async () => data.offers || [] },
    profile: { getProfileCompleteness: async () => data.profile || null },
    academic: { getAcademicProfile: async () => data.academic || null },
  };
}

// ======================================================================
// STUDENTS WITH FULL READINESS DATA (carried over from the Part 8 core)
// ======================================================================

const priyaData = {
  academic: { cgpa: 8.6, backlogs: 0, department: 'CSE', batch: '2026' },
  assessments: [
    { skillArea: 'DSA', dimension: 'technical', rawScore: 84, maxScore: 100, takenAt: daysAgo(5) },
    { skillArea: 'Aptitude', dimension: 'problemSolving', rawScore: 78, maxScore: 100, takenAt: daysAgo(6) },
    { skillArea: 'Group Discussion', dimension: 'communication', rawScore: 74, maxScore: 100, takenAt: daysAgo(7) },
    { skillArea: 'Role Fit', dimension: 'roleReadiness', rawScore: 80, maxScore: 100, takenAt: daysAgo(4) },
  ],
  mockInterviews: [{ date: daysAgo(3), overallScore: 81, skillScores: { 'System Design': 75, Behavioral: 85 } }],
  training: [
    { programId: 'dsa201', name: 'Advanced DSA', dimension: 'problemSolving', enrolled: true, attendancePct: 92, completed: true, completedAt: daysAgo(15) },
  ],
  interventions: [],
  applications: [
    { driveId: 'd_google', appliedAt: daysAgo(22), status: 'SHORTLISTED' },
    { driveId: 'd_microsoft', appliedAt: daysAgo(12), status: 'SHORTLISTED' },
  ],
  interviews: [
    { driveId: 'd_google', round: 1, result: 'PASS', date: daysAgo(16) },
    { driveId: 'd_microsoft', round: 1, result: 'PASS', date: daysAgo(6) },
  ],
  offers: [{ driveId: 'd_microsoft', offeredAt: daysAgo(4), ctcLPA: 38, accepted: true, joined: false }],
  profile: { completenessPct: 95, missingFields: [] },
};

const arjunBeforeData = {
  academic: { cgpa: 7.1, backlogs: 1, department: 'ECE', batch: '2026' },
  assessments: [
    { skillArea: 'DSA', dimension: 'technical', rawScore: 32, maxScore: 100, takenAt: daysAgo(8) },
    { skillArea: 'DSA', dimension: 'technical', rawScore: 38, maxScore: 100, takenAt: daysAgo(20) },
    { skillArea: 'Verbal', dimension: 'communication', rawScore: 44, maxScore: 100, takenAt: daysAgo(10) },
  ],
  mockInterviews: [
    { date: daysAgo(15), overallScore: 41, skillScores: { HR: 38, Technical: 45 } },
    { date: daysAgo(45), overallScore: 35, skillScores: { HR: 33, Technical: 37 } },
  ],
  training: [
    { programId: 'comm101', name: 'Communication Skills Workshop', dimension: 'communication', enrolled: true, attendancePct: 30, completed: false, completedAt: null },
  ],
  interventions: [],
  applications: [],
  interviews: [],
  offers: [],
  profile: { completenessPct: 60, missingFields: ['resume', 'portfolio_link'] },
};

const arjunAfterData = {
  academic: { cgpa: 7.1, backlogs: 0, department: 'ECE', batch: '2026' },
  assessments: [
    { skillArea: 'DSA', dimension: 'technical', rawScore: 68, maxScore: 100, takenAt: daysAgo(3) },
    { skillArea: 'DSA', dimension: 'technical', rawScore: 71, maxScore: 100, takenAt: daysAgo(10) },
    { skillArea: 'System Design', dimension: 'technical', rawScore: 65, maxScore: 100, takenAt: daysAgo(18) },
    { skillArea: 'Verbal', dimension: 'communication', rawScore: 72, maxScore: 100, takenAt: daysAgo(5) },
  ],
  mockInterviews: [{ date: daysAgo(6), overallScore: 66, skillScores: { HR: 64, Technical: 68 } }],
  training: [
    { programId: 'comm101', name: 'Communication Skills Workshop', dimension: 'communication', enrolled: true, attendancePct: 78, completed: true, completedAt: daysAgo(12) },
  ],
  interventions: [
    { id: 'iv1', type: 'Communication Coaching', assignedAt: daysAgo(35), completedAt: daysAgo(9), readinessBefore: 48, readinessAfter: 63 },
  ],
  applications: [{ driveId: 'd_deloitte', appliedAt: daysAgo(4), status: 'APPLIED' }],
  interviews: [],
  offers: [],
  profile: { completenessPct: 85, missingFields: ['portfolio_link'] },
};

const arjunHistory = [
  { overallScore: 55, calculatedAt: daysAgo(40), readinessLevel: 'DEVELOPING' },
  { overallScore: 51, calculatedAt: daysAgo(25), readinessLevel: 'DEVELOPING' },
  { overallScore: 48, calculatedAt: daysAgo(10), readinessLevel: 'HIGH_RISK' },
];

const kavyaData = {
  academic: { cgpa: 7.8, backlogs: 0, department: 'CSE', batch: '2026' },
  assessments: [{ skillArea: 'DSA', dimension: 'technical', rawScore: 74, maxScore: 100, takenAt: daysAgo(6) }],
  mockInterviews: [],
  training: [],
  interventions: [],
  applications: [],
  interviews: [],
  offers: [],
  profile: { completenessPct: 88, missingFields: [] },
};

// ======================================================================
// LIGHTWEIGHT STUDENTS — academic + application/interview/offer data
// only, no assessment history. This is realistic (plenty of real
// students have engaged with drives before they've built up an
// assessment history) and is what the new TPO-facing analytics mostly
// run on.
// ======================================================================

const rahulData = {
  academic: { cgpa: 6.2, backlogs: 2, department: 'CSE', batch: '2026' },
  assessments: [], mockInterviews: [], training: [],
  interventions: [{ id: 'iv2', type: 'Career Counseling', assignedAt: daysAgo(20), completedAt: null, readinessBefore: null, readinessAfter: null }],
  applications: [], interviews: [], offers: [],
  profile: { completenessPct: 45, missingFields: ['resume', 'portfolio_link', 'photo'] },
};

const snehaData = {
  academic: { cgpa: 8.9, backlogs: 0, department: 'ECE', batch: '2026' },
  assessments: [
    { skillArea: 'DSA', dimension: 'technical', rawScore: 88, maxScore: 100, takenAt: daysAgo(10) },
    { skillArea: 'Group Discussion', dimension: 'communication', rawScore: 82, maxScore: 100, takenAt: daysAgo(9) },
  ],
  mockInterviews: [], training: [], interventions: [],
  applications: [{ driveId: 'd_amazon', appliedAt: daysAgo(14), status: 'SHORTLISTED' }],
  interviews: [{ driveId: 'd_amazon', round: 1, result: 'PASS', date: daysAgo(7) }],
  offers: [{ driveId: 'd_amazon', offeredAt: daysAgo(2), ctcLPA: 33, accepted: true, joined: false }],
  profile: { completenessPct: 97, missingFields: [] },
};

const vikramData = {
  academic: { cgpa: 7.4, backlogs: 0, department: 'MECH', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [{ driveId: 'd_lt', appliedAt: daysAgo(18), status: 'SHORTLISTED' }],
  interviews: [{ driveId: 'd_lt', round: 1, result: 'PASS', date: daysAgo(11) }],
  offers: [{ driveId: 'd_lt', offeredAt: daysAgo(5), ctcLPA: 8, accepted: true, joined: true }],
  profile: { completenessPct: 80, missingFields: [] },
};

const ananyaData = {
  // Meets Amazon's cgpa/backlogs/department — blocked ONLY by profile
  // completeness (needs 90, has 62). The "quick win" case.
  academic: { cgpa: 8.3, backlogs: 0, department: 'CSE', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [], interviews: [], offers: [],
  profile: { completenessPct: 62, missingFields: ['portfolio_link', 'certifications'] },
};

const mohitData = {
  // Holds two unconfirmed offers — the multi-offer logjam case.
  academic: { cgpa: 6.8, backlogs: 1, department: 'MECH', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [
    { driveId: 'd_wipro', appliedAt: daysAgo(28), status: 'SHORTLISTED' },
    { driveId: 'd_tcs', appliedAt: daysAgo(14), status: 'SHORTLISTED' },
  ],
  interviews: [
    { driveId: 'd_wipro', round: 1, result: 'PASS', date: daysAgo(22) },
    { driveId: 'd_tcs', round: 1, result: 'PASS', date: daysAgo(9) },
  ],
  offers: [
    { driveId: 'd_wipro', offeredAt: daysAgo(20), ctcLPA: 4, accepted: false, joined: false },
    { driveId: 'd_tcs', offeredAt: daysAgo(7), ctcLPA: 9, accepted: false, joined: false },
  ],
  profile: { completenessPct: 75, missingFields: [] },
};

const divyaData = {
  // Decent profile, two early rejections, then went quiet — the
  // disengagement zero-offer-risk case, distinct from rahul's
  // never-started case.
  academic: { cgpa: 8.2, backlogs: 0, department: 'ECE', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [
    { driveId: 'd_google', appliedAt: daysAgo(50), status: 'SHORTLISTED' },
    { driveId: 'd_microsoft', appliedAt: daysAgo(40), status: 'SHORTLISTED' },
  ],
  interviews: [
    { driveId: 'd_google', round: 1, result: 'FAIL', date: daysAgo(45) },
    { driveId: 'd_microsoft', round: 1, result: 'FAIL', date: daysAgo(35) },
  ],
  offers: [],
  profile: { completenessPct: 91, missingFields: [] },
};

// Minimal registered-but-mostly-inactive students, purely to give the
// season funnel a realistic registered > eligible > applied shape.
const kiranData = {
  academic: { cgpa: 5.8, backlogs: 3, department: 'CSE', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [], interviews: [], offers: [],
  profile: { completenessPct: 30, missingFields: ['resume', 'portfolio_link', 'photo'] },
};
const farhaData = {
  academic: { cgpa: 7.6, backlogs: 0, department: 'ECE', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [], interviews: [], offers: [],
  profile: { completenessPct: 70, missingFields: [] },
};
const siddharthData = {
  academic: { cgpa: 6.5, backlogs: 0, department: 'MECH', batch: '2026' },
  assessments: [], mockInterviews: [], training: [], interventions: [],
  applications: [], interviews: [], offers: [],
  profile: { completenessPct: 55, missingFields: ['portfolio_link'] },
};

// ======================================================================
// DRIVES CATALOG — institution-wide, not per-student
// ======================================================================

const DRIVES = [
  { driveId: 'd_google', company: 'Google', tier: 'DREAM', role: 'SWE', ctcLPA: 44,
    eligibility: { minCgpa: 8.0, maxBacklogs: 0, departments: ['CSE', 'ECE'] },
    applicationDeadline: daysAgo(20), interviewDate: daysAgo(15), seasonId: '2026' },
  { driveId: 'd_microsoft', company: 'Microsoft', tier: 'DREAM', role: 'SWE', ctcLPA: 38,
    eligibility: { minCgpa: 7.5, maxBacklogs: 0, departments: ['CSE', 'ECE'] },
    applicationDeadline: daysAgo(10), interviewDate: daysAgo(5), seasonId: '2026' },
  { driveId: 'd_amazon', company: 'Amazon', tier: 'DREAM', role: 'SDE', ctcLPA: 33,
    eligibility: { minCgpa: 7.5, maxBacklogs: 0, departments: ['CSE', 'ECE'], minProfileCompletenessPct: 90 },
    applicationDeadline: daysAgo(-2), interviewDate: daysAgo(-9), seasonId: '2026' },
  { driveId: 'd_deloitte', company: 'Deloitte', tier: 'CORE', role: 'Analyst', ctcLPA: 12,
    eligibility: { minCgpa: 6.5, maxBacklogs: 1 },
    applicationDeadline: daysAgo(-3), interviewDate: daysAgo(-10), seasonId: '2026' },
  { driveId: 'd_tcs', company: 'TCS Digital', tier: 'CORE', role: 'SWE', ctcLPA: 9,
    eligibility: { minCgpa: 6.0, maxBacklogs: 2 },
    applicationDeadline: daysAgo(-8), interviewDate: daysAgo(-15), seasonId: '2026' },
  { driveId: 'd_infosys', company: 'Infosys', tier: 'MASS', role: 'Systems Engineer', ctcLPA: 4.5,
    eligibility: { minCgpa: 6.0, maxBacklogs: 2 },
    applicationDeadline: daysAgo(30), interviewDate: daysAgo(25), seasonId: '2026' },
  { driveId: 'd_wipro', company: 'Wipro', tier: 'MASS', role: 'Project Engineer', ctcLPA: 4,
    eligibility: { minCgpa: 6.0, maxBacklogs: 3 },
    applicationDeadline: daysAgo(25), interviewDate: daysAgo(20), seasonId: '2026' },
  { driveId: 'd_lt', company: 'L&T', tier: 'CORE', role: 'Design Engineer', ctcLPA: 8,
    eligibility: { minCgpa: 6.5, maxBacklogs: 1, departments: ['MECH', 'CIVIL'] },
    applicationDeadline: daysAgo(-5), interviewDate: daysAgo(-12), seasonId: '2026' },
];

function makeInstitutionRepos({ drives, students }) {
  const allApplications = students.flatMap((s) => (s.data.applications || []).map((a) => ({ ...a, studentId: s.studentId })));
  const allOffers = students.flatMap((s) => (s.data.offers || []).map((o) => ({ ...o, studentId: s.studentId })));
  const registered = students.map((s) => ({ studentId: s.studentId, department: s.data.academic.department }));

  return {
    drives: {
      getDrive: async (driveId) => drives.find((d) => d.driveId === driveId) || null,
      getDrivesForSeason: async (seasonId) => drives.filter((d) => d.seasonId === seasonId),
    },
    applicationsForDrive: {
      getApplicationsForDrive: async (driveId) => allApplications.filter((a) => a.driveId === driveId),
    },
    offersForSeason: {
      getOffersForSeason: async () => allOffers,
    },
    directory: {
      getRegisteredStudents: async () => registered,
    },
  };
}

function buildDemoDataset() {
  const roster = [
    { studentId: 'stu_priya', data: priyaData },
    { studentId: 'stu_arjun', data: arjunAfterData }, // arjun's CURRENT state for institution-wide views
    { studentId: 'stu_kavya', data: kavyaData },
    { studentId: 'stu_rahul', data: rahulData },
    { studentId: 'stu_sneha', data: snehaData },
    { studentId: 'stu_vikram', data: vikramData },
    { studentId: 'stu_ananya', data: ananyaData },
    { studentId: 'stu_mohit', data: mohitData },
    { studentId: 'stu_divya', data: divyaData },
    { studentId: 'stu_kiran', data: kiranData },
    { studentId: 'stu_farha', data: farhaData },
    { studentId: 'stu_siddharth', data: siddharthData },
  ];

  const perStudent = {};
  for (const { studentId, data } of roster) {
    perStudent[studentId] = {
      studentId,
      department: data.academic.department,
      batch: data.academic.batch,
      repos: makeRepos(data),
    };
  }

  return {
    priya: perStudent.stu_priya,
    arjunBefore: { studentId: 'stu_arjun', department: 'ECE', batch: '2026', repos: makeRepos(arjunBeforeData) },
    arjunAfter: { ...perStudent.stu_arjun, previousSnapshots: arjunHistory },
    kavya: perStudent.stu_kavya,
    rahul: perStudent.stu_rahul,
    sneha: perStudent.stu_sneha,
    vikram: perStudent.stu_vikram,
    ananya: perStudent.stu_ananya,
    mohit: perStudent.stu_mohit,
    divya: perStudent.stu_divya,
    kiran: perStudent.stu_kiran,
    farha: perStudent.stu_farha,
    siddharth: perStudent.stu_siddharth,
    roster: perStudent, // all 12, keyed by studentId, for institution-wide loops
    drives: DRIVES,
    institutionRepos: makeInstitutionRepos({ drives: DRIVES, students: roster }),
  };
}

module.exports = { makeRepos, buildDemoDataset, daysAgo, DRIVES };
