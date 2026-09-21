import { createDb, runMigrations, resetDb } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';

const db = createDb();
resetDb(db);
runMigrations(db);
seed(db);
console.log('Seed complete ->', process.env.DATABASE_PATH || './data/codeforge.db');
