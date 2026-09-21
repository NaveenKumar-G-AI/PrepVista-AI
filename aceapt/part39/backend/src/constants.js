// Single fixed demo student so the API is immediately usable without a real
// auth system. See middleware/auth.js and README "Security & auth".
const DEMO_STUDENT_ID = 'student_demo_001';

const APPLICATION_STAGES = [
  'SAVED', 'RESEARCHING', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_CONTACT',
  'INTERVIEW_1', 'INTERVIEW_2', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE', 'CLOSED',
];

module.exports = { DEMO_STUDENT_ID, APPLICATION_STAGES };
