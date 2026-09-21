import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
import { computeAndStoreSkillTrends, getSkillTrendsForRole } from '../../src/services/skillTrend.service';
import { computeAndStoreRoleEvolution } from '../../src/services/roleEvolution.service';
import { computeAndStoreFutureGaps } from '../../src/services/futureGap.service';
import { computeCareerBranching } from '../../src/services/careerPaths.service';

const pool = new Pool({
  host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE,
  user: process.env.MIGRATE_PGUSER, password: process.env.MIGRATE_PGPASSWORD,
});

async function main() {
  const client = await pool.connect();
  const { rows: roleRows } = await client.query(`SELECT id, title FROM roles WHERE slug = 'ai-backend-engineering'`);
  const roleId = roleRows[0].id;
  const roleTitle = roleRows[0].title;
  const { rows: studentRows } = await client.query(`SELECT id FROM students WHERE email = 'aditi.sharma@example.edu'`);
  const studentId = studentRows[0].id;

  console.log('=== computing skill trends ===');
  await computeAndStoreSkillTrends(client, roleId, '2026-Q3');
  const trends = await getSkillTrendsForRole(client, roleId, '2026-Q3');
  for (const t of trends) console.log(`${t.skillName}: ${t.classification} (confidence=${t.meta.confidence}) -- ${t.whyItMatters}`);

  console.log('\n=== computing role evolution ===');
  const evolution = await computeAndStoreRoleEvolution(client, roleId, roleTitle, '2026-Q3');
  console.log(JSON.stringify(evolution, null, 2));

  console.log('\n=== computing future gaps ===');
  const gaps = await computeAndStoreFutureGaps(client, studentId, roleId, roleTitle, '2026-Q3');
  for (const g of gaps) console.log(`${g.skillName}: ${g.severity} (confidence=${g.meta.confidence})\n  explanation: ${g.explanation}\n  action: ${g.recommendedAction}`);

  console.log('\n=== computing career branching ===');
  const branches = await computeCareerBranching(client, studentId, roleId, roleTitle, '2026-Q3');
  for (const b of branches) console.log(`${b.category}: ${b.roleTitle} -- ${b.whyItFits}`);

  client.release();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
