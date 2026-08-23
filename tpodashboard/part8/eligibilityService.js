/**
 * Eligibility checking against a drive's stated criteria (never invented
 * — always sourced from the drive record itself, same discipline as the
 * skill-gap target requirement in skillIntelligenceService.js).
 */
function checkEligibility(student, drive) {
  const blockingReasons = [];
  const e = drive.eligibility || {};

  if (typeof e.minCgpa === 'number' && student.cgpa < e.minCgpa) {
    blockingReasons.push({ criterion: 'cgpa', required: e.minCgpa, actual: student.cgpa, fixable: 'SLOW' });
  }
  if (typeof e.maxBacklogs === 'number' && student.backlogs > e.maxBacklogs) {
    blockingReasons.push({ criterion: 'backlogs', required: e.maxBacklogs, actual: student.backlogs, fixable: 'SLOW' });
  }
  if (Array.isArray(e.departments) && e.departments.length > 0 && !e.departments.includes(student.department)) {
    blockingReasons.push({ criterion: 'department', required: e.departments, actual: student.department, fixable: 'NEVER' });
  }
  if (typeof e.minProfileCompletenessPct === 'number' && student.profileCompletenessPct < e.minProfileCompletenessPct) {
    blockingReasons.push({
      criterion: 'profile',
      required: e.minProfileCompletenessPct,
      actual: student.profileCompletenessPct,
      fixable: 'QUICK',
    });
  }

  return { eligible: blockingReasons.length === 0, blockingReasons };
}

/**
 * A "quick win" is a student blocked from an otherwise-eligible drive by
 * EXACTLY ONE criterion, AND that criterion is fixable in days (profile
 * completeness), not a criterion that takes a semester (CGPA, backlogs)
 * or is permanent for this drive (department). This is the difference
 * between an actionable TPO to-do and a student who just isn't eligible
 * this season — conflating them wastes limited intervention time.
 *
 * @param {Array} students  each with {studentId, cgpa, backlogs, department, profileCompletenessPct}
 * @param {Array} drives    DriveRecord[], typically the active/high-value ones
 */
function findQuickWins(students, drives) {
  const results = [];
  for (const student of students) {
    for (const drive of drives) {
      const { eligible, blockingReasons } = checkEligibility(student, drive);
      if (!eligible && blockingReasons.length === 1 && blockingReasons[0].fixable === 'QUICK') {
        results.push({
          studentId: student.studentId,
          driveId: drive.driveId,
          company: drive.company,
          tier: drive.tier,
          blockingReason: blockingReasons[0],
        });
      }
    }
  }
  return results;
}

/** Which drives (from the full catalog) is this student currently eligible for? */
function eligibleDrivesForStudent(student, drives) {
  return drives.filter((d) => checkEligibility(student, d).eligible);
}

module.exports = { checkEligibility, findQuickWins, eligibleDrivesForStudent };
