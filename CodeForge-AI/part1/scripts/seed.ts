import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { loadSeed } from '../src/seed/loadSeed.js';
import { domains, families, roles, competencies, skills, technologies, skillPrerequisites } from '../src/seed/data.js';

const DB_PATH = path.join(process.cwd(), 'data', 'codeforge.db');

function main(): void {
  const db = openDatabase({ file: DB_PATH, fresh: true });
  loadSeed(db);

  console.log(`Seeded ${DB_PATH}`);
  console.log(`  career domains: ${domains.length}`);
  console.log(`  role families: ${families.length}`);
  console.log(`  roles: ${roles.length} (${roles.filter((r) => r.status === 'ACTIVE').length} active)`);
  console.log(`  competencies: ${competencies.length}`);
  console.log(`  skills: ${skills.length}`);
  console.log(`  technologies: ${technologies.length}`);
  console.log(`  skill prerequisites: ${skillPrerequisites.length}`);
  console.log('Run "npm run validate" for a full integrity report.');

  db.close();
}

main();
