/**
 * Repository contracts.
 *
 * Part 8 never queries a database directly — it asks for signals through
 * these shapes. In your real system, implement each of these against your
 * actual Part 1-7 tables/ORM and inject them into the services below.
 * `/demo/fixtures.js` implements this same contract with fabricated data,
 * clearly labeled as such, purely so the engine can be exercised end to
 * end (section 80 permits dedicated dev/demo fixtures — this is that,
 * nothing here is meant to look like production data).
 *
 * Every method may legitimately return an empty array / null. That is not
 * an error — it means "no signal," and callers must treat it as missing
 * data, never as zero (section 17).
 *
 * @typedef {Object} AssessmentRecord
 * @property {string} skillArea        specific skill, e.g. "SQL" — used for skill-gap analysis
 * @property {string} dimension        which of the 6 readiness dimensions this rolls into
 * @property {number} rawScore
 * @property {number} maxScore
 * @property {string} takenAt          ISO date
 *
 * @typedef {Object} TrainingRecord
 * @property {string} programId
 * @property {string} name
 * @property {string} dimension        which readiness dimension this trains toward
 * @property {boolean} enrolled
 * @property {number} attendancePct
 * @property {boolean} completed
 * @property {string|null} completedAt
 *
 * @typedef {Object} InterventionRecord
 * @property {string} id
 * @property {string} type
 * @property {string} assignedAt
 * @property {string|null} completedAt
 * @property {number|null} readinessBefore
 * @property {number|null} readinessAfter
 *
 * @typedef {Object} MockInterviewRecord
 * @property {string} date
 * @property {number} overallScore     0-100
 * @property {Object<string, number>} skillScores
 *
 * @typedef {Object} ApplicationRecord
 * @property {string} driveId
 * @property {string} appliedAt
 * @property {'APPLIED'|'SHORTLISTED'|'INTERVIEW_SCHEDULED'|'REJECTED'|'WITHDRAWN'} status
 *
 * @typedef {Object} RealInterviewRecord
 * @property {string} driveId
 * @property {number} round
 * @property {'PASS'|'FAIL'|'PENDING'} result
 * @property {string} date
 *
 * @typedef {Object} OfferRecord
 * @property {string} driveId
 * @property {string} offeredAt
 * @property {number} ctcLPA        annual CTC in lakhs — India convention
 * @property {boolean} accepted
 * @property {boolean} joined
 *
 * @typedef {Object} AcademicRecord
 * @property {number} cgpa
 * @property {number} backlogs        current active backlogs
 * @property {string} department      e.g. "CSE"
 * @property {string} batch           e.g. "2026"
 *
 * @typedef {Object} DriveRecord
 * @property {string} driveId
 * @property {string} company
 * @property {'DREAM'|'CORE'|'MASS'} tier   rough Indian-campus classification by selectivity/prestige
 * @property {string} role
 * @property {number} ctcLPA
 * @property {{minCgpa?: number, maxBacklogs?: number, departments?: string[], minProfileCompletenessPct?: number}} eligibility
 * @property {string} applicationDeadline  ISO date
 * @property {string} interviewDate        ISO date
 * @property {string} seasonId
 *
 * Interfaces below are documentation, not enforced types (plain JS, zero
 * dependencies by design — see README for why). Implement each method
 * with this signature and return shape.
 */

const REPOSITORY_CONTRACT = {
  AssessmentRepository: {
    // (studentId) => Promise<AssessmentRecord[]> | AssessmentRecord[]
    getRecentAssessments: 'studentId -> AssessmentRecord[]',
  },
  TrainingRepository: {
    getTrainingHistory: 'studentId -> TrainingRecord[]',
  },
  InterventionRepository: {
    getInterventions: 'studentId -> InterventionRecord[]',
  },
  MockInterviewRepository: {
    getMockInterviews: 'studentId -> MockInterviewRecord[]',
  },
  ApplicationRepository: {
    getApplications: 'studentId, seasonId -> ApplicationRecord[]',
    // Institution-wide, for funnel/drive analytics — every application
    // record for a drive, across all students.
    getApplicationsForDrive: 'driveId -> (ApplicationRecord & {studentId})[]',
  },
  RealInterviewRepository: {
    getInterviews: 'studentId -> RealInterviewRecord[]',
  },
  OfferRepository: {
    getOffers: 'studentId -> OfferRecord[]',
    getOffersForSeason: 'seasonId -> (OfferRecord & {studentId})[]',
  },
  ProfileRepository: {
    // -> { completenessPct: number, missingFields: string[] }
    getProfileCompleteness: 'studentId -> ProfileCompleteness',
  },
  AcademicRepository: {
    getAcademicProfile: 'studentId -> AcademicRecord',
  },
  DriveRepository: {
    getDrive: 'driveId -> DriveRecord',
    getDrivesForSeason: 'seasonId -> DriveRecord[]',
  },
  StudentDirectoryRepository: {
    // The registered population for a season — funnel counting starts
    // here. Real system: your students table filtered by batch/season.
    getRegisteredStudents: 'seasonId -> {studentId: string, department: string}[]',
  },
};

module.exports = { REPOSITORY_CONTRACT };
