import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Seeds enough realistic, internally-consistent data to run Feature 40's
 * full loop end to end: 3 quarters of opportunity postings (so skill trends
 * have real direction to detect), 5 roles with deliberately differentiated
 * skill overlap (so branching produces PRIMARY/SPECIALIST/ADJACENT/EMERGING,
 * not everything landing in one bucket), and two students -- one with an
 * active target (the main "Career Horizon" walkthrough) and one without
 * (the discovery-mode walkthrough).
 *
 * Numbers below were hand-derived against the classification thresholds in
 * skillTrend.service.ts / futureGap.service.ts / careerPaths.service.ts
 * BEFORE running this, specifically so the live HTTP walkthrough
 * (tests/integration/liveHttpWalkthrough.ts) exercises DURABLE, GROWING,
 * EMERGING, ROLE_SPECIFIC, DECLINING and UNKNOWN skill trends; CRITICAL,
 * HIGH, MODERATE and OPTIONAL gap severities; and PRIMARY, SPECIALIST,
 * ADJACENT and EMERGING branch categories all in one connected scenario.
 */

const client = new Client({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'aceapt_feature40',
  user: process.env.MIGRATE_PGUSER || 'aceapt_owner',
  password: process.env.MIGRATE_PGPASSWORD || '',
});

type SkillDef = { slug: string; name: string; category: string; aiLeverage: string | null };
const SKILLS: SkillDef[] = [
  { slug: 'python', name: 'Python', category: 'LANGUAGE', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'sql', name: 'SQL', category: 'DATA', aiLeverage: 'AI_ASSISTED' },
  { slug: 'rest-apis', name: 'REST APIs', category: 'BACKEND', aiLeverage: 'AI_ASSISTED' },
  { slug: 'databases', name: 'Databases', category: 'DATA', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'backend-projects', name: 'Backend Projects', category: 'BACKEND', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'docker', name: 'Docker', category: 'DEVOPS', aiLeverage: 'AI_ASSISTED' },
  { slug: 'cloud-deployment', name: 'Cloud Deployment', category: 'CLOUD', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'testing', name: 'Testing', category: 'TESTING', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'ai-integration', name: 'AI Integration', category: 'AI', aiLeverage: 'AI_COMPLEMENTARY' },
  { slug: 'system-design', name: 'System Design', category: 'SYSTEM_DESIGN', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'ai-evaluation', name: 'AI Evaluation', category: 'AI', aiLeverage: 'AI_COMPLEMENTARY' },
  { slug: 'kubernetes', name: 'Kubernetes', category: 'DEVOPS', aiLeverage: 'HUMAN_CRITICAL' },
  { slug: 'data-pipelines', name: 'Data Pipelines', category: 'DATA', aiLeverage: 'AI_ASSISTED' },
  { slug: 'monolith-deployment', name: 'Monolith Deployment', category: 'DEVOPS', aiLeverage: null },
  { slug: 'legacy-mainframe', name: 'Legacy Mainframe', category: 'BACKEND', aiLeverage: null },
];

const ROLES = [
  { slug: 'ai-backend-engineering', title: 'AI / Backend Engineering', category: 'ENGINEERING' },
  { slug: 'backend-engineering', title: 'Backend Engineering', category: 'ENGINEERING' },
  { slug: 'applied-ai-engineer', title: 'Applied AI Engineer', category: 'ENGINEERING' },
  { slug: 'ai-platform-engineer', title: 'AI Platform Engineer', category: 'ENGINEERING' },
  { slug: 'data-engineering', title: 'Data Engineering', category: 'ENGINEERING' },
];

