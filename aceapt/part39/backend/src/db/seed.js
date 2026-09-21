const db = require('./index');
const { id, toJSON } = require('../utils');
const { DEMO_STUDENT_ID } = require('../constants');
const { parseAndIngest, runAnalysis } = require('../services/analysisOrchestrator');

const COMPANY_X_JD = `Backend Developer
Company X

About the role:
We're looking for a Backend Developer to help build and maintain our core API platform.

Requirements:
- 0-2 years experience (freshers welcome)
- Strong programming ability in Python
- Experience building REST APIs
- Familiarity with PostgreSQL or another relational database
- Solid understanding of data structures and algorithms
- Experience with automated testing is required

Preferred:
- Experience with Django
- Exposure to AI-integrated features or LLM APIs
- Familiarity with Docker

Location: Bengaluru (Hybrid)
Compensation: 6-9 LPA
Deadline: Rolling`;

const FRONTEND_JD = `Frontend Developer Intern
Luma Design Co

Responsibilities:
- Build responsive UI components using React
- Collaborate with designers on Figma handoff
- Write clean, maintainable CSS and JavaScript

Requirements:
- Proficiency in JavaScript and React
- Strong CSS skills
- Eye for UI/UX detail

Nice to have:
- Experience with TypeScript
- Familiarity with Figma

Location: Remote
Compensation: Stipend, 15000/month`;

const RISKY_JD = `Data Entry Executive -- Immediate Joiner
QuickHire Global

Earn ₹3000/day working from home! 100% job guarantee, no interview required.
Instant hire for all candidates.

To confirm your seat, a refundable registration fee of ₹500 is required before onboarding.
Please share your bank account details for verification and salary processing.

Contact: quickhire.hr2024@gmail.com
Apply here: bit.ly/quickhire-apply

Location: Remote`;

const MERIDIAN_JD = `Software Engineer -- Backend
Meridian Systems

About the role:
Join our platform team building services that power our core product.

Requirements:
- Strong programming ability in Python or Java
- Experience with REST APIs and microservices
- Comfort with SQL and relational databases
- Automated testing experience is required for this role
- 0-1 years experience is fine -- we train on the job

Preferred:
- Exposure to Docker and cloud deployment (AWS or GCP)
- Familiarity with CI/CD pipelines

Location: Bengaluru (Onsite)
Compensation: 7-10 LPA
Deadline: 2026-09-20`;

