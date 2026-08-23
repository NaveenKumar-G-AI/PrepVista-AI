// PrepVista AI — orphan-record sweep (Part 16 §33)
//
// Each check mirrors a `LEFT JOIN ... WHERE x.id IS NULL` in a real DB —
// the SQL-shaped comment above each one is what to run once this points at
// Postgres/MySQL instead of the in-memory fixture. Fix the source data;
// don't hide the count in a report (§33's own instruction).

function check(label, badIds) {
  return { label, count: badIds.length, ids: badIds };
}

export function runDataIntegrityScan(db) {
  const checks = [];

  // 1. Applications without a drive
  // SQL: SELECT a.id FROM applications a LEFT JOIN drives d ON d.id=a.drive_id WHERE d.id IS NULL;
  checks.push(check('applications without a drive',
    db.applications.filter((a) => !db.drives.some((d) => d.id === a.driveId)).map((a) => a.id)));

  // 2. Interviews without an application
  checks.push(check('interviews without an application',
    db.interviews.filter((i) => !db.applications.some((a) => a.id === i.applicationId)).map((i) => i.id)));

  // 3. Offers without a selected interview backing them
  checks.push(check('offers without a selection',
    db.offers.filter((o) => !db.interviews.some((i) => i.applicationId === o.applicationId && i.result === 'selected')).map((o) => o.id)));

  // 4. Joinings without an offer
  checks.push(check('joinings without an offer',
    db.joinings.filter((j) => !db.offers.some((o) => o.id === j.offerId)).map((j) => j.id)));

  // 5. Verified placement outcomes without joining evidence
  checks.push(check('placement outcomes without a verified joining',
    db.placementOutcomes.filter((p) => !db.joinings.some((j) => j.id === p.joiningId && j.status === 'verified')).map((p) => p.id)));

  // 6. Training enrollments without a student
  checks.push(check('training enrollments without a student',
    db.trainings.filter((t) => !db.students.some((s) => s.id === t.studentId)).map((t) => t.id)));

  // 7. Readiness records without a student
  checks.push(check('readiness records without a student',
    db.readinessRecords.filter((r) => !db.students.some((s) => s.id === r.studentId)).map((r) => r.id)));

  // 8. Communication recipients without a student
  checks.push(check('communications without a valid recipient',
    db.communications.filter((c) => !db.students.some((s) => s.id === c.recipientStudentId)).map((c) => c.id)));

  // 9. Proactive signals without a resolvable source entity
  checks.push(check('signals without a source entity',
    db.proactiveSignals.filter((sig) => sig.sourceType === 'student' && !db.students.some((s) => s.id === sig.sourceId)).map((sig) => sig.id)));

  // 10. AI actions confirmed without a confirming user — §38
  checks.push(check('confirmed AI actions with no confirming user',
    db.aiActions.filter((act) => act.status !== 'prepared' && !act.confirmedByUserId).map((act) => act.id)));

  // 11. Forecasts without a cutoff or model version
  checks.push(check('forecasts without a cutoff/model version',
    db.forecasts.filter((f) => !f.modelVersion || !f.dataCutoffAt).map((f) => f.id)));

  return checks;
}