// role -> period -> skill -> frequency (0..1)
const SNAPSHOTS: Record<string, Record<string, Record<string, number>>> = {
  'ai-backend-engineering': {
    '2026-Q1': { python: 0.90, sql: 0.60, 'rest-apis': 0.85, databases: 0.80, 'backend-projects': 0.75, docker: 0.20, 'cloud-deployment': 0.03, testing: 0.05, 'ai-integration': 0.02, 'system-design': 0.10, 'ai-evaluation': 0.00, kubernetes: 0.05, 'data-pipelines': 0.10, 'monolith-deployment': 0.30, 'legacy-mainframe': 0.02 },
    '2026-Q2': { python: 0.88, sql: 0.58, 'rest-apis': 0.82, databases: 0.78, 'backend-projects': 0.74, docker: 0.28, 'cloud-deployment': 0.25, testing: 0.20, 'ai-integration': 0.14, 'system-design': 0.22, 'ai-evaluation': 0.06, kubernetes: 0.10, 'data-pipelines': 0.13, 'monolith-deployment': 0.20, 'legacy-mainframe': 0.03 },
    '2026-Q3': { python: 0.85, sql: 0.55, 'rest-apis': 0.80, databases: 0.76, 'backend-projects': 0.72, docker: 0.32, 'cloud-deployment': 0.60, testing: 0.50, 'ai-integration': 0.25, 'system-design': 0.34, 'ai-evaluation': 0.12, kubernetes: 0.13, 'data-pipelines': 0.14, 'monolith-deployment': 0.10, 'legacy-mainframe': 0.02 },
  },
  'backend-engineering': {
    '2026-Q3': { python: 0.85, sql: 0.55, 'rest-apis': 0.80, databases: 0.76, 'backend-projects': 0.72, testing: 0.40, 'cloud-deployment': 0.35, 'system-design': 0.30, docker: 0.30, kubernetes: 0.15, 'ai-integration': 0.05, 'ai-evaluation': 0.02, 'data-pipelines': 0.10 },
  },
  'applied-ai-engineer': {
    '2026-Q3': { python: 0.70, sql: 0.10, 'rest-apis': 0.20, databases: 0.12, 'backend-projects': 0.10, 'ai-integration': 0.70, 'ai-evaluation': 0.55, 'system-design': 0.18, 'cloud-deployment': 0.20, testing: 0.12, docker: 0.10, kubernetes: 0.05, 'data-pipelines': 0.35 },
  },
  'ai-platform-engineer': {
    '2026-Q3': { python: 0.65, sql: 0.15, 'rest-apis': 0.25, databases: 0.20, 'ai-integration': 0.45, 'ai-evaluation': 0.40, 'system-design': 0.35, 'cloud-deployment': 0.55, testing: 0.30, docker: 0.40, kubernetes: 0.45, 'data-pipelines': 0.25 },
  },
  'data-engineering': {
    '2026-Q3': { python: 0.30, sql: 0.40, databases: 0.45, kubernetes: 0.15, 'data-pipelines': 0.80, 'rest-apis': 0.05, 'backend-projects': 0.02, 'ai-integration': 0.05, 'system-design': 0.08, 'cloud-deployment': 0.10, testing: 0.08, docker: 0.10 },
  },
};