function clearDemoData() {
  const oppSub = 'SELECT id FROM opportunities WHERE student_id = ?';
  const appSub = 'SELECT id FROM applications WHERE student_id = ?';
  db.prepare('DELETE FROM events WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare(`DELETE FROM followups WHERE application_id IN (${appSub})`).run(DEMO_STUDENT_ID);
  db.prepare(`DELETE FROM application_documents WHERE application_id IN (${appSub})`).run(DEMO_STUDENT_ID);
  db.prepare(`DELETE FROM application_stage_history WHERE application_id IN (${appSub})`).run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM applications WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare(`DELETE FROM opportunity_safety_signals WHERE opportunity_id IN (${oppSub})`).run(DEMO_STUDENT_ID);
  db.prepare(`DELETE FROM opportunity_analysis WHERE opportunity_id IN (${oppSub})`).run(DEMO_STUDENT_ID);
  db.prepare(`DELETE FROM opportunity_requirements WHERE opportunity_id IN (${oppSub})`).run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM opportunities WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM resumes WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM positioning_profiles WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM evidence WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM projects WHERE student_id = ?').run(DEMO_STUDENT_ID);
  db.prepare('DELETE FROM students WHERE id = ?').run(DEMO_STUDENT_ID);
}

async function seed() {
  clearDemoData();

  db.prepare(`INSERT INTO students (id, name, email, target_role, career_direction, education_level, constraints_json)
    VALUES (?,?,?,?,?,?,?)`).run(
    DEMO_STUDENT_ID, 'Aditi Sharma', 'aditi.sharma@example.edu', 'Backend Developer',
    'Backend and AI-integrated systems', 'B.Tech Computer Science, Final Year',
    toJSON({ preferred_location: 'Bengaluru', remote_only: false, relocation: true, priorities: ['Long-term career', 'Learning'] }),
  );

  const project1 = id('proj');
  const project2 = id('proj');
  const project3 = id('proj');
  const insertProject = db.prepare(`INSERT INTO projects (id, student_id, name, description, skills_json, completeness, recency_date) VALUES (?,?,?,?,?,?,?)`);
  insertProject.run(project1, DEMO_STUDENT_ID, 'Inventory Management API',
    'A REST API for tracking warehouse inventory, with a PostgreSQL-backed data model and JWT authentication.',
    toJSON(['Python', 'REST APIs', 'PostgreSQL', 'Django', 'SQL']), 'COMPLETE', '2026-05-01');
  insertProject.run(project2, DEMO_STUDENT_ID, 'Campus Chatbot Assistant',
    'An AI-integrated chatbot that answers common student queries by calling a language model API.',
    toJSON(['Python', 'Machine Learning', 'REST APIs']), 'COMPLETE', '2026-07-10');
  insertProject.run(project3, DEMO_STUDENT_ID, 'Personal Portfolio Site',
    'A static personal portfolio site.', toJSON(['HTML', 'CSS', 'JavaScript']), 'PARTIAL', '2025-11-20');

  const insertEvidence = db.prepare(`INSERT INTO evidence (id, student_id, skill, evidence_type, strength, description, project_id) VALUES (?,?,?,?,?,?,?)`);
  const ev = (skill, type, strength, desc, projectId = null) => insertEvidence.run(id('ev'), DEMO_STUDENT_ID, skill, type, strength, desc, projectId);
  ev('Python', 'PROJECT', 'STRONG', 'Core backend logic for the Inventory Management API and Campus Chatbot Assistant.', project1);
  ev('REST APIs', 'PROJECT', 'STRONG', 'Designed and implemented REST endpoints for the Inventory Management API.', project1);
  ev('PostgreSQL', 'PROJECT', 'STRONG', 'Used PostgreSQL as the primary datastore for the Inventory Management API, including schema design and migrations.', project1);
  ev('SQL', 'PROJECT', 'STRONG', 'Wrote queries and schema migrations for the Inventory Management API.', project1);
  ev('Django', 'PROJECT', 'MODERATE', 'Built the Inventory Management API on Django.', project1);
  ev('Algorithms', 'ASSESSMENT', 'STRONG', 'Completed a validated data structures & algorithms assessment.');
  ev('Machine Learning', 'PROJECT', 'MODERATE', 'Integrated a language model API into the Campus Chatbot Assistant.', project2);
  ev('HTML', 'PROJECT', 'MODERATE', 'Built the structure for a personal portfolio site.', project3);
  ev('CSS', 'PROJECT', 'MODERATE', 'Styled a personal portfolio site.', project3);
  ev('JavaScript', 'SELF_DECLARED', 'LIMITED', 'Comfortable with basic JavaScript from coursework; no project evidence yet.');
  ev('React', 'SELF_DECLARED', 'UNSUPPORTED', 'Aware of React from coursework; have not built anything with it yet.');
  ev('Testing', 'SELF_DECLARED', 'LIMITED', 'Wrote manual test cases for personal projects; no automated testing experience yet.');
  ev('Git', 'ASSESSMENT', 'STRONG', 'Completed a validated Git & version control assessment.');
  ev('Data Structures', 'ASSESSMENT', 'STRONG', 'Completed a validated data structures & algorithms assessment.');
  ev('Communication', 'ASSESSMENT', 'MODERATE', 'Completed a validated communication skills assessment.');

  db.prepare(`INSERT INTO positioning_profiles (id, student_id, role_direction, statement, differentiators_json) VALUES (?,?,?,?,?)`).run(
    id('pos'), DEMO_STUDENT_ID, 'Backend-focused developer',
    'Backend-focused developer building Python APIs, database-backed applications, and AI-integrated systems.',
    toJSON(['Comfortable working across the stack, from database design to API integration, with growing exposure to AI-integrated features.']),
  );

  const insertResume = db.prepare(`INSERT INTO resumes (id, student_id, title, summary, emphasis_tags_json, is_master) VALUES (?,?,?,?,?,?)`);
  insertResume.run(id('resume'), DEMO_STUDENT_ID, 'Backend-Focused Resume',
    'Emphasizes Python, REST APIs, and PostgreSQL project work.', toJSON(['Python', 'REST APIs', 'PostgreSQL', 'Django', 'SQL']), 0);
  insertResume.run(id('resume'), DEMO_STUDENT_ID, 'General / Full-Stack Resume',
    'Broader resume covering both frontend basics and backend project work.', toJSON(['JavaScript', 'HTML', 'CSS', 'Python']), 1);

  const insertOpp = db.prepare(`INSERT INTO opportunities
    (id, student_id, role, company, industry, source_type, raw_jd_text, posting_date, status)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  const opp1 = id('opp');
  insertOpp.run(opp1, DEMO_STUDENT_ID, 'Backend Developer', 'Company X', 'Software / SaaS', 'OFFICIAL_COMPANY_SOURCE', COMPANY_X_JD, '2026-08-20', 'NEW');

  const opp2 = id('opp');
  insertOpp.run(opp2, DEMO_STUDENT_ID, 'Frontend Developer Intern', 'Luma Design Co', 'Design / Product', 'EXTERNAL_SOURCE', FRONTEND_JD, '2026-08-18', 'NEW');

  const opp3 = id('opp');
  insertOpp.run(opp3, DEMO_STUDENT_ID, 'Data Entry Executive', 'QuickHire Global', 'Unknown', 'UNKNOWN', RISKY_JD, '2026-08-25', 'NEW');

  const opp4 = id('opp');
  insertOpp.run(opp4, DEMO_STUDENT_ID, 'Software Engineer -- Backend', 'Meridian Systems', 'Software / SaaS', 'VERIFIED_JOB_SOURCE', MERIDIAN_JD, '2026-08-22', 'NEW');

  for (const oppId of [opp1, opp2, opp3, opp4]) {
    const jd = db.prepare('SELECT raw_jd_text FROM opportunities WHERE id = ?').get(oppId).raw_jd_text;
    // eslint-disable-next-line no-await-in-loop
    await parseAndIngest(db, oppId, jd);
    runAnalysis(db, oppId);
  }

  console.log('Seed complete.');
  console.log(`Demo student id: ${DEMO_STUDENT_ID}`);
  console.log(`Seeded opportunities: ${opp1} (Company X), ${opp2} (Luma Design Co), ${opp3} (QuickHire Global -- safety demo), ${opp4} (Meridian Systems)`);
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
