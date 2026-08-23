// PrepVista AI — Part 16 fixture data
//
// Two institutions. Institution A carries a realistic funnel (some students
// applied, some eligible ones didn't, one drive already ran end to end).
// Institution B exists purely to prove tenant isolation. A handful of
// records are deliberately broken — each one is labeled with which §33
// check it's meant to trip.
//
// Everything else in this kit runs against this dataset. No network, no
// external DB, nothing to install.

const now = Date.now();
const days = (n) => new Date(now + n * 86400000).toISOString();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

function s(id, institutionId, departmentId, name, readinessScore) {
  return { id, institutionId, departmentId, name, readinessScore };
}

function a(id, institutionId, studentId, driveId, status, appliedAt) {
  return { id, institutionId, studentId, driveId, status, appliedAt };
}

export function seed() {
  const institutions = [
    { id: 'inst-a', name: 'Northgate College of Engineering' },
    { id: 'inst-b', name: 'Silverline Institute of Technology' },
  ];

  const departments = [
    { id: 'dept-cse', institutionId: 'inst-a', name: 'CSE' },
    { id: 'dept-ece', institutionId: 'inst-a', name: 'ECE' },
    { id: 'dept-mech', institutionId: 'inst-a', name: 'MECH' },
    { id: 'dept-it', institutionId: 'inst-a', name: 'IT' },
    { id: 'dept-cse-b', institutionId: 'inst-b', name: 'CSE' },
  ];

  const students = [
    // Institution A — CSE
    s('stu-001', 'inst-a', 'dept-cse', 'Aditi Rao', 92),
    s('stu-002', 'inst-a', 'dept-cse', 'Karthik Subramaniam', 88),
    s('stu-003', 'inst-a', 'dept-cse', 'Divya Menon', 55),
    s('stu-004', 'inst-a', 'dept-cse', 'Rahul Nair', 61),
    s('stu-005', 'inst-a', 'dept-cse', 'Priya Iyer', 95),
    s('stu-006', 'inst-a', 'dept-cse', 'Vignesh Kumar', 48),
    // ECE
    s('stu-007', 'inst-a', 'dept-ece', 'Sanjana Pillai', 85),
    s('stu-008', 'inst-a', 'dept-ece', 'Arjun Reddy', 58),
    s('stu-009', 'inst-a', 'dept-ece', 'Meera Krishnan', 90),
    s('stu-010', 'inst-a', 'dept-ece', 'Kiran Bose', 65),
    // MECH
    s('stu-011', 'inst-a', 'dept-mech', 'Naveen Raj', 52),
    s('stu-012', 'inst-a', 'dept-mech', 'Swathi Ramesh', 78),
    s('stu-013', 'inst-a', 'dept-mech', 'Harish Chandran', 45),
    s('stu-014', 'inst-a', 'dept-mech', 'Deepika Suresh', 81),
    // IT
    s('stu-015', 'inst-a', 'dept-it', 'Yash Malhotra', 89),
    s('stu-016', 'inst-a', 'dept-it', 'Pooja Varma', 67),
    s('stu-017', 'inst-a', 'dept-it', 'Rohit Sharma', 93),
    s('stu-018', 'inst-a', 'dept-it', 'Ananya Ghosh', 60),
    // Institution B — isolated, small
    s('stu-b-001', 'inst-b', 'dept-cse-b', 'Zara Ahmed', 82),
    s('stu-b-002', 'inst-b', 'dept-cse-b', 'Farhan Ali', 66),
    s('stu-b-003', 'inst-b', 'dept-cse-b', 'Ishita Bose', 74),
    s('stu-b-004', 'inst-b', 'dept-cse-b', 'Manav Deshpande', 59),
  ];

  const companies = [
    { id: 'co-zenith', institutionId: 'inst-a', name: 'Zenith Systems' },
    { id: 'co-orbit', institutionId: 'inst-a', name: 'Orbit Analytics' },
    { id: 'co-vertex', institutionId: 'inst-a', name: 'Vertex Robotics' },
    { id: 'co-crestline-b', institutionId: 'inst-b', name: 'Crestline Data' },
  ];

  const drives = [
    {
      id: 'drv-zenith-sde', institutionId: 'inst-a', companyId: 'co-zenith',
      title: 'Zenith Systems — SDE', status: 'published',
      eligibility: { minReadiness: 70, departments: ['dept-cse', 'dept-it'] },
      applicationDeadline: days(4),
    },
    {
      // eligible (readiness>=60, CSE/ECE/IT): stu-001,002,004,005,007,009,010,015,016,017,018 (11)
      // applied: 007, 009, 016 — the other 8 are the "eligible but haven't applied" pool
      id: 'drv-orbit-analyst', institutionId: 'inst-a', companyId: 'co-orbit',
      title: 'Orbit Analytics — Data Analyst', status: 'published',
      eligibility: { minReadiness: 60, departments: ['dept-cse', 'dept-ece', 'dept-it'] },
      applicationDeadline: days(9),
    },
    {
      id: 'drv-vertex-hw', institutionId: 'inst-a', companyId: 'co-vertex',
      title: 'Vertex Robotics — Hardware Engineer', status: 'closed',
      eligibility: { minReadiness: 60, departments: ['dept-ece', 'dept-mech'] },
      applicationDeadline: daysAgo(20),
    },
    {
      id: 'drv-crestline-b', institutionId: 'inst-b', companyId: 'co-crestline-b',
      title: 'Crestline Data — Analyst', status: 'published',
      eligibility: { minReadiness: 60, departments: ['dept-cse-b'] },
      applicationDeadline: days(6),
    },
  ];

  const applications = [
    // drv-zenith-sde: eligible = 001,002,005,015,017 (readiness>=70, CSE/IT). Applied: 002, 015
    a('app-001', 'inst-a', 'stu-002', 'drv-zenith-sde', 'applied', daysAgo(3)),
    a('app-002', 'inst-a', 'stu-015', 'drv-zenith-sde', 'applied', daysAgo(2)),
    // drv-orbit-analyst: applied 007, 009, 016 (see eligibility note above)
    a('app-003', 'inst-a', 'stu-007', 'drv-orbit-analyst', 'applied', daysAgo(5)),
    a('app-004', 'inst-a', 'stu-009', 'drv-orbit-analyst', 'applied', daysAgo(4)),
    a('app-005', 'inst-a', 'stu-016', 'drv-orbit-analyst', 'applied', daysAgo(1)),
    // drv-vertex-hw (closed, golden path): Deepika selected → offer → joining; Swathi interviewed → rejected
    a('app-006', 'inst-a', 'stu-014', 'drv-vertex-hw', 'selected', daysAgo(19)),
    a('app-007', 'inst-a', 'stu-012', 'drv-vertex-hw', 'rejected', daysAgo(19)),
    // BROKEN — §33 check #1: driveId doesn't exist
    a('app-099', 'inst-a', 'stu-006', 'drv-999-missing', 'applied', daysAgo(1)),
    // Institution B
    a('app-b-001', 'inst-b', 'stu-b-001', 'drv-crestline-b', 'applied', daysAgo(2)),
  ];

  const interviews = [
    { id: 'intv-001', institutionId: 'inst-a', applicationId: 'app-006', status: 'completed', result: 'selected', scheduledAt: daysAgo(18) },
    { id: 'intv-002', institutionId: 'inst-a', applicationId: 'app-007', status: 'completed', result: 'rejected', scheduledAt: daysAgo(18) },
    // BROKEN — §33 check #2: applicationId doesn't exist
    { id: 'intv-099', institutionId: 'inst-a', applicationId: 'app-999-missing', status: 'completed', result: 'selected', scheduledAt: daysAgo(10) },
  ];

  const offers = [
    { id: 'off-001', institutionId: 'inst-a', applicationId: 'app-006', status: 'accepted' },
    // BROKEN — §33 check #3: app-004 has no 'selected' interview backing this offer
    { id: 'off-099', institutionId: 'inst-a', applicationId: 'app-004', status: 'published' },
  ];

  const joinings = [
    { id: 'join-001', institutionId: 'inst-a', offerId: 'off-001', status: 'verified' },
    // BROKEN — §33 check #4: offerId doesn't exist
    { id: 'join-099', institutionId: 'inst-a', offerId: 'off-999-missing', status: 'pending' },
  ];

  const placementOutcomes = [
    { id: 'place-001', institutionId: 'inst-a', joiningId: 'join-001' },
    // BROKEN — §33 check #5: joiningId doesn't exist / isn't verified
    { id: 'place-099', institutionId: 'inst-a', joiningId: 'join-999-missing' },
  ];

  const trainings = [
    { id: 'trn-001', institutionId: 'inst-a', studentId: 'stu-003', status: 'in_progress' },
    // BROKEN — §33 check #6: studentId doesn't exist
    { id: 'trn-099', institutionId: 'inst-a', studentId: 'stu-999-missing', status: 'assigned' },
  ];

  const readinessRecords = [
    { id: 'rdy-001', institutionId: 'inst-a', studentId: 'stu-003', score: 55, updatedAt: daysAgo(2) },
    // BROKEN — §33 check #7: studentId doesn't exist
    { id: 'rdy-099', institutionId: 'inst-a', studentId: 'stu-999-missing', score: 40, updatedAt: daysAgo(2) },
  ];

  const communications = [
    { id: 'comm-001', institutionId: 'inst-a', recipientStudentId: 'stu-003', status: 'sent', subject: 'Training reminder' },
    // BROKEN — §33 check #8: recipientStudentId doesn't exist
    { id: 'comm-099', institutionId: 'inst-a', recipientStudentId: 'stu-999-missing', status: 'sent', subject: 'Ghost recipient' },
  ];

  const proactiveSignals = [
    // BROKEN — §33 check #9: sourceId doesn't exist
    { id: 'sig-099', institutionId: 'inst-a', type: 'DATA_QUALITY', sourceType: 'student', sourceId: 'stu-999-missing', priority: 'low', createdAt: daysAgo(1) },
  ];

  const aiActions = [
    // BROKEN — §33 check #10 / §38: confirmed with no confirming user
    { id: 'act-099', institutionId: 'inst-a', status: 'confirmed', type: 'SEND_REMINDER', confirmedByUserId: null, payload: {} },
  ];

  const forecasts = [
    // BROKEN — §33 check #11: no cutoff / model version
    { id: 'fc-099', institutionId: 'inst-a', modelVersion: null, dataCutoffAt: null },
  ];

  const users = [
    { id: 'usr-tpohead-a', institutionId: 'inst-a', role: 'tpo_head', name: 'TPO Head (A)' },
    { id: 'usr-po-a', institutionId: 'inst-a', role: 'placement_officer', name: 'Placement Officer (A)' },
    { id: 'usr-deptcoord-a', institutionId: 'inst-a', role: 'department_coordinator', name: 'CSE Coordinator (A)', departmentId: 'dept-cse' },
    { id: 'usr-faculty-a', institutionId: 'inst-a', role: 'faculty', name: 'Faculty (A)', assignedStudentIds: ['stu-001', 'stu-002'] },
    { id: 'usr-mgmt-a', institutionId: 'inst-a', role: 'management', name: 'Management (A)' },
    { id: 'usr-student-aditi', institutionId: 'inst-a', role: 'student', name: 'Aditi Rao', studentId: 'stu-001' },
    { id: 'usr-tpohead-b', institutionId: 'inst-b', role: 'tpo_head', name: 'TPO Head (B)' },
  ];

  return {
    institutions, departments, students, companies, drives, applications,
    interviews, offers, joinings, placementOutcomes, trainings,
    readinessRecords, communications, proactiveSignals, aiActions, forecasts,
    users, eventLog: [],
  };
}