async function main() {
  await client.connect();
  await client.query('BEGIN');

  // Idempotent for local re-seeding during development: clears prior seed
  // output before repopulating (skills/roles are upserted by slug above this
  // point... actually below -- ordering matters, see the TRUNCATE placement).
  await client.query(`TRUNCATE opportunities, evidence_items, positioning_snapshots, career_directions,
    market_snapshots, market_signals, role_evolutions, skill_trends, skill_combinations,
    future_gaps, career_scenarios, career_experiments, market_insights RESTART IDENTITY CASCADE`);

  const skillIdBySlug = new Map<string, string>();
  for (const s of SKILLS) {
    const { rows } = await client.query(
      `INSERT INTO skills (slug, name, category, ai_leverage) VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, ai_leverage = EXCLUDED.ai_leverage
       RETURNING id`,
      [s.slug, s.name, s.category, s.aiLeverage]
    );
    skillIdBySlug.set(s.slug, rows[0].id);
  }

  const roleIdBySlug = new Map<string, string>();
  for (const r of ROLES) {
    const { rows } = await client.query(
      `INSERT INTO roles (slug, title, category) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category RETURNING id`,
      [r.slug, r.title, r.category]
    );
    roleIdBySlug.set(r.slug, rows[0].id);
  }

  // Opportunities: for each role/period/skill-frequency, synthesize N
  // opportunities and probabilistically attach required_skills so the
  // aggregate frequency lands close to the target. 40 postings/period gives
  // a comfortably-sized sample (>=25) for HIGH confidence once source
  // quality/recency/agreement are folded in (see src/lib/confidence.ts).
  const POSTINGS_PER_PERIOD = 150;
  let seedRand = 42; // simple deterministic PRNG so re-seeding is reproducible
  function rand(): number {
    seedRand = (seedRand * 1103515245 + 12345) % 2147483648;
    return seedRand / 2147483648;
  }
  function periodMidpoint(period: string): Date {
    const [y, q] = period.split('-Q').map(Number);
    return new Date(Date.UTC(y, (q - 1) * 3 + 1, 15)); // middle month of the quarter
  }

  for (const [roleSlug, periods] of Object.entries(SNAPSHOTS)) {
    const roleId = roleIdBySlug.get(roleSlug)!;
    for (const [period, freqs] of Object.entries(periods)) {
      const postedAt = periodMidpoint(period);
      for (let i = 0; i < POSTINGS_PER_PERIOD; i++) {
        const requiredSlugs = Object.entries(freqs).filter(([, freq]) => rand() < freq).map(([slug]) => slug);
        await client.query(
          `INSERT INTO opportunities (role_id, company_name, required_skills, posted_at) VALUES ($1,$2,$3::jsonb,$4)`,
          [roleId, `Company ${roleSlug}-${period}-${i}`, JSON.stringify(requiredSlugs), postedAt]
        );
      }
    }
  }

  // Student 1: has an active target role (main walkthrough).
  const { rows: s1 } = await client.query(
    `INSERT INTO students (full_name, email) VALUES ('Aditi Sharma','aditi.sharma@example.edu')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`
  );
  const student1 = s1[0].id;
  await client.query(
    `INSERT INTO career_directions (student_id, target_role_id, priority, status) VALUES ($1,$2,1,'ACTIVE')`,
    [student1, roleIdBySlug.get('ai-backend-engineering')]
  );

  const student1Evidence: [string, number, boolean, string][] = [
    ['python', 0.90, true, 'Capstone REST service in Python'],
    ['sql', 0.65, true, 'Normalized schema design exercise'],
    ['rest-apis', 0.85, true, 'Public API for capstone project'],
    ['databases', 0.80, true, 'Postgres schema + query optimization assessment'],
    ['backend-projects', 0.75, true, 'Course backend project, verified'],
    ['docker', 0.30, true, 'Dockerized the capstone service'],
  ];
  for (const [slug, strength, verified, title] of student1Evidence) {
    await client.query(
      `INSERT INTO evidence_items (student_id, skill_id, evidence_type, strength, verified, title)
       VALUES ($1,$2,'PROJECT',$3,$4,$5)`,
      [student1, skillIdBySlug.get(slug), strength, verified, title]
    );
  }
  await client.query(
    `INSERT INTO positioning_snapshots (student_id, headline, differentiators) VALUES ($1,$2,$3::jsonb)`,
    [student1, 'Backend-focused engineer building toward AI-integrated systems', JSON.stringify(['python', 'rest-apis', 'databases'])]
  );

  // Student 2: no active target role (discovery-mode walkthrough), evidence
  // that overlaps meaningfully with data-engineering.
  const { rows: s2 } = await client.query(
    `INSERT INTO students (full_name, email) VALUES ('Rahul Verma','rahul.verma@example.edu')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id`
  );
  const student2 = s2[0].id;
  const student2Evidence: [string, number, boolean, string][] = [
    ['sql', 0.70, true, 'Data warehouse coursework'],
    ['databases', 0.60, true, 'ETL pipeline assignment'],
    ['data-pipelines', 0.55, false, 'Personal Airflow project (unverified)'],
  ];
  for (const [slug, strength, verified, title] of student2Evidence) {
    await client.query(
      `INSERT INTO evidence_items (student_id, skill_id, evidence_type, strength, verified, title)
       VALUES ($1,$2,'PROJECT',$3,$4,$5)`,
      [student2, skillIdBySlug.get(slug), strength, verified, title]
    );
  }

  await client.query('COMMIT');
  console.log('seed complete');
  console.log('STUDENT_1_ID (has target role):', student1);
  console.log('STUDENT_2_ID (discovery mode):', student2);
  console.log('ROLE_AI_BACKEND_ID:', roleIdBySlug.get('ai-backend-engineering'));
  console.log('ROLE_BACKEND_ID:', roleIdBySlug.get('backend-engineering'));
  console.log('ROLE_APPLIED_AI_ID:', roleIdBySlug.get('applied-ai-engineer'));
  console.log('ROLE_AI_PLATFORM_ID:', roleIdBySlug.get('ai-platform-engineer'));
  console.log('ROLE_DATA_ENG_ID:', roleIdBySlug.get('data-engineering'));

  await client.end();
}

main().catch(async (err) => {
  console.error('seed failed:', err);
  await client.query('ROLLBACK').catch(() => {});
  process.exit(1);
});
